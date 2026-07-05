function ensureDay(key) {
  if (!state[key]) {
    state[key] = { tasks: {}, hours: {}, issues: {}, issueChecks: {}, review: "", fix: "", completedAt: "" };
  }
  const day = state[key];
  if (!day.tasks) day.tasks = {};
  if (!day.hours) day.hours = {};
  if (!day.issues) day.issues = {};
  if (!day.issueChecks) day.issueChecks = {};
  if (typeof day.review !== "string") day.review = "";
  if (typeof day.fix !== "string") day.fix = "";
  if (typeof day.completedAt !== "string") day.completedAt = "";
  if (day.review.trim() && !issueCategoryOrder.some(categoryKey => String(day.issues[categoryKey] || "").trim())) {
    day.issues.cs_data = day.review;
  }
  subjectOrder.forEach(subject => {
    const legacyText = typeof day.issues[subject] === "string" ? day.issues[subject].trim() : "";
    const targetCategory = legacyIssueCategory[subject];
    const categoryHasText = issueCategories
      .filter(category => category.subject === subject)
      .some(category => String(day.issues[category.key] || "").trim().length > 0);
    if (legacyText && targetCategory && !categoryHasText) day.issues[targetCategory] = day.issues[subject];
  });
  issueCategoryOrder.forEach(categoryKey => {
    if (typeof day.issues[categoryKey] !== "string") day.issues[categoryKey] = "";
    if (!day.issueChecks[categoryKey]) day.issueChecks[categoryKey] = {};
    issueChecks.forEach(([checkKey]) => {
      if (typeof day.issueChecks[categoryKey][checkKey] !== "boolean") day.issueChecks[categoryKey][checkKey] = false;
    });
  });
  return day;
}

function issueCategoriesForSubject(subject) {
  return issueCategories.filter(category => category.subject === subject);
}

function issueCategoriesForSubjects(activeSubjects) {
  return activeSubjects.flatMap(subject => issueCategoriesForSubject(subject));
}

function firstIssueCategoryForSubject(subject) {
  return issueCategoriesForSubject(subject)[0]?.key || subject;
}

function ensureDailyIssueSelection(activeSubjects) {
  if (!activeSubjects.includes(selectedDailyIssueSubject)) {
    selectedDailyIssueSubject = activeSubjects[0] || "cs";
  }
  const categories = issueCategoriesForSubject(selectedDailyIssueSubject);
  const selectedCategory = selectedDailyIssueCategoryBySubject[selectedDailyIssueSubject];
  if (!categories.some(category => category.key === selectedCategory)) {
    selectedDailyIssueCategoryBySubject[selectedDailyIssueSubject] = firstIssueCategoryForSubject(selectedDailyIssueSubject);
  }
  return selectedDailyIssueCategoryBySubject[selectedDailyIssueSubject];
}

function issueCountForCategory(categoryKey) {
  let count = 0;
  for (let current = new Date(startDate); current <= endDate; current = addDays(current, 1)) {
    if (hasSubjectIssue(dateKey(current), categoryKey)) count += 1;
  }
  return count;
}

function issueCountForSubject(subject) {
  return issueCategoriesForSubject(subject).reduce((sum, category) => sum + issueCountForCategory(category.key), 0);
}

function issueCategoryName(categoryKey) {
  const category = issueCategoryMap[categoryKey];
  if (!category) return subjects[categoryKey] || categoryKey;
  return category.group ? `${category.group} · ${category.label}` : category.label;
}

function activeSubjectsFor(key) {
  return getPhase(key).activeSubjects;
}

function dayDone(key) {
  const day = ensureDay(key);
  return activeSubjectsFor(key).every(subject => day.tasks[subject]);
}

function hasIssue(key) {
  const day = ensureDay(key);
  return issueCategoryOrder.some(categoryKey => day.issues[categoryKey].trim().length > 0);
}

function hasSubjectIssue(key, categoryKey) {
  return ensureDay(key).issues[categoryKey].trim().length > 0;
}

function allIssuesMastered(key) {
  const day = ensureDay(key);
  const issueSubjects = issueCategoryOrder.filter(categoryKey => day.issues[categoryKey].trim().length > 0);
  return issueSubjects.length > 0 && issueSubjects.every(categoryKey => day.issueChecks[categoryKey].mastered);
}

function dayStatus(key) {
  const todayKey = dateKey(new Date());
  if (dayDone(key)) {
    const completedAt = ensureDay(key).completedAt || key;
    return completedAt > key ? "late" : "done";
  }
  return key < todayKey ? "missed" : "open";
}

function completionRateForPhase(phaseName, subject) {
  const phase = phases.find(item => item.name === phaseName);
  if (!phase || !phase.activeSubjects.includes(subject)) return 0;
  let total = 0;
  let done = 0;
  for (let current = fromKey(phase.start); current <= fromKey(phase.end); current = addDays(current, 1)) {
    const key = dateKey(current);
    total += 1;
    if (ensureDay(key).tasks[subject]) done += 1;
  }
  return total ? Math.round(done / total * 100) : 0;
}

function completionForFirstRoundSegment(subject, segment) {
  const phase = phases[0];
  let total = 0;
  let done = 0;
  for (let index = segment.start; index <= segment.end; index++) {
    const key = dateKey(addDays(fromKey(phase.start), index));
    total += 1;
    if (ensureDay(key).tasks[subject]) done += 1;
  }
  return {
    done,
    total,
    rate: total ? Math.round(done / total * 100) : 0
  };
}

function renderSubProgress(subject) {
  return firstRoundProgressSegments[subject].map(segment => {
    const progress = completionForFirstRoundSegment(subject, segment);
    return `
      <div class="sub-progress-item">
        <div class="sub-progress-top">
          <strong>${segment.label}</strong>
          <span>${progress.done}/${progress.total} 天 · ${progress.rate}%</span>
        </div>
        <div class="sub-progress-bar">
          <span style="width:${progress.rate}%;background:${segment.color}"></span>
        </div>
      </div>
    `;
  }).join("");
}

function englishNewWordsForDay(dayNumber) {
  if (dayNumber >= 1 && dayNumber <= 20) return 220;
  if (dayNumber >= 21 && dayNumber <= 40) return 180;
  if (dayNumber >= 41 && dayNumber <= 50) return 140;
  if (dayNumber >= 51 && dayNumber <= 58) return 75;
  return 0;
}

function englishWordsThrough(dayNumber) {
  let total = 0;
  for (let day = 1; day <= dayNumber; day++) total += englishNewWordsForDay(day);
  return total;
}

function englishReviewWordsDue(dayNumber, offset) {
  const sourceDay = dayNumber - offset;
  return sourceDay >= 1 ? englishNewWordsForDay(sourceDay) : 0;
}

function englishTaskTextForDate(key) {
  const index = firstRoundDayIndex(key);
  if (index < 0) return getPhase(key).tasks.english;
  const dayNumber = index + 1;
  const newWords = englishNewWordsForDay(dayNumber);
  const cumulative = englishWordsThrough(dayNumber);
  const reviews = englishReviewOffsets
    .filter(item => item.offset > 0)
    .map(item => {
      const sourceDay = dayNumber - item.offset;
      const words = englishReviewWordsDue(dayNumber, item.offset);
      return words > 0 ? `${item.label} Day ${sourceDay}（${words}词）` : "";
    })
    .filter(Boolean);
  const reviewText = reviews.length ? `复习：${reviews.join("；")}；` : "复习：当日晚间回看今日新词；";
  return `英语一轮 Day ${dayNumber}：新背 ${newWords} 词，累计 ${cumulative}/10000 词；${reviewText}整理错词和模糊词。`;
}

function englishProgressForPass(offset) {
  let done = 0;
  let total = 0;
  for (let day = 1; day <= 58; day++) {
    const words = offset === 0 ? englishNewWordsForDay(day) : englishReviewWordsDue(day, offset);
    if (!words) continue;
    total += words;
    const key = dateKey(addDays(fromKey(phases[0].start), day - 1));
    if (ensureDay(key).tasks.english) done += words;
  }
  return {
    done,
    total,
    rate: total ? Math.round(done / total * 100) : 0
  };
}

function renderEnglishWordProgress() {
  return englishReviewOffsets.map(item => {
    const progress = englishProgressForPass(item.offset);
    return `
      <div class="sub-progress-item">
        <div class="sub-progress-top">
          <strong>${item.label}</strong>
          <span>${progress.done}/${progress.total} 词 · ${progress.rate}%</span>
        </div>
        <div class="sub-progress-bar">
          <span style="width:${progress.rate}%;background:${item.color}"></span>
        </div>
      </div>
    `;
  }).join("");
}

function sumHoursBetween(start, end) {
  const totals = { cs: 0, math: 0, english: 0, politics: 0 };
  for (let current = new Date(start); current <= end; current = addDays(current, 1)) {
    const key = dateKey(current);
    const day = ensureDay(key);
    subjectOrder.forEach(subject => {
      totals[subject] += Number(day.hours[subject] || 0);
    });
  }
  return totals;
}

