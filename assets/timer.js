function renderStudyTimer() {
  const display = document.getElementById("studyTimerDisplay");
  const startButton = document.getElementById("studyTimerStart");
  const pauseButton = document.getElementById("studyTimerPause");
  const subjectSelect = document.getElementById("studyTimerSubject");
  const labelSelect = document.getElementById("studyTimerLabel");
  const history = document.getElementById("studyTimerHistory");
  if (!display || !startButton || !pauseButton || !subjectSelect || !labelSelect || !history) return;

  const labels = syncStudyTimerSelection();
  const durationMs = currentStudyTimerMs();
  const selectionLocked = studyTimer.running || durationMs > 0;
  display.textContent = formatStudyTimer(durationMs);
  subjectSelect.innerHTML = subjectOrder.map(subject => `<option value="${subject}">${subjects[subject]}</option>`).join("");
  subjectSelect.value = studyTimer.subject;
  subjectSelect.disabled = selectionLocked;
  labelSelect.innerHTML = labels.map(label => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join("");
  labelSelect.value = studyTimer.label;
  labelSelect.disabled = selectionLocked;
  startButton.textContent = studyTimer.running ? "继续中" : "开始";
  startButton.disabled = studyTimer.running;
  pauseButton.disabled = !studyTimer.running;
  history.innerHTML = studyTimer.history.length ? studyTimer.history.map(item => `
    <div class="study-history-row">
      <div>
        <b>${formatStudyTimer(item.durationMs)}</b>
        <span>${formatStudyTimerDate(item.finishedAt)} · ${subjects[item.subject] || ""} · ${escapeHtml(item.label || timerDefaultLabel)} · ${Number(item.recordedHours || 0) > 0 ? `记 ${formatHour(item.recordedHours)}h` : "未计入"}</span>
      </div>
      <button class="study-history-delete" type="button" data-study-history-delete="${item.id}" title="删除">×</button>
    </div>
  `).join("") : '<div class="study-history-empty">暂无计时记录</div>';

  subjectSelect.onchange = () => {
    studyTimer.subject = subjectSelect.value;
    studyTimer.label = timerDefaultLabel;
    saveStudyTimer();
    renderStudyTimer();
  };
  labelSelect.onchange = () => {
    studyTimer.label = labelSelect.value || timerDefaultLabel;
    saveStudyTimer();
    renderStudyTimer();
  };

  document.querySelectorAll("[data-study-history-delete]").forEach(button => {
    button.addEventListener("click", () => {
      studyTimer.history = studyTimer.history.filter(item => item.id !== button.dataset.studyHistoryDelete);
      saveStudyTimer();
      renderStudyTimer();
    });
  });
}

function startStudyTimerTick() {
  window.clearInterval(studyTimerInterval);
  if (!studyTimer.running) return;
  studyTimerInterval = window.setInterval(renderStudyTimer, 1000);
}

function openStudyTimer() {
  const panel = document.getElementById("studyTimerPanel");
  if (!panel) return;
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  renderStudyTimer();
}

function closeStudyTimer() {
  const panel = document.getElementById("studyTimerPanel");
  if (!panel) return;
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
}

function startStudyTimer() {
  if (studyTimer.running) return;
  if (!guardEdit()) return;
  const now = Date.now();
  syncStudyTimerSelection();
  if (currentStudyTimerMs(now) <= 0) {
    studyTimer.segments = [];
    studyTimer.sessionStartedAt = now;
  } else if (!studyTimer.sessionStartedAt) {
    studyTimer.sessionStartedAt = now - currentStudyTimerMs(now);
  }
  studyTimer.running = true;
  studyTimer.startedAt = now;
  saveStudyTimer();
  renderStudyTimer();
  startStudyTimerTick();
}

function pauseStudyTimer() {
  if (!studyTimer.running) return;
  const now = Date.now();
  studyTimer.elapsedMs = currentStudyTimerMs(now);
  studyTimer.segments = normalizeStudyTimerSegments(studyTimer.segments);
  if (studyTimer.startedAt && now > studyTimer.startedAt) {
    studyTimer.segments.push({ start: Number(studyTimer.startedAt), end: now });
  }
  studyTimer.running = false;
  studyTimer.startedAt = null;
  saveStudyTimer();
  renderStudyTimer();
  startStudyTimerTick();
}

function resetStudyTimer() {
  const finishedAtMs = Date.now();
  const durationMs = currentStudyTimerMs(finishedAtMs);
  let recordedHours = 0;
  if (durationMs >= 1000) {
    if (!guardEdit()) return;
    const subject = subjectOrder.includes(studyTimer.subject) ? studyTimer.subject : "cs";
    const label = studyTimer.label || timerDefaultLabel;
    const segments = studyTimerSegmentsForSettlement(finishedAtMs, durationMs);
    recordedHours = applyStudyTimerToState(segments, subject, label);
    if (recordedHours > 0) saveState();
    studyTimer.history = [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        durationMs,
        finishedAt: new Date(finishedAtMs).toISOString(),
        subject,
        label,
        recordedHours
      },
      ...studyTimer.history
    ].slice(0, 3);
  }
  studyTimer.elapsedMs = 0;
  studyTimer.running = false;
  studyTimer.startedAt = null;
  studyTimer.sessionStartedAt = null;
  studyTimer.segments = [];
  saveStudyTimer();
  renderStudyTimer();
  startStudyTimerTick();
  if (recordedHours > 0) renderAll();
}
