function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromKey(key) {
  return new Date(`${key}T00:00:00+08:00`);
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function clampDate(date) {
  if (date < startDate) return new Date(startDate);
  if (date > endDate) return new Date(endDate);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getPhase(key) {
  return phases.find(phase => key >= phase.start && key <= phase.end) || phases[0];
}

function loadState() {
  let raw = localStorage.getItem(storageKey);
  if (!raw) {
    for (const key of oldStorageKeys) {
      raw = localStorage.getItem(key);
      if (raw) break;
    }
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function normalizeStudyTimerSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments
    .map(segment => ({
      start: Number(segment?.start || 0),
      end: Number(segment?.end || 0)
    }))
    .filter(segment => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start);
}

function loadStudyTimer() {
  try {
    const raw = localStorage.getItem(studyTimerStorageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      elapsedMs: Math.max(0, Number(parsed.elapsedMs || 0)),
      startedAt: parsed.startedAt ? Number(parsed.startedAt) : null,
      sessionStartedAt: parsed.sessionStartedAt ? Number(parsed.sessionStartedAt) : null,
      running: Boolean(parsed.running && parsed.startedAt),
      segments: normalizeStudyTimerSegments(parsed.segments),
      subject: subjectOrder.includes(parsed.subject) ? parsed.subject : "cs",
      label: typeof parsed.label === "string" && parsed.label.trim() ? parsed.label.trim() : timerDefaultLabel,
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 3) : []
    };
  } catch {
    return { elapsedMs: 0, startedAt: null, sessionStartedAt: null, running: false, segments: [], subject: "cs", label: timerDefaultLabel, history: [] };
  }
}

function saveStudyTimer() {
  localStorage.setItem(studyTimerStorageKey, JSON.stringify(studyTimer));
}

function currentStudyTimerMs(now = Date.now()) {
  if (!studyTimer.running || !studyTimer.startedAt) return studyTimer.elapsedMs;
  return studyTimer.elapsedMs + Math.max(0, now - studyTimer.startedAt);
}

function formatStudyTimer(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatStudyTimerDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function roundHour(value) {
  return Number((Math.round(Number(value || 0) * 10) / 10).toFixed(1));
}

function studyTimerLabelOptions(subject) {
  const labels = new Set([timerDefaultLabel]);
  const meta = ensureMeta();
  Object.values(meta.hourBreakdowns || {}).forEach(group => {
    const items = group && group[subject];
    if (!Array.isArray(items)) return;
    items.forEach(item => {
      const label = typeof item.label === "string" ? item.label.trim() : "";
      if (label && label !== "未命名") labels.add(label);
    });
  });
  (meta.studySessions || []).forEach(item => {
    if (item.subject !== subject) return;
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (label && label !== "未命名") labels.add(label);
  });
  return Array.from(labels);
}

function syncStudyTimerSelection() {
  if (!subjectOrder.includes(studyTimer.subject)) studyTimer.subject = "cs";
  const labels = studyTimerLabelOptions(studyTimer.subject);
  if (!labels.includes(studyTimer.label)) studyTimer.label = timerDefaultLabel;
  return labels;
}

function timestampDateKey(ms) {
  return dateKey(new Date(ms));
}

function nextDayStartMs(ms) {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

function segmentCrossesDay(startMs, endMs) {
  if (endMs <= startMs) return false;
  return timestampDateKey(startMs) !== timestampDateKey(endMs - 1);
}

function allocationDateForFullTimerUnit(startMs, endMs) {
  if (!segmentCrossesDay(startMs, endMs)) return timestampDateKey(startMs);
  const boundary = nextDayStartMs(startMs);
  const beforeMidnight = Math.max(0, boundary - startMs);
  const afterMidnight = Math.max(0, endMs - boundary);
  return beforeMidnight >= afterMidnight ? timestampDateKey(startMs) : timestampDateKey(endMs - 1);
}

function timerAllocationsByDate(startMs, endMs) {
  const durationMs = Math.max(0, endMs - startMs);
  const fullUnits = Math.floor(durationMs / timerUnitMs);
  const remainderMs = durationMs - fullUnits * timerUnitMs;
  const allocations = {};
  const addUnit = key => {
    if (key < dateKey(startDate) || key > dateKey(endDate)) return;
    allocations[key] = (allocations[key] || 0) + 1;
  };

  for (let index = 0; index < fullUnits; index += 1) {
    const unitStart = startMs + index * timerUnitMs;
    addUnit(allocationDateForFullTimerUnit(unitStart, unitStart + timerUnitMs));
  }

  const remainderStart = startMs + fullUnits * timerUnitMs;
  if (fullUnits === 0) {
    if (segmentCrossesDay(remainderStart, endMs) && remainderMs > timerRoundUpMs) addUnit(timestampDateKey(remainderStart));
    return allocations;
  }
  if (remainderMs > timerRoundUpMs) {
    addUnit(timestampDateKey(remainderStart));
  }
  return allocations;
}

function studyTimerSegmentsForSettlement(finishedAtMs, durationMs) {
  const segments = normalizeStudyTimerSegments(studyTimer.segments);
  if (studyTimer.running && studyTimer.startedAt) {
    segments.push({ start: Number(studyTimer.startedAt), end: finishedAtMs });
  }
  const coveredMs = segments.reduce((sum, segment) => sum + segment.end - segment.start, 0);
  const missingMs = Math.max(0, durationMs - coveredMs);
  if (missingMs > 1000) {
    const fallbackEnd = segments.length ? Math.min(...segments.map(segment => segment.start)) : finishedAtMs;
    segments.unshift({ start: fallbackEnd - missingMs, end: fallbackEnd });
  }
  return segments;
}

function addHoursToDayBreakdown(key, subject, label, hours) {
  const normalizedLabel = (label || timerDefaultLabel).trim() || timerDefaultLabel;
  if (normalizedLabel === timerDefaultLabel) return;
  const range = { start: fromKey(key), end: fromKey(key) };
  const items = ensureHourBreakdown("day", range, subject);
  let item = items.find(entry => (entry.label || "").trim() === normalizedLabel);
  if (!item) {
    item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label: normalizedLabel,
      hours: 0
    };
    items.push(item);
  }
  item.hours = roundHour(Number(item.hours || 0) + hours);
}

function removeHoursFromDayBreakdown(key, subject, label, hours) {
  const normalizedLabel = (label || timerDefaultLabel).trim() || timerDefaultLabel;
  if (normalizedLabel === timerDefaultLabel) return;
  const range = { start: fromKey(key), end: fromKey(key) };
  const items = ensureHourBreakdown("day", range, subject);
  const index = items.findIndex(entry => (entry.label || "").trim() === normalizedLabel);
  if (index < 0) return;
  items[index].hours = roundHour(Number(items[index].hours || 0) - hours);
  if (items[index].hours <= 0) items.splice(index, 1);
}

function adjustDaySubjectHours(key, subject, hours) {
  const day = ensureDay(key);
  const nextHours = roundHour(Number(day.hours[subject] || 0) + hours);
  day.hours[subject] = nextHours > 0 ? nextHours : 0;
}

function studySessionAllocations(startMs, endMs) {
  return timerAllocationsByDate(startMs, endMs);
}

function studySessionRecordedHours(record) {
  const allocations = record.allocations || studySessionAllocations(Number(record.startMs), Number(record.endMs));
  return roundHour(Object.values(allocations).reduce((sum, units) => sum + Number(units || 0) * hourInputStep, 0));
}

function buildStudySession({ id, subject, label, startMs, endMs, source }) {
  const normalizedSubject = subjectOrder.includes(subject) ? subject : "cs";
  const normalizedLabel = (label || timerDefaultLabel).trim() || timerDefaultLabel;
  const start = Number(startMs);
  const end = Number(endMs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const allocations = studySessionAllocations(start, end);
  const recordedHours = roundHour(Object.values(allocations).reduce((sum, units) => sum + Number(units || 0) * hourInputStep, 0));
  if (recordedHours <= 0) return null;
  return {
    id: id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    subject: normalizedSubject,
    label: normalizedLabel,
    startMs: start,
    endMs: end,
    source: source || "manual",
    allocations,
    recordedHours
  };
}

function applyStudySession(record, direction = 1) {
  const allocations = record.allocations || studySessionAllocations(Number(record.startMs), Number(record.endMs));
  Object.entries(allocations).forEach(([key, units]) => {
    const hours = roundHour(Number(units || 0) * hourInputStep * direction);
    if (!hours) return;
    adjustDaySubjectHours(key, record.subject, hours);
    if (direction > 0) addHoursToDayBreakdown(key, record.subject, record.label, hours);
    if (direction < 0) removeHoursFromDayBreakdown(key, record.subject, record.label, Math.abs(hours));
  });
}

function addStudySession(attrs) {
  const record = buildStudySession(attrs);
  if (!record) return 0;
  applyStudySession(record, 1);
  ensureMeta().studySessions.unshift(record);
  return record.recordedHours;
}

function applyStudyTimerToState(segments, subject, label) {
  let recordedHours = 0;
  segments.forEach(segment => {
    recordedHours = roundHour(recordedHours + addStudySession({
      subject,
      label,
      startMs: segment.start,
      endMs: segment.end,
      source: "timer"
    }));
  });
  return recordedHours;
}