function renderStats() {
  let totalDays = 0;
  let totalTasks = 0;
  let doneTasks = 0;
  let doneDays = 0;
  let missedDays = 0;
  const todayKey = dateKey(new Date());

  for (let current = new Date(startDate); current <= endDate; current = addDays(current, 1)) {
    const key = dateKey(current);
    const active = activeSubjectsFor(key);
    const day = ensureDay(key);
    totalDays += 1;
    totalTasks += active.length;
    doneTasks += active.filter(subject => day.tasks[subject]).length;
    if (dayDone(key)) doneDays += 1;
    if (key <= todayKey && !dayDone(key)) missedDays += 1;
  }

  const daysLeft = Math.max(0, Math.ceil((examDate - new Date()) / 86400000));
  const overallRate = Math.round(doneTasks / totalTasks * 100);
  document.getElementById("overallRate").textContent = `${overallRate}%`;
  document.getElementById("doneDays").textContent = doneDays;
  document.getElementById("missedDays").textContent = missedDays;
  document.getElementById("daysLeft").textContent = daysLeft;
  document.getElementById("totalDays").textContent = totalDays;

  const todayActive = activeSubjectsFor(todayKey);
  const todayDay = ensureDay(todayKey);
  const todayDone = todayActive.filter(subject => todayDay.tasks[subject]).length;
  const mobileMiniMeta = document.getElementById("mobileMiniMeta");
  const mobileMiniDays = document.getElementById("mobileMiniDays");
  if (mobileMiniMeta) mobileMiniMeta.textContent = `今日 ${todayDone}/${todayActive.length} · 总完成 ${overallRate}%`;
  if (mobileMiniDays) mobileMiniDays.textContent = `距考试 ${daysLeft} 天`;
}

function formatDateTimeInput(ms) {
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function parseDateTimeInput(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function studyRecordLabelOptions(subject, currentLabel) {
  const labels = new Set(studyTimerLabelOptions(subject));
  const label = (currentLabel || timerDefaultLabel).trim() || timerDefaultLabel;
  labels.add(label);
  return Array.from(labels);
}

function studyRecordDateKey(record) {
  return timestampDateKey(Number(record.startMs));
}

function studyRecordMatchesFilter(record, filter = focusedStudyRecordFilter) {
  if (!filter) return false;
  const label = (record.label || timerDefaultLabel).trim() || timerDefaultLabel;
  return record.subject === filter.subject && label === filter.label;
}

function studyRecordFocusText() {
  if (!focusedStudyRecordFilter) return "";
  return `${subjects[focusedStudyRecordFilter.subject]} · ${focusedStudyRecordFilter.label}`;
}

function studyRecordDateSet() {
  return new Set(ensureMeta().studySessions.map(studyRecordDateKey));
}

function renderStudyRecordCalendar() {
  const markedDates = studyRecordDateSet();
  const monthStart = new Date(visibleStudyRecordMonth.getFullYear(), visibleStudyRecordMonth.getMonth(), 1);
  const firstCell = addDays(monthStart, -monthStart.getDay());
  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const date = addDays(firstCell, index);
    const key = dateKey(date);
    const classes = [
      "record-calendar-day",
      date.getMonth() === visibleStudyRecordMonth.getMonth() ? "" : "muted",
      markedDates.has(key) ? "has-record" : "",
      key === selectedStudyRecordDate ? "active" : ""
    ].filter(Boolean).join(" ");
    cells.push(`<button class="${classes}" type="button" data-study-record-date="${key}">${date.getDate()}</button>`);
  }
  return `
    <div class="record-calendar-popover ${studyRecordCalendarClosing ? "closing" : ""}" data-study-record-calendar>
      <div class="record-calendar-head">
        <button type="button" data-record-month="-1" title="上个月">‹</button>
        <strong>${visibleStudyRecordMonth.getFullYear()}年${visibleStudyRecordMonth.getMonth() + 1}月</strong>
        <button type="button" data-record-month="1" title="下个月">›</button>
      </div>
      <div class="record-calendar-week">
        ${["日", "一", "二", "三", "四", "五", "六"].map(day => `<span>${day}</span>`).join("")}
      </div>
      <div class="record-calendar-grid">
        ${cells.join("")}
      </div>
    </div>
  `;
}

function renderStudyRecordLibrary() {
  const allSessions = ensureMeta().studySessions.filter(record => studyRecordDateKey(record) === selectedStudyRecordDate);
  const sessions = focusedStudyRecordFilter
    ? allSessions.filter(record => studyRecordMatchesFilter(record))
    : allSessions;
  return `
    <div class="study-record-library ${studyRecordLibraryClosing ? "closing" : ""}">
      <div class="study-record-head">
        <strong>学习记录库</strong>
        <span class="hint">${selectedStudyRecordDate} · ${focusedStudyRecordFilter ? `筛选 ${sessions.length}/${allSessions.length} 条` : `共 ${sessions.length} 条`}，可修改学科、标签和起止时间</span>
      </div>
      ${focusedStudyRecordFilter ? `
        <div class="study-record-focus-banner">
          <span>已定位到 ${escapeHtml(studyRecordFocusText())}，正在只显示匹配记录</span>
          <button type="button" data-record-focus-clear>显示全部</button>
        </div>
      ` : ""}
      <div class="study-record-list">
        ${sessions.length ? sessions.map(record => {
          const labels = studyRecordLabelOptions(record.subject, record.label);
          return `
            <div class="study-record-row ${studyRecordMatchesFilter(record) ? "focused" : ""}" data-study-record="${record.id}">
              <select data-record-subject="${record.id}" aria-label="学科">
                ${subjectOrder.map(subject => `<option value="${subject}" ${subject === record.subject ? "selected" : ""}>${subjects[subject]}</option>`).join("")}
              </select>
              <select data-record-label="${record.id}" aria-label="标签">
                ${labels.map(label => `<option value="${escapeHtml(label)}" ${label === record.label ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
              </select>
              <div class="study-record-time">
                <input type="datetime-local" value="${formatDateTimeInput(record.startMs)}" data-record-start="${record.id}" aria-label="开始时间">
                <input type="datetime-local" value="${formatDateTimeInput(record.endMs)}" data-record-end="${record.id}" aria-label="结束时间">
              </div>
              <span class="study-record-duration">${formatHour(studySessionRecordedHours(record))}h</span>
              <div>
                <button class="study-record-save" type="button" data-record-save="${record.id}" title="保存">✓</button>
                <button class="study-record-delete" type="button" data-record-delete="${record.id}" title="删除">×</button>
              </div>
            </div>
          `;
        }).join("") : '<div class="empty">这一天还没有通过计时器或手动确认添加的学习记录。</div>'}
      </div>
    </div>
  `;
}

function distributionSubjectSet() {
  selectedDistributionSubjects = new Set(
    Array.from(selectedDistributionSubjects).filter(subject => subjectOrder.includes(subject))
  );
  return selectedDistributionSubjects;
}

function rangeContainsRecordStart(range, record) {
  const key = studyRecordDateKey(record);
  return key >= dateKey(range.start) && key <= dateKey(range.end);
}

function addSessionToDistribution(stats, record) {
  let cursor = Number(record.startMs);
  const end = Number(record.endMs);
  if (!Number.isFinite(cursor) || !Number.isFinite(end) || end <= cursor) return;

  while (cursor < end) {
    const cursorDate = new Date(cursor);
    const nextHour = new Date(cursorDate);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    const next = Math.min(end, nextHour.getTime());
    const minutes = Math.max(0, (next - cursor) / 60000);
    if (minutes > 0) {
      const hour = cursorDate.getHours();
      const weekday = cursorDate.getDay();
      const label = (record.label || timerDefaultLabel).trim() || timerDefaultLabel;
      stats.totalMinutes += minutes;
      stats.hourMinutes[hour] += minutes;
      stats.weekHourMinutes[weekday][hour] += minutes;
      stats.subjectMinutes[record.subject] += minutes;
      stats.labelMinutes.set(label, (stats.labelMinutes.get(label) || 0) + minutes);
      stats.activeDateKeys.add(dateKey(cursorDate));
    }
    cursor = next;
  }
}

function buildStudyDistribution(range) {
  const selectedSubjects = distributionSubjectSet();
  const stats = {
    records: [],
    totalMinutes: 0,
    activeDateKeys: new Set(),
    hourMinutes: Array(24).fill(0),
    weekHourMinutes: Array.from({ length: 7 }, () => Array(24).fill(0)),
    subjectMinutes: Object.fromEntries(subjectOrder.map(subject => [subject, 0])),
    labelMinutes: new Map()
  };

  ensureMeta().studySessions.forEach(record => {
    if (!selectedSubjects.has(record.subject)) return;
    if (!rangeContainsRecordStart(range, record)) return;
    stats.records.push(record);
    addSessionToDistribution(stats, record);
  });

  return stats;
}

function maxArrayValue(values) {
  return values.reduce((max, value) => Math.max(max, Number(value || 0)), 0);
}

function topIndex(values) {
  let bestIndex = 0;
  values.forEach((value, index) => {
    if (value > values[bestIndex]) bestIndex = index;
  });
  return bestIndex;
}

function formatHourRangeLabel(hour) {
  const next = (hour + 1) % 24;
  return `${String(hour).padStart(2, "0")}:00-${String(next).padStart(2, "0")}:00`;
}

function distributionPeriodMinutes(stats) {
  return distributionPeriods.map(period => {
    const minutes = stats.hourMinutes
      .slice(period.start, period.end)
      .reduce((sum, value) => sum + value, 0);
    return { ...period, minutes };
  });
}

function distributionTopLabels(stats) {
  return Array.from(stats.labelMinutes, ([label, minutes]) => ({ label, minutes }))
    .filter(item => item.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);
}

function renderDistributionSummary(stats) {
  const peakHour = topIndex(stats.hourMinutes);
  const periods = distributionPeriodMinutes(stats);
  const peakPeriod = periods.reduce((best, item) => item.minutes > best.minutes ? item : best, periods[0]);
  const topSubject = subjectOrder.reduce((best, subject) => (
    stats.subjectMinutes[subject] > stats.subjectMinutes[best] ? subject : best
  ), subjectOrder[0]);
  const totalHours = stats.totalMinutes / 60;
  return `
    <div class="distribution-summary">
      <div class="distribution-kpi"><span>记录时长</span><b>${formatHour(totalHours)}h</b></div>
      <div class="distribution-kpi"><span>高峰小时</span><b>${stats.totalMinutes ? formatHourRangeLabel(peakHour) : "暂无"}</b></div>
      <div class="distribution-kpi"><span>偏好时段</span><b>${stats.totalMinutes ? peakPeriod.label : "暂无"}</b></div>
      <div class="distribution-kpi"><span>主力学科</span><b>${stats.totalMinutes ? subjects[topSubject] : "暂无"}</b></div>
    </div>
  `;
}

function renderRhythmBars(stats) {
  const max = Math.max(maxArrayValue(stats.hourMinutes), 1);
  return `
    <div class="rhythm-bars" aria-label="24小时学习时间分布">
      ${stats.hourMinutes.map((minutes, hour) => {
        const height = Math.max(4, Math.round(minutes / max * 132));
        return `
          <div class="rhythm-bar" title="${formatHourRangeLabel(hour)} · ${formatHour(minutes / 60)}h">
            <span style="--bar-height:${height}px"></span>
            <em>${hour % 3 === 0 ? hour : ""}</em>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderHeatmap(stats) {
  const max = Math.max(...stats.weekHourMinutes.flat(), 1);
  const hourHead = Array.from({ length: 24 }, (_, hour) => `<span class="heat-hour">${hour % 3 === 0 ? hour : ""}</span>`).join("");
  const rows = stats.weekHourMinutes.map((row, weekday) => `
    <span class="heat-label">${distributionWeekdays[weekday]}</span>
    ${row.map((minutes, hour) => {
      const alpha = (0.08 + minutes / max * 0.72).toFixed(3);
      return `<span class="heat-cell" style="--heat-alpha:${alpha}" title="${distributionWeekdays[weekday]} ${formatHourRangeLabel(hour)} · ${formatHour(minutes / 60)}h"></span>`;
    }).join("")}
  `).join("");
  return `
    <div class="heatmap-scroll">
      <div class="heatmap-grid" aria-label="周内小时热力图">
        <span></span>${hourHead}${rows}
      </div>
    </div>
  `;
}

function renderPeriodList(stats) {
  const periods = distributionPeriodMinutes(stats);
  const max = Math.max(...periods.map(item => item.minutes), 1);
  return `
    <div class="period-list">
      ${periods.map(item => `
        <div class="period-row">
          <span>${item.label}</span>
          <div class="period-track"><span style="width:${Math.round(item.minutes / max * 100)}%"></span></div>
          <b>${formatHour(item.minutes / 60)}h</b>
        </div>
      `).join("")}
    </div>
  `;
}

function renderLabelRank(stats) {
  const labels = distributionTopLabels(stats);
  const max = Math.max(...labels.map(item => item.minutes), 1);
  if (!labels.length) return '<div class="study-distribution-empty">还没有可用于标签排行的学习记录。</div>';
  return `
    <div class="label-rank">
      ${labels.map(item => `
        <div class="label-rank-row">
          <span>${escapeHtml(item.label)}</span>
          <div class="label-rank-track"><span style="width:${Math.round(item.minutes / max * 100)}%"></span></div>
          <b>${formatHour(item.minutes / 60)}h</b>
        </div>
      `).join("")}
    </div>
  `;
}

function renderStudyDistributionPanel(range) {
  const stats = buildStudyDistribution(range);
  const selectedSubjects = distributionSubjectSet();
  return `
    <section class="study-distribution-panel ${studyDistributionClosing ? "closing" : ""}">
      <div class="distribution-head">
        <div>
          <strong>学习时间分布</strong>
          <span class="hint">${dateKey(range.start)} 至 ${dateKey(range.end)} · 来自记录库 ${stats.records.length} 条记录</span>
        </div>
        <div class="distribution-subjects" aria-label="参与统计的科目">
          ${subjectOrder.map(subject => `
            <button class="distribution-subject-toggle ${selectedSubjects.has(subject) ? "active" : ""}" type="button" data-distribution-subject="${subject}" style="--subject-color:${subjectColors[subject]}">${subjects[subject]}</button>
          `).join("")}
          <button class="distribution-all-toggle" type="button" data-distribution-all>全部</button>
        </div>
      </div>
      ${renderDistributionSummary(stats)}
      ${stats.totalMinutes > 0 ? `
        <div class="distribution-grid">
          <article class="distribution-card wide">
            <strong>24 小时节律<span>按实际起止时间切到每个小时</span></strong>
            ${renderRhythmBars(stats)}
          </article>
          <article class="distribution-card wide">
            <strong>周几 × 小时热力<span>颜色越深，学习越集中</span></strong>
            ${renderHeatmap(stats)}
          </article>
          <article class="distribution-card">
            <strong>时段构成<span>凌晨 / 上午 / 下午 / 晚上</span></strong>
            ${renderPeriodList(stats)}
          </article>
          <article class="distribution-card">
            <strong>标签热度<span>按所选科目聚合</span></strong>
            ${renderLabelRank(stats)}
          </article>
        </div>
      ` : '<div class="study-distribution-empty">当前范围和科目下还没有学习记录。先用计时器或手动确认添加记录后，这里会生成分布图。</div>'}
    </section>
  `;
}

function renderSubjectDonut(totals) {
  const total = subjectOrder.reduce((sum, subject) => sum + Math.max(0, Number(totals[subject] || 0)), 0);
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  if (!total) {
    return `
      <svg class="pie-svg" viewBox="0 0 200 200" aria-hidden="true">
        <circle class="pie-empty" cx="100" cy="100" r="${radius}"></circle>
      </svg>
    `;
  }

  let cursor = 0;
  const segments = subjectOrder.map(subject => {
    const value = Math.max(0, Number(totals[subject] || 0));
    if (!value) return "";
    const share = value / total;
    const segmentGap = total === value ? 0 : 10;
    const dash = total === value ? circumference : Math.max(1, circumference * share - segmentGap);
    const gap = Math.max(0, circumference - dash);
    const offset = -cursor * circumference - segmentGap / 2;
    cursor += share;
    return `
      <circle class="pie-segment ${subject === selectedHourSubject ? "active" : ""}" data-pie-segment="${subject}" cx="100" cy="100" r="${radius}" stroke="${subjectColors[subject]}" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${offset}">
        <title>${subjects[subject]} ${formatHour(value)}h</title>
      </circle>
    `;
  }).join("");

  return `
    <svg class="pie-svg" viewBox="0 0 200 200" aria-hidden="true">
      <g transform="rotate(-90 100 100)">
        <circle class="pie-track" cx="100" cy="100" r="${radius}"></circle>
        ${segments}
      </g>
    </svg>
  `;
}

function renderPieSubjectButton(range, totals, totalHours, subject) {
  const hours = Math.max(0, Number(totals[subject] || 0));
  const percent = totalHours > 0 ? Math.round(hours / totalHours * 100) : 0;
  return `
    <button class="pie-subject-button ${subject === selectedHourSubject ? "active" : ""}" data-hour-subject="${subject}" style="--subject-color:${subjectColors[subject]}">
      <span class="pie-subject-main"><i class="hour-color" style="background:${subjectColors[subject]}"></i>${subjects[subject]}</span>
      <span class="pie-subject-meta">${percent}% · ${formatHour(hours)}h</span>
    </button>
  `;
}

function renderHourStats() {
  const range = getHourRange(selectedHourRange);
  const totals = sumHoursBetween(range.start, range.end);
  const totalHours = subjectOrder.reduce((sum, subject) => sum + totals[subject], 0);
  const maxHours = Math.max(...subjectOrder.map(subject => totals[subject]), 1);

  document.getElementById("hourStats").innerHTML = `
    <div class="hour-tools">
      <div class="segmented" aria-label="学习时长范围">
        ${Object.entries(hourRanges).map(([key, label]) => `
          <button class="${key === selectedHourRange ? "active" : ""}" data-hour-range="${key}">${label}</button>
        `).join("")}
      </div>
      <div class="hour-insight-actions">
        <button class="study-distribution-toggle ${studyDistributionOpen && !studyDistributionClosing ? "active" : ""}" type="button" data-study-distribution-toggle>${studyDistributionOpen && !studyDistributionClosing ? "收起时间分布" : "时间分布"}</button>
      </div>
      <div class="record-library-actions">
        <button class="record-date-toggle ${studyRecordCalendarOpen && !studyRecordCalendarClosing ? "active" : ""}" type="button" data-study-record-calendar-toggle>${selectedStudyRecordDate}</button>
        <button class="record-library-toggle ${studyRecordLibraryOpen && !studyRecordLibraryClosing ? "active" : ""}" type="button" data-study-record-toggle>${studyRecordLibraryOpen && !studyRecordLibraryClosing ? "收起记录库" : "学习记录库"}</button>
        ${studyRecordCalendarOpen || studyRecordCalendarClosing ? renderStudyRecordCalendar() : ""}
      </div>
    </div>
    ${studyDistributionOpen || studyDistributionClosing ? renderStudyDistributionPanel(range) : ""}
    ${studyRecordLibraryOpen || studyRecordLibraryClosing ? renderStudyRecordLibrary() : ""}
    <div class="hour-panel" style="margin-top:12px">
      <article class="hour-box">
        <strong>${hourRanges[selectedHourRange]}数据</strong>
        <div class="hint">${dateKey(range.start)} 至 ${dateKey(range.end)}</div>
        ${subjectOrder.map(subject => `
          <div class="hour-line">
            <span><i class="hour-color" style="background:${subjectColors[subject]}"></i>${subjects[subject]}</span>
            <div class="hour-bar"><span style="width:${Math.round(totals[subject] / maxHours * 100)}%;background:${subjectColors[subject]}"></span></div>
            <b>${formatHour(totals[subject])}h</b>
          </div>
        `).join("")}
      </article>
      <article class="pie-card">
        <strong>学科占比</strong>
        <div class="pie-layout">
          <div class="pie-wrap">
            <button class="pie" type="button" data-hour-pie aria-label="查看学科占比明细">
              ${renderSubjectDonut(totals)}
              <div class="pie-total"><span>总计</span><b>${formatHour(totalHours)}</b><span>小时</span></div>
            </button>
            ${activePiePopupSubject ? renderPiePopup(selectedHourRange, range, activePiePopupSubject, totals[activePiePopupSubject]) : ""}
          </div>
          <div class="pie-subjects" aria-label="学科选择">
            ${subjectOrder.map(subject => renderPieSubjectButton(range, totals, totalHours, subject)).join("")}
          </div>
          ${renderHourBreakdownEditor(selectedHourRange, range, selectedHourSubject, totals[selectedHourSubject])}
        </div>
      </article>
    </div>
  `;

  document.querySelectorAll("[data-hour-range]").forEach(button => {
    button.addEventListener("click", () => {
      selectedHourRange = button.dataset.hourRange;
      renderHourStats();
    });
  });
  document.querySelectorAll("[data-hour-subject]").forEach(button => {
    button.addEventListener("click", () => {
      selectedHourSubject = button.dataset.hourSubject;
      editingBreakdownId = null;
      renderHourStats();
    });
  });
  const pie = document.querySelector("[data-hour-pie]");
  if (pie) {
    pie.addEventListener("click", event => {
      const segmentSubject = event.target.closest("[data-pie-segment]")?.dataset.pieSegment;
      const subject = subjectOrder.includes(segmentSubject) ? segmentSubject : subjectFromPieClick(event, totals);
      selectedHourSubject = subject;
      activePiePopupSubject = activePiePopupSubject === subject ? null : subject;
      editingBreakdownId = null;
      renderHourStats();
    });
  }
  attachStudyDistributionEvents();
  attachStudyRecordEvents();
  attachHourBreakdownEvents(range, totals);
}

function openStudyDistributionPanel() {
  studyDistributionOpen = true;
  studyDistributionClosing = false;
  renderHourStats();
}

function closeStudyDistributionPanel() {
  if (!studyDistributionOpen || studyDistributionClosing) return;
  studyDistributionClosing = true;
  renderHourStats();
  window.setTimeout(() => {
    if (!studyDistributionClosing) return;
    studyDistributionOpen = false;
    studyDistributionClosing = false;
    renderHourStats();
  }, statsPanelTransitionMs);
}

function openStudyRecordLibrary() {
  studyRecordLibraryOpen = true;
  studyRecordLibraryClosing = false;
  renderHourStats();
}

function closeStudyRecordLibrary() {
  if (!studyRecordLibraryOpen || studyRecordLibraryClosing) return;
  studyRecordLibraryClosing = true;
  renderHourStats();
  window.setTimeout(() => {
    if (!studyRecordLibraryClosing) return;
    studyRecordLibraryOpen = false;
    studyRecordLibraryClosing = false;
    renderHourStats();
  }, statsPanelTransitionMs);
}

function openStudyRecordCalendar() {
  studyRecordCalendarOpen = true;
  studyRecordCalendarClosing = false;
  visibleStudyRecordMonth = new Date(fromKey(selectedStudyRecordDate).getFullYear(), fromKey(selectedStudyRecordDate).getMonth(), 1);
  renderHourStats();
}

function closeStudyRecordCalendar() {
  if (!studyRecordCalendarOpen || studyRecordCalendarClosing) return;
  studyRecordCalendarClosing = true;
  renderHourStats();
  window.setTimeout(() => {
    if (!studyRecordCalendarClosing) return;
    studyRecordCalendarOpen = false;
    studyRecordCalendarClosing = false;
    renderHourStats();
  }, statsPanelTransitionMs);
}

function attachStudyDistributionEvents() {
  const toggle = document.querySelector("[data-study-distribution-toggle]");
  if (toggle) {
    toggle.addEventListener("click", () => {
      if (studyDistributionOpen && !studyDistributionClosing) closeStudyDistributionPanel();
      else openStudyDistributionPanel();
    });
  }

  document.querySelectorAll("[data-distribution-subject]").forEach(button => {
    button.addEventListener("click", () => {
      const subject = button.dataset.distributionSubject;
      if (!subjectOrder.includes(subject)) return;
      const selected = distributionSubjectSet();
      if (selected.has(subject)) selected.delete(subject);
      else selected.add(subject);
      renderHourStats();
    });
  });

  const allButton = document.querySelector("[data-distribution-all]");
  if (allButton) {
    allButton.addEventListener("click", () => {
      selectedDistributionSubjects = new Set(subjectOrder);
      renderHourStats();
    });
  }
}

function scrollFocusedStudyRecordIntoView() {
  window.setTimeout(() => {
    const target = document.querySelector(".study-record-row.focused") || document.querySelector(".study-record-focus-banner");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 80);
}

function locateStudyRecordsFromBreakdown(subject, label) {
  const normalizedLabel = (label || timerDefaultLabel).trim() || timerDefaultLabel;
  const range = getHourRange(selectedHourRange);
  const sessions = ensureMeta().studySessions.filter(record => (
    record.subject === subject &&
    ((record.label || timerDefaultLabel).trim() || timerDefaultLabel) === normalizedLabel
  ));
  const inRange = sessions.find(record => rangeContainsRecordStart(range, record));
  const target = inRange || sessions[0];
  if (!target) {
    alert("没有找到这条标签对应的学习记录。");
    return;
  }
  focusedStudyRecordFilter = { subject, label: normalizedLabel };
  selectedStudyRecordDate = studyRecordDateKey(target);
  visibleStudyRecordMonth = new Date(fromKey(selectedStudyRecordDate).getFullYear(), fromKey(selectedStudyRecordDate).getMonth(), 1);
  studyRecordLibraryOpen = true;
  studyRecordLibraryClosing = false;
  studyRecordCalendarOpen = false;
  studyRecordCalendarClosing = false;
  renderHourStats();
  scrollFocusedStudyRecordIntoView();
}

function attachStudyRecordEvents() {
  const toggle = document.querySelector("[data-study-record-toggle]");
  if (toggle) {
    toggle.addEventListener("click", () => {
      if (studyRecordLibraryOpen && !studyRecordLibraryClosing) closeStudyRecordLibrary();
      else openStudyRecordLibrary();
    });
  }

  const calendarToggle = document.querySelector("[data-study-record-calendar-toggle]");
  if (calendarToggle) {
    calendarToggle.addEventListener("click", () => {
      if (studyRecordCalendarOpen && !studyRecordCalendarClosing) closeStudyRecordCalendar();
      else openStudyRecordCalendar();
    });
  }

  document.querySelectorAll("[data-record-month]").forEach(button => {
    button.addEventListener("click", () => {
      visibleStudyRecordMonth = new Date(
        visibleStudyRecordMonth.getFullYear(),
        visibleStudyRecordMonth.getMonth() + Number(button.dataset.recordMonth || 0),
        1
      );
      studyRecordCalendarOpen = true;
      studyRecordCalendarClosing = false;
      renderHourStats();
    });
  });

  document.querySelectorAll("[data-study-record-date]").forEach(button => {
    button.addEventListener("click", () => {
      selectedStudyRecordDate = button.dataset.studyRecordDate;
      visibleStudyRecordMonth = new Date(fromKey(selectedStudyRecordDate).getFullYear(), fromKey(selectedStudyRecordDate).getMonth(), 1);
      studyRecordLibraryOpen = true;
      studyRecordLibraryClosing = false;
      studyRecordCalendarOpen = false;
      studyRecordCalendarClosing = false;
      focusedStudyRecordFilter = null;
      renderHourStats();
    });
  });

  const focusClear = document.querySelector("[data-record-focus-clear]");
  if (focusClear) {
    focusClear.addEventListener("click", () => {
      focusedStudyRecordFilter = null;
      renderHourStats();
    });
  }

  document.querySelectorAll("[data-record-subject]").forEach(select => {
    select.addEventListener("change", () => {
      const labelSelect = document.querySelector(`[data-record-label="${select.dataset.recordSubject}"]`);
      if (!labelSelect) return;
      const labels = studyRecordLabelOptions(select.value, timerDefaultLabel);
      labelSelect.innerHTML = labels.map(label => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join("");
      labelSelect.value = timerDefaultLabel;
    });
  });

  document.querySelectorAll("[data-record-save]").forEach(button => {
    button.addEventListener("click", () => {
      if (!guardEdit()) return;
      const id = button.dataset.recordSave;
      const sessions = ensureMeta().studySessions;
      const index = sessions.findIndex(record => record.id === id);
      if (index < 0) return;
      const subject = document.querySelector(`[data-record-subject="${id}"]`)?.value;
      const label = document.querySelector(`[data-record-label="${id}"]`)?.value || timerDefaultLabel;
      const startMs = parseDateTimeInput(document.querySelector(`[data-record-start="${id}"]`)?.value);
      const endMs = parseDateTimeInput(document.querySelector(`[data-record-end="${id}"]`)?.value);
      const nextRecord = buildStudySession({ id, subject, label, startMs, endMs, source: sessions[index].source });
      if (!nextRecord) {
        alert("这条记录的时间不足 6 分钟，或开始/结束时间无效，无法计入统计。");
        return;
      }
      applyStudySession(sessions[index], -1);
      const nextSessions = ensureMeta().studySessions;
      const nextIndex = nextSessions.findIndex(record => record.id === id);
      if (nextIndex < 0) return;
      nextSessions[nextIndex] = nextRecord;
      applyStudySession(nextRecord, 1);
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-record-delete]").forEach(button => {
    button.addEventListener("click", () => {
      if (!guardEdit()) return;
      const id = button.dataset.recordDelete;
      const sessions = ensureMeta().studySessions;
      const index = sessions.findIndex(record => record.id === id);
      if (index < 0) return;
      if (!confirm("确定删除这条学习记录吗？对应的统计时长也会同步扣除。")) return;
      applyStudySession(sessions[index], -1);
      const nextSessions = ensureMeta().studySessions;
      const nextIndex = nextSessions.findIndex(record => record.id === id);
      if (nextIndex >= 0) nextSessions.splice(nextIndex, 1);
      saveState();
      renderAll();
    });
  });
}

function hourBreakdownAllocated(items) {
  return items.reduce((sum, item) => sum + Math.max(0, Number(item.hours || 0)), 0);
}

function normalizeHourBreakdown(items, subjectTotal) {
  let remaining = Math.max(0, Number(subjectTotal || 0));
  items.forEach(item => {
    const nextHours = Math.min(Math.max(0, Number(item.hours || 0)), remaining);
    item.hours = roundHour(nextHours);
    remaining -= nextHours;
  });
}

function aggregateDayBreakdowns(range, subject) {
  const meta = ensureMeta();
  const totals = new Map();
  for (let current = new Date(range.start); current <= range.end; current = addDays(current, 1)) {
    const dayRange = { start: current, end: current };
    const group = meta.hourBreakdowns[hourBreakdownRangeKey("day", dayRange)];
    const items = group && Array.isArray(group[subject]) ? group[subject] : [];
    items.forEach(item => {
      const label = (item.label || "未命名").trim() || "未命名";
      const hours = Math.max(0, Number(item.hours || 0));
      if (hours <= 0) return;
      totals.set(label, roundHour((totals.get(label) || 0) + hours));
    });
  }
  return Array.from(totals, ([label, hours]) => ({ label, hours }));
}

function combineBreakdownRows(rows) {
  const totals = new Map();
  rows.forEach(row => {
    const label = (row.label || "未命名").trim() || "未命名";
    const hours = Math.max(0, Number(row.hours || 0));
    if (hours <= 0) return;
    totals.set(label, roundHour((totals.get(label) || 0) + hours));
  });
  return Array.from(totals, ([label, hours]) => ({ label, hours }));
}

function subjectFromPieClick(event, totals) {
  const total = subjectOrder.reduce((sum, subject) => sum + Math.max(0, Number(totals[subject] || 0)), 0);
  if (!total) return selectedHourSubject;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left - rect.width / 2;
  const y = event.clientY - rect.top - rect.height / 2;
  const angle = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;
  const target = angle / 360 * total;
  let cursor = 0;
  for (const subject of subjectOrder) {
    cursor += Math.max(0, Number(totals[subject] || 0));
    if (target <= cursor) return subject;
  }
  return subjectOrder[subjectOrder.length - 1];
}

function breakdownRowsForDisplay(rangeKey, range, subject, subjectTotal) {
  const items = ensureHourBreakdown(rangeKey, range, subject);
  const timerItems = rangeKey === "day" ? [] : aggregateDayBreakdowns(range, subject);
  normalizeHourBreakdown(timerItems, subjectTotal);
  const timerAllocated = hourBreakdownAllocated(timerItems);
  const manualLimit = Math.max(0, subjectTotal - timerAllocated);
  normalizeHourBreakdown(items, manualLimit);
  const rows = combineBreakdownRows([
    ...timerItems,
    ...items.filter(item => Number(item.hours || 0) > 0).map(item => ({
      label: item.label || "未命名",
      hours: Number(item.hours || 0)
    }))
  ]);
  const otherHours = Math.max(0, subjectTotal - timerAllocated - hourBreakdownAllocated(items));
  if (otherHours > 0 || rows.length === 0) rows.push({ label: "其他", hours: otherHours });
  return rows;
}

function renderPiePopup(rangeKey, range, subject, subjectTotal) {
  const rows = breakdownRowsForDisplay(rangeKey, range, subject, subjectTotal);
  return `
    <div class="pie-popup-card" data-pie-popup>
      <strong>${subjects[subject]}<span>${formatHour(subjectTotal)}h</span></strong>
      <div class="pie-popup-list">
        ${rows.map(row => {
          const percent = subjectTotal > 0 ? Math.round(row.hours / subjectTotal * 100) : 0;
          return `
            <div class="pie-popup-row">
              <span>${escapeHtml(row.label)}</span>
              <b>${formatHour(row.hours)}h · ${percent}%</b>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderHourBreakdownEditor(rangeKey, range, subject, subjectTotal) {
  const items = ensureHourBreakdown(rangeKey, range, subject);
  const timerItems = rangeKey === "day" ? [] : aggregateDayBreakdowns(range, subject);
  normalizeHourBreakdown(timerItems, subjectTotal);
  const timerAllocated = hourBreakdownAllocated(timerItems);
  const manualLimit = Math.max(0, subjectTotal - timerAllocated);
  normalizeHourBreakdown(items, manualLimit);
  const allocated = timerAllocated + hourBreakdownAllocated(items);
  const otherHours = Math.max(0, subjectTotal - allocated);
  const disabledAttr = canEditState() ? "" : "disabled";
  return `
    <div class="hour-breakdown-panel" data-breakdown-panel="${subject}">
      <div class="breakdown-head">
        <strong>${subjects[subject]}拆分</strong>
        <span class="breakdown-total">已分配 ${formatHour(allocated)}h / ${formatHour(subjectTotal)}h</span>
      </div>
      <div class="breakdown-list">
        ${timerItems.map(item => `
          <button class="breakdown-chip locked" type="button" data-breakdown-locate-subject="${subject}" data-breakdown-locate-label="${escapeHtml(item.label)}" title="在学习记录库中定位">
            ${escapeHtml(item.label)} <small>${formatHour(item.hours)}h</small>
          </button>
        `).join("")}
        ${items.map(item => {
          const editing = editingBreakdownId === item.id;
          if (!editing) {
            return `
              <button class="breakdown-chip" type="button" data-breakdown-edit="${item.id}" ${disabledAttr}>
                ${escapeHtml(item.label || "未命名")} <small>${formatHour(item.hours)}h</small>
              </button>
            `;
          }
          return `
            <div class="breakdown-item">
              <input type="text" value="${escapeHtml(item.label)}" placeholder="标签" data-breakdown-label="${item.id}" ${disabledAttr}>
              <input type="number" min="0" step="${hourInputStep}" value="${item.hours || ""}" data-breakdown-hours="${item.id}" ${disabledAttr}>
              <button class="breakdown-confirm" type="button" data-breakdown-confirm="${item.id}" title="确认" ${disabledAttr}>✓</button>
              <button class="breakdown-delete" type="button" data-breakdown-delete="${item.id}" title="删除" ${disabledAttr}>×</button>
            </div>
          `;
        }).join("")}
        <span class="breakdown-other">其他 ${formatHour(otherHours)}h</span>
        <button class="breakdown-add" type="button" data-breakdown-add="${subject}" ${disabledAttr}>＋ 新建标签</button>
      </div>
    </div>
  `;
}

function attachHourBreakdownEvents(range, totals) {
  const items = ensureHourBreakdown(selectedHourRange, range, selectedHourSubject);
  const subjectTotal = totals[selectedHourSubject] || 0;
  const timerItems = selectedHourRange === "day" ? [] : aggregateDayBreakdowns(range, selectedHourSubject);
  normalizeHourBreakdown(timerItems, subjectTotal);
  const manualLimit = Math.max(0, subjectTotal - hourBreakdownAllocated(timerItems));
  normalizeHourBreakdown(items, manualLimit);
  document.querySelectorAll("[data-breakdown-locate-subject]").forEach(button => {
    button.addEventListener("click", () => {
      locateStudyRecordsFromBreakdown(button.dataset.breakdownLocateSubject, button.dataset.breakdownLocateLabel || timerDefaultLabel);
    });
  });
  document.querySelectorAll("[data-breakdown-add]").forEach(button => {
    button.addEventListener("click", () => {
      if (!guardEdit()) return;
      const currentAllocated = hourBreakdownAllocated(items);
      const remaining = Math.max(0, manualLimit - currentAllocated);
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      items.push({
        id,
        label: "",
        hours: Math.min(remaining, hourInputStep)
      });
      editingBreakdownId = id;
      saveState();
      renderHourStats();
    });
  });
  document.querySelectorAll("[data-breakdown-edit]").forEach(button => {
    button.addEventListener("click", () => {
      if (!guardEdit()) return;
      editingBreakdownId = button.dataset.breakdownEdit;
      renderHourStats();
    });
  });
  document.querySelectorAll("[data-breakdown-confirm]").forEach(button => {
    button.addEventListener("click", () => {
      if (!guardEdit()) return;
      const item = items.find(entry => entry.id === button.dataset.breakdownConfirm);
      if (!item) return;
      const row = button.closest(".breakdown-item");
      const labelInput = row?.querySelector("[data-breakdown-label]");
      const hourInput = row?.querySelector("[data-breakdown-hours]");
      const requested = Math.max(0, Number(hourInput?.value || 0));
      const othersTotal = items
        .filter(entry => entry.id !== item.id)
        .reduce((sum, entry) => sum + Math.max(0, Number(entry.hours || 0)), 0);
      item.label = labelInput?.value.trim() || "未命名";
      item.hours = roundHour(Math.min(requested, Math.max(0, manualLimit - othersTotal)));
      editingBreakdownId = null;
      saveState();
      renderHourStats();
    });
  });
  document.querySelectorAll("[data-breakdown-label], [data-breakdown-hours]").forEach(input => {
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      input.closest(".breakdown-item")?.querySelector("[data-breakdown-confirm]")?.click();
    });
  });
  document.querySelectorAll("[data-breakdown-delete]").forEach(button => {
    button.addEventListener("click", () => {
      if (!guardEdit()) return;
      const index = items.findIndex(entry => entry.id === button.dataset.breakdownDelete);
      if (index < 0) return;
      const label = items[index].label?.trim() || "未命名";
      if (!confirm(`确定删除“${label}”这个标签吗？删除后这部分时长会回到“其他”。`)) return;
      items.splice(index, 1);
      if (editingBreakdownId === button.dataset.breakdownDelete) editingBreakdownId = null;
      saveState();
      renderHourStats();
    });
  });
}

function getHourRange(rangeKey) {
  const referenceDate = getHourReferenceDate();
  const weekStart = addDays(referenceDate, referenceDate.getDay() === 0 ? -6 : 1 - referenceDate.getDay());
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const starts = {
    week: weekStart < startDate ? startDate : weekStart,
    month: monthStart < startDate ? startDate : monthStart,
    all: startDate
  };
  return { start: starts[rangeKey], end: referenceDate };
}

function getHourReferenceDate() {
  const candidates = [clampDate(new Date()), selectedDate, latestRecordedHourDate()].filter(Boolean);
  return candidates.reduce((latest, date) => date > latest ? date : latest, startDate);
}

function latestRecordedHourDate() {
  let latest = null;
  Object.entries(state).forEach(([key, day]) => {
    if (key < dateKey(startDate) || key > dateKey(endDate) || !day || !day.hours) return;
    const hasHours = subjectOrder.some(subject => Number(day.hours[subject] || 0) > 0);
    if (!hasHours) return;
    const current = fromKey(key);
    if (!latest || current > latest) latest = current;
  });
  return latest;
}

function pieGradient(totals) {
  const total = subjectOrder.reduce((sum, subject) => sum + totals[subject], 0);
  if (!total) return "radial-gradient(circle at center, #fff 0 54%, transparent 55%), conic-gradient(#e5eaf3 0 100%)";
  let cursor = 0;
  const segments = subjectOrder.map(subject => {
    const next = cursor + totals[subject] / total * 100;
    const segment = `${subjectColors[subject]} ${cursor}% ${next}%`;
    cursor = next;
    return segment;
  });
  return `radial-gradient(circle at center, #fff 0 54%, transparent 55%), conic-gradient(${segments.join(", ")})`;
}

function formatHour(value) {
  return Number(value || 0).toFixed(1).replace(/\.0$/, "");
}

function renderPhaseTabs() {
  const tabs = document.getElementById("phaseTabs");
  tabs.innerHTML = phases.map(phase => `
    <button class="phase-tab ${phase.name === selectedPhaseName ? "active" : ""}" data-phase="${phase.name}">
      <strong>${phase.name}</strong>
      <span>${phase.start} 至 ${phase.end}</span>
    </button>
  `).join("");
  tabs.querySelectorAll(".phase-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const samePhase = selectedPhaseName === tab.dataset.phase;
      selectedPhaseName = tab.dataset.phase;
      phasePanelOpen = samePhase ? !phasePanelOpen : true;
      if (!phasePanelOpen || !samePhase) phaseDetailOpen = false;
      renderPhaseTabs();
      renderPhasePanel();
    });
  });
}

function renderPhasePanel() {
  const phase = phases.find(item => item.name === selectedPhaseName);
  const panel = document.getElementById("phasePanel");
  panel.hidden = !phasePanelOpen;
  if (!phasePanelOpen) {
    panel.innerHTML = "";
    return;
  }
  let body = "";
  if (phase.name === "一轮打基础") {
    const csRate = completionRateForPhase(phase.name, "cs");
    const mathRate = completionRateForPhase(phase.name, "math");
    const englishRate = completionRateForPhase(phase.name, "english");
    body = `
      <details class="phase-progress-details" ${phaseDetailOpen ? "open" : ""}>
        <summary>
          <div class="phase-collapsed">
            ${[
              ["408一轮进度", csRate],
              ["数学一轮进度", mathRate],
              ["英语10000单词进度", englishRate]
            ].map(([label, value]) => `
              <div class="summary-ring-card">
                <div class="ring" style="--value:${value}"><span>${label}</span></div>
                <div class="percent">${value}%</div>
                <div class="expand-hint">点击查看明细</div>
              </div>
            `).join("")}
          </div>
        </summary>
        <div class="progress-grid">
          <div class="progress-card detailed">
            <div class="progress-ring-col">
              <div class="ring" style="--value:${csRate}"><span>408一轮进度</span></div>
              <div class="percent">${csRate}%</div>
            </div>
            <div class="sub-progress-list">
              ${renderSubProgress("cs")}
            </div>
          </div>
          <div class="progress-card detailed">
            <div class="progress-ring-col">
              <div class="ring" style="--value:${mathRate}"><span>数学一轮进度</span></div>
              <div class="percent">${mathRate}%</div>
            </div>
            <div class="sub-progress-list">
              ${renderSubProgress("math")}
            </div>
          </div>
          <div class="progress-card detailed english-card">
            <div class="progress-ring-col">
              <div class="ring" style="--value:${englishRate}"><span>英语10000单词进度</span></div>
              <div class="percent">${englishRate}%</div>
            </div>
            <div class="sub-progress-list">
              ${renderEnglishWordProgress()}
            </div>
          </div>
        </div>
      </details>
    `;
  } else {
    const politicsNote = phase.name === "最后冲刺" ? "本阶段开始加入政治每日打卡。" : "本阶段暂不加入政治每日打卡。";
    body = `<div class="placeholder">这里先保留占位。之后可以按你的资料改成具体的强化进度、套卷进度、错题回收进度和背诵进度。${politicsNote}</div>`;
  }

  panel.innerHTML = `
    <div class="phase-summary">
      <div>
        <strong>${phase.name}</strong>
        <p>${phase.start} 至 ${phase.end}</p>
      </div>
      <span class="mini-status">${phase.activeSubjects.map(item => subjects[item]).join(" / ")}</span>
    </div>
    ${body}
  `;
  const detail = panel.querySelector(".phase-progress-details");
  if (detail) {
    detail.addEventListener("toggle", () => {
      phaseDetailOpen = detail.open;
    });
  }
  initMotionDetails();
}

function renderSyllabusPanel() {
  const openCategories = new Set([...document.querySelectorAll(".syllabus-category[open]")].map(item => item.dataset.category));
  const openSubjects = new Set([...document.querySelectorAll(".syllabus-subject[open]")].map(item => item.dataset.subject));
  document.getElementById("syllabusPanel").innerHTML = `
    <details class="syllabus-category" data-category="408" ${openCategories.has("408") ? "open" : ""}>
      <summary>
        <div>
          <strong>408</strong>
          <p>计算机学科专业基础综合：数据结构、计算机组成原理、操作系统、计算机网络。</p>
        </div>
        <span class="mini-status">4 门专业课</span>
      </summary>
      <div class="syllabus-category-body">
        ${syllabusSections.map(section => `
          <details class="syllabus-subject" data-subject="${section.subject}" ${openSubjects.has(section.subject) ? "open" : ""}>
            <summary>
              <div>
                <strong>${section.subject}</strong>
                <p>${section.summary}</p>
              </div>
              <span class="mini-status">${section.items.length} 个模块</span>
            </summary>
            <div class="syllabus-body">
              <div class="syllabus-grid">
                ${section.items.map(([title, text, level]) => `
                  <article class="syllabus-item ${level}">
                    <strong>${title}</strong>
                    <p>${text}</p>
                  </article>
                `).join("")}
              </div>
            </div>
          </details>
        `).join("")}
      </div>
    </details>
    <details class="syllabus-category" data-category="数学" ${openCategories.has("数学") ? "open" : ""}>
      <summary>
        <div>
          <strong>数学</strong>
          <p>数学一：高等数学约56%，线性代数约22%，概率论与数理统计约22%。</p>
        </div>
        <span class="mini-status">3 个模块</span>
      </summary>
      <div class="syllabus-category-body">
        ${mathSyllabusSections.map(section => `
          <details class="syllabus-subject" data-subject="${section.subject}" ${openSubjects.has(section.subject) ? "open" : ""}>
            <summary>
              <div>
                <strong>${section.subject}</strong>
                <p>${section.summary}</p>
              </div>
              <span class="mini-status">${section.items.length} 个模块</span>
            </summary>
            <div class="syllabus-body">
              <div class="syllabus-grid">
                ${section.items.map(([title, text, level]) => `
                  <article class="syllabus-item ${level}">
                    <strong>${title}</strong>
                    <p>${text}</p>
                  </article>
                `).join("")}
              </div>
            </div>
          </details>
        `).join("")}
      </div>
    </details>
    ${["英语", "政治"].map(name => `
      <details class="syllabus-category" data-category="${name}" ${openCategories.has(name) ? "open" : ""}>
        <summary>
          <div>
            <strong>${name}</strong>
            <p>考纲内容待补充；后续拿到资料后再拆分到每日目标。</p>
          </div>
          <span class="mini-status">待补充</span>
        </summary>
        <div class="syllabus-category-body">
          <div class="placeholder">${name}考纲还没有录入。等你提供资料后，我会按同样结构整理并拆到每日计划里。</div>
        </div>
      </details>
    `).join("")}
  `;
  initMotionDetails();
}

function taskTextForDate(key, subject) {
  if (subject === "cs" && getPhase(key).name === "一轮打基础") {
    const index = firstRoundDayIndex(key);
    if (index >= 0 && firstRoundCsPlan[index]) return firstRoundCsPlan[index];
  }
  if (subject === "math" && getPhase(key).name === "一轮打基础") {
    const index = firstRoundDayIndex(key);
    if (index >= 0 && firstRoundMathPlan[index]) return firstRoundMathPlan[index];
  }
  if (subject === "english" && getPhase(key).name === "一轮打基础") {
    return englishTaskTextForDate(key);
  }
  return getPhase(key).tasks[subject];
}

function firstRoundDayIndex(key) {
  const phase = phases[0];
  if (key < phase.start || key > phase.end) return -1;
  return Math.round((fromKey(key) - fromKey(phase.start)) / 86400000);
}

function monthReviewStats() {
  const stats = { total: 0, done: 0, late: 0, missed: 0, open: 0 };
  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const monthEnd = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
  const from = monthStart < startDate ? startDate : monthStart;
  const to = monthEnd > endDate ? endDate : monthEnd;
  for (let current = from; current <= to; current = addDays(current, 1)) {
    const status = dayStatus(dateKey(current));
    stats.total += 1;
    if (stats[status] !== undefined) stats[status] += 1;
  }
  return stats;
}

function renderCalendarOverview() {
  const stats = monthReviewStats();
  const rate = stats.total ? Math.round((stats.done + stats.late) / stats.total * 100) : 0;
  document.getElementById("calendarOverview").innerHTML = `
    <div class="calendar-brief">
      <strong>${visibleMonth.getFullYear()}年${visibleMonth.getMonth() + 1}月复盘地图</strong>
      <p>深色日期代表已完成；金色边框是今天；每个日期下方的小条对应当天科目完成情况。</p>
    </div>
    <div class="calendar-metric done"><b>${rate}%</b><span>本月完成率</span></div>
    <div class="calendar-metric done"><b>${stats.done}</b><span>按时完成</span></div>
    <div class="calendar-metric late"><b>${stats.late}</b><span>补完成</span></div>
    <div class="calendar-metric missed"><b>${stats.missed}</b><span>未完成</span></div>
  `;
}

function renderCalendar() {
  document.getElementById("monthTitle").textContent = `${visibleMonth.getFullYear()}年${visibleMonth.getMonth() + 1}月`;
  renderCalendarOverview();
  const grid = document.getElementById("calendarGrid");
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const firstCell = addDays(firstDay, -startOffset);
  const cells = weekdays.map(day => `<div class="weekday">周${day}</div>`);
  const selectedKey = dateKey(selectedDate);
  const todayKey = dateKey(new Date());

  for (let i = 0; i < 42; i++) {
    const current = addDays(firstCell, i);
    const key = dateKey(current);
    const inMonth = current.getMonth() === visibleMonth.getMonth();
    const inRange = current >= startDate && current <= endDate;
    const status = inRange ? dayStatus(key) : "out";
    const issueClass = inRange && hasIssue(key) ? (allIssuesMastered(key) ? "mastered" : "open") : "";
    const marks = inRange ? activeSubjectsFor(key).map(subject => {
      const done = ensureDay(key).tasks[subject];
      return `<span class="subject-mark ${done ? "done" : ""}" style="--mark-color:${subjectColors[subject]}" title="${subjects[subject]}${done ? "已完成" : "待完成"}"></span>`;
    }).join("") : "";
    const classes = [
      "day",
      !inMonth || !inRange ? "out" : "",
      key === selectedKey ? "selected" : "",
      key === todayKey ? "today" : "",
      status
    ].join(" ");
    cells.push(`
      <button class="${classes}" data-date="${key}" ${inRange ? "" : "disabled"}>
        <span class="badge">${current.getDate()}</span>
        ${marks ? `<span class="subject-marks">${marks}</span>` : ""}
        ${issueClass ? `<span class="issue-mark ${issueClass}" title="${issueClass === "mastered" ? "问题已确认掌握" : "有未掌握问题"}"></span>` : ""}
      </button>
    `);
  }

  grid.innerHTML = cells.join("");
  grid.querySelectorAll(".day[data-date]:not(.out)").forEach(day => {
    day.addEventListener("click", () => {
      selectedDate = fromKey(day.dataset.date);
      selectedStudyRecordDate = day.dataset.date;
      visibleStudyRecordMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      selectedPhaseName = getPhase(day.dataset.date).name;
      renderAll();
      playDailyDateFocus();
    });
  });
}

function renderDailyCard() {
  const key = dateKey(selectedDate);
  const phase = getPhase(key);
  const day = ensureDay(key);
  const active = phase.activeSubjects;
  const status = dayStatus(key);
  const statusText = { done: "按时完成", late: "补完成", missed: "未完成", open: "进行中" }[status];
  const doneCount = active.filter(subject => day.tasks[subject]).length;
  const donePercent = active.length ? Math.round(doneCount / active.length * 100) : 0;
  const targetHours = active.reduce((sum, subject) => sum + (phase.targets[subject] || 0), 0);
  const actualHours = active.reduce((sum, subject) => sum + Number(day.hours[subject] || 0), 0);
  const selectedDailyIssueCategory = ensureDailyIssueSelection(active);
  const dailySubcategories = issueCategoriesForSubject(selectedDailyIssueSubject);
  const nextSubject = active.find(subject => !day.tasks[subject]);
  const readOnly = !canEditState();
  const disabledAttr = readOnly ? "disabled" : "";
  const readonlyAttr = readOnly ? "readonly" : "";
  const nextAction = nextSubject
    ? `下一步：完成 ${subjects[nextSubject]} 打卡`
    : "今日任务已清零，记得补上错题和明日调整";
  const yesterdayKey = dateKey(addDays(selectedDate, -1));
  const yesterdayFix = selectedDate > startDate ? ensureDay(yesterdayKey).fix.trim() : "";

  const dailyCard = document.getElementById("dailyCard");
  dailyCard.className = `daily-card is-${status} ${readOnly ? "is-readonly" : ""}`;
  dailyCard.innerHTML = `
    <div class="daily-head">
      <div>
        <div class="daily-kicker">
          <span class="status-pill ${status}">${statusText}</span>
          <span class="phase-pill">${phase.name}</span>
        </div>
        <strong class="daily-date">${key} 周${weekdays[selectedDate.getDay()]}</strong>
        <span class="next-pill">${nextAction}</span>
      </div>
      <div class="daily-meter" aria-label="今日完成概览">
        <div class="daily-meter-top">
          <strong>${donePercent}%</strong>
          <span>${doneCount}/${active.length} 项已完成</span>
        </div>
        <div class="daily-progress-track">
          <span class="daily-progress-fill" style="width:${donePercent}%"></span>
        </div>
        <div class="daily-hours">
          <span>今日投入<b id="dailyActualHours">${formatHour(actualHours)}h</b></span>
          <span>计划目标<b>${formatHour(targetHours)}h</b></span>
        </div>
      </div>
    </div>
    <div class="reminder">
      <strong>昨日提醒：</strong>${yesterdayFix ? escapeHtml(yesterdayFix) : "前一天没有填写明日补救。"}
    </div>
    ${readOnly ? '<div class="readonly-note">只读预览：登录后可以修改并同步。</div>' : ""}
    <div class="task-grid">
      ${active.map(subject => `
        <article class="task subject-${subject} ${day.tasks[subject] ? "is-done" : "is-open"}" data-task-key="${key}" data-task-subject="${subject}">
          <div class="task-top">
            <span class="task-title">${subjects[subject]}</span>
            <span class="task-state">${day.tasks[subject] ? "已完成" : "待完成"}</span>
          </div>
          <label class="check-label">
            <input type="checkbox" data-key="${key}" data-subject="${subject}" ${day.tasks[subject] ? "checked" : ""} ${disabledAttr}>
            <span class="task-copy" title="${escapeHtml(taskTextForDate(key, subject))}">${taskTextForDate(key, subject)}</span>
          </label>
          <div class="hours-row">
            <span>学习时长，已记 ${formatHour(day.hours[subject])}h / 目标 ${phase.targets[subject]}h</span>
            <div class="hours-entry">
              <select data-hour-label="${key}" data-subject="${subject}" aria-label="${subjects[subject]}学习时长标签" ${disabledAttr}>
                ${studyTimerLabelOptions(subject).map(label => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join("")}
              </select>
              <input type="number" min="0" step="${hourInputStep}" data-hour="${key}" data-subject="${subject}" value="" placeholder="+0.1" aria-label="${subjects[subject]}本次增加时长" ${disabledAttr}>
              <button class="hours-confirm" type="button" data-hour-confirm="${key}" data-subject="${subject}" title="确认增加" ${disabledAttr}>✓</button>
            </div>
          </div>
        </article>
      `).join("")}
    </div>
    <div class="review">
      <div class="review-block issue-entry-block">
        <label>今日错题 / 问题</label>
        <div class="issue-picker" aria-label="错题科目选择">
          <div class="issue-tabs compact">
            ${active.map(subject => `
              <button class="subject-tab ${subject === selectedDailyIssueSubject ? "active" : ""}" data-daily-issue-subject="${subject}">
                ${subjects[subject]}
              </button>
            `).join("")}
          </div>
          ${dailySubcategories.length > 1 ? `
            <div class="issue-tabs sub compact">
              ${dailySubcategories.map(category => `
                <button class="subject-tab ${category.key === selectedDailyIssueCategory ? "active" : ""}" data-daily-issue-category="${category.key}">
                  ${category.label}
                </button>
              `).join("")}
            </div>
          ` : ""}
          <div class="subject-issue subject-${selectedDailyIssueSubject}">
            <label for="issue-${selectedDailyIssueCategory}-${key}">${issueCategoryName(selectedDailyIssueCategory)}</label>
            <textarea id="issue-${selectedDailyIssueCategory}-${key}" data-issue="${key}" data-category="${selectedDailyIssueCategory}" placeholder="记录${issueCategoryName(selectedDailyIssueCategory)}今天做错的题、没想明白的问题、要回看的知识点。" ${readonlyAttr}>${escapeHtml(day.issues[selectedDailyIssueCategory])}</textarea>
          </div>
        </div>
      </div>
      <div class="review-block fix-block">
        <label for="fix-${key}">明日补救 / 调整</label>
        <textarea id="fix-${key}" data-note="${key}" data-field="fix" placeholder="明天怎么补？要优先处理什么？" ${readonlyAttr}>${escapeHtml(day.fix)}</textarea>
      </div>
    </div>
  `;

  attachDailyEvents();
}

function updateDailyActualHours(key) {
  const target = document.getElementById("dailyActualHours");
  if (!target || key !== dateKey(selectedDate)) return;
  const day = ensureDay(key);
  const total = activeSubjectsFor(key).reduce((sum, subject) => sum + Number(day.hours[subject] || 0), 0);
  target.textContent = `${formatHour(total)}h`;
}

function attachDailyEvents() {
  document.querySelectorAll("#dailyCard input[type='checkbox']").forEach(input => {
    input.addEventListener("change", event => {
      if (!guardEdit()) {
        renderDailyCard();
        return;
      }
      const key = event.target.dataset.key;
      const subject = event.target.dataset.subject;
      const day = ensureDay(key);
      day.tasks[subject] = event.target.checked;
      if (dayDone(key) && !day.completedAt) day.completedAt = dateKey(new Date());
      if (!dayDone(key)) day.completedAt = "";
      saveState();
      renderAll();
      if (event.target.checked) playTaskCompletion(key, subject);
    });
  });

  document.querySelectorAll("[data-hour-confirm]").forEach(button => {
    button.addEventListener("click", event => {
      if (!guardEdit()) {
        renderDailyCard();
        return;
      }
      const key = event.currentTarget.dataset.hourConfirm;
      const subject = event.currentTarget.dataset.subject;
      const input = document.querySelector(`input[data-hour="${key}"][data-subject="${subject}"]`);
      const labelSelect = document.querySelector(`select[data-hour-label="${key}"][data-subject="${subject}"]`);
      const hours = roundHour(Math.max(0, Number(input?.value || 0)));
      if (hours <= 0) return;
      const endMs = Date.now();
      const startMs = endMs - hours * 60 * 60 * 1000;
      const recordedHours = addStudySession({
        subject,
        label: labelSelect?.value || timerDefaultLabel,
        startMs,
        endMs,
        source: "manual"
      });
      if (recordedHours <= 0) return;
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("#dailyCard input[type='number']").forEach(input => {
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      input.closest(".hours-entry")?.querySelector("[data-hour-confirm]")?.click();
    });
  });

  document.querySelectorAll("#dailyCard textarea[data-note]").forEach(textarea => {
    textarea.addEventListener("input", event => {
      if (!guardEdit()) {
        renderDailyCard();
        return;
      }
      const day = ensureDay(event.target.dataset.note);
      day[event.target.dataset.field] = event.target.value;
      saveState();
      renderCalendar();
      renderIssuesPanel();
    });
  });

  document.querySelectorAll("#dailyCard textarea[data-issue]").forEach(textarea => {
    textarea.addEventListener("input", event => {
      if (!guardEdit()) {
        renderDailyCard();
        return;
      }
      const day = ensureDay(event.target.dataset.issue);
      day.issues[event.target.dataset.category] = event.target.value;
      saveState();
      renderCalendar();
      renderIssuesPanel();
      renderAllRows();
    });
  });

  document.querySelectorAll("[data-daily-issue-subject]").forEach(button => {
    button.addEventListener("click", () => {
      selectedDailyIssueSubject = button.dataset.dailyIssueSubject;
      ensureDailyIssueSelection(activeSubjectsFor(dateKey(selectedDate)));
      renderDailyCard();
    });
  });

  document.querySelectorAll("[data-daily-issue-category]").forEach(button => {
    button.addEventListener("click", () => {
      selectedDailyIssueCategoryBySubject[selectedDailyIssueSubject] = button.dataset.dailyIssueCategory;
      renderDailyCard();
    });
  });
}

function renderIssuesPanel() {
  if (!issueCategoryMap[selectedIssueSubject]) selectedIssueSubject = issueCategoryOrder[0];
  if (!issueCategoriesForSubject(selectedIssueGroup).some(category => category.key === selectedIssueSubject)) {
    selectedIssueSubject = firstIssueCategoryForSubject(selectedIssueGroup);
  }
  const reviewCategories = issueCategoriesForSubject(selectedIssueGroup);
  const issues = [];
  for (let current = new Date(startDate); current <= endDate; current = addDays(current, 1)) {
    const key = dateKey(current);
    const day = ensureDay(key);
    const review = day.issues[selectedIssueSubject].trim();
    if (review) {
      issues.push({ key, weekday: weekdays[current.getDay()], review, checks: day.issueChecks[selectedIssueSubject] });
    }
  }
  const counts = Object.fromEntries(issueCategoryOrder.map(categoryKey => [categoryKey, issueCountForCategory(categoryKey)]));
  const groupCounts = Object.fromEntries(subjectOrder.map(subject => [subject, issueCountForSubject(subject)]));

  document.getElementById("issuesPanel").innerHTML = `
    <div class="issue-tabs">
      ${subjectOrder.map(subject => `
        <button class="subject-tab ${subject === selectedIssueGroup ? "active" : ""}" data-issue-group="${subject}">
          ${subjects[subject]} ${groupCounts[subject]}
        </button>
      `).join("")}
    </div>
    ${reviewCategories.length > 1 ? `
      <div class="issue-tabs sub">
        ${reviewCategories.map(category => `
          <button class="subject-tab ${category.key === selectedIssueSubject ? "active" : ""}" data-issue-subject="${category.key}">
            ${category.label} ${counts[category.key]}
          </button>
        `).join("")}
      </div>
    ` : ""}
    <div class="issues-list">
      ${issues.length ? '<div class="issue-list-head"><span>日期</span><span>问题</span><span>确认状态</span></div>' : ""}
      ${issues.length ? issues.map(item => `
        <div class="issue-item">
          <button class="text-btn issue-date" data-date="${item.key}">${item.key} 周${item.weekday}</button>
          <div class="issue-text">${escapeHtml(item.review).replaceAll("\n", "<br>")}</div>
          <div class="confirm-grid">
            ${issueChecks.map(([checkKey, label]) => `
              <label>
                <input type="checkbox" data-issue-check-date="${item.key}" data-issue-check-subject="${selectedIssueSubject}" data-issue-check="${checkKey}" ${item.checks[checkKey] ? "checked" : ""} ${canEditState() ? "" : "disabled"}>
                <span>${label}</span>
              </label>
            `).join("")}
          </div>
        </div>
      `).join("") : `<div class="empty">${issueCategoryName(selectedIssueSubject)}暂时还没有记录错题或问题。</div>`}
    </div>
  `;
  document.querySelectorAll("[data-issue-group]").forEach(button => {
    button.addEventListener("click", () => {
      selectedIssueGroup = button.dataset.issueGroup;
      selectedIssueSubject = firstIssueCategoryForSubject(selectedIssueGroup);
      renderIssuesPanel();
    });
  });
  document.querySelectorAll("[data-issue-subject]").forEach(button => {
    button.addEventListener("click", () => {
      selectedIssueSubject = button.dataset.issueSubject;
      selectedIssueGroup = issueCategoryMap[selectedIssueSubject]?.subject || selectedIssueGroup;
      renderIssuesPanel();
    });
  });
  document.querySelectorAll(".issue-date").forEach(button => {
    button.addEventListener("click", () => {
      selectedDate = fromKey(button.dataset.date);
      selectedPhaseName = getPhase(button.dataset.date).name;
      visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      renderAll();
      document.getElementById("dailyCard").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
  document.querySelectorAll("[data-issue-check]").forEach(input => {
    input.addEventListener("change", event => {
      if (!guardEdit()) {
        renderIssuesPanel();
        return;
      }
      const day = ensureDay(event.target.dataset.issueCheckDate);
      const subject = event.target.dataset.issueCheckSubject;
      const check = event.target.dataset.issueCheck;
      day.issueChecks[subject][check] = event.target.checked;
      saveState();
      renderCalendar();
    });
  });
}

function renderAllPhaseSelect() {
  const select = document.getElementById("allPhaseSelect");
  select.innerHTML = phases.map(phase => `<option value="${phase.name}" ${phase.name === allTablePhaseName ? "selected" : ""}>${phase.name}</option>`).join("");
  select.onchange = () => {
    allTablePhaseName = select.value;
    renderAllRows();
  };
}

function renderAllRows() {
  const phase = phases.find(item => item.name === allTablePhaseName);
  document.getElementById("allPhaseTitle").textContent = `${phase.name}：${phase.start} 至 ${phase.end}`;
  const active = phase.activeSubjects;
  document.getElementById("allHead").innerHTML = `
    <tr>
      <th>日期</th>
      ${active.map(subject => `<th>${subjects[subject]}</th>`).join("")}
      <th>总状态</th>
      <th>学习时长</th>
      <th>未解决错题/问题</th>
    </tr>
  `;
  const rows = [];
  for (let current = fromKey(phase.start); current <= fromKey(phase.end); current = addDays(current, 1)) {
    const key = dateKey(current);
    const day = ensureDay(key);
    rows.push(`
      <tr>
        <td>${key}<br><span class="mini-status">周${weekdays[current.getDay()]}</span></td>
        ${active.map(subject => `<td><span class="status-circle ${day.tasks[subject] ? "done" : ""}" title="${subjects[subject]}"></span></td>`).join("")}
        <td><span class="status-circle ${dayDone(key) ? "done" : ""}" title="总状态"></span></td>
        <td>${active.map(subject => `${subjects[subject]} ${formatHour(day.hours[subject])}h`).join("<br>")}</td>
        <td>${hasIssue(key) && !allIssuesMastered(key) ? '<span class="status-circle done" title="有未解决错题/问题"></span>' : '<span class="status-circle off" title="无未解决错题/问题"></span>'}</td>
      </tr>
    `);
  }
  document.getElementById("allRows").innerHTML = rows.join("");
}
