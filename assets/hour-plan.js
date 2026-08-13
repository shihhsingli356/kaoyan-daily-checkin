const hourPlanStartMinutes = 6 * 60;
const hourPlanEndMinutes = 24 * 60;
const hourPlanPixelsPerHour = 72;

function hourPlanTimeToMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeHourPlanTime(value, fallback) {
  const minutes = hourPlanTimeToMinutes(value);
  if (minutes < hourPlanStartMinutes || minutes > hourPlanEndMinutes) return fallback;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function hourPlanDurationText(start, end) {
  const minutes = Math.max(0, hourPlanTimeToMinutes(end) - hourPlanTimeToMinutes(start));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} 分钟`;
  if (!rest) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分钟`;
}

function hourPlanTimeOptions(selected, includeEnd = false) {
  const options = [];
  for (let minutes = hourPlanStartMinutes; minutes <= hourPlanEndMinutes; minutes += 30) {
    if (!includeEnd && minutes === hourPlanEndMinutes) continue;
    const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    options.push(`<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`);
  }
  return options.join("");
}

function hourPlanSubjectOptions(selected) {
  return subjectOrder.map(subject => `
    <option value="${subject}" ${subject === selected ? "selected" : ""}>${subjects[subject]}</option>
  `).join("");
}

function hourPlanLabelOptions(subject, selected) {
  const labels = new Set(studyTimerLabelOptions(subject));
  if (selected) labels.add(selected);
  return Array.from(labels).map(label => `
    <option value="${escapeHtml(label)}" ${label === selected ? "selected" : ""}>${escapeHtml(label)}</option>
  `).join("");
}

function renderHourPlanEditor(key) {
  const plan = ensureDay(key).hourPlan;
  const item = plan.items.find(entry => entry.id === editingHourPlanTaskId);
  const defaultSubject = item?.subject || activeSubjectsFor(key)[0] || "cs";
  const defaultLabel = item?.label || studyTimerLabelOptions(defaultSubject)[0] || timerDefaultLabel;
  const start = item?.start || "08:00";
  const end = item?.end || "09:00";
  return `
    <form class="hour-plan-editor" id="hourPlanEditor">
      <div class="hour-plan-editor-head">
        <div>
          <strong>${item ? "编辑小时任务" : "新建小时任务"}</strong>
          <span>科目与标签沿用学习时长统计中的分类。</span>
        </div>
        <button type="button" class="hour-plan-editor-close" data-hour-plan-cancel aria-label="关闭任务编辑">×</button>
      </div>
      <div class="hour-plan-form-grid">
        <label>科目<select id="hourPlanSubject">${hourPlanSubjectOptions(defaultSubject)}</select></label>
        <label>标签<select id="hourPlanLabel">${hourPlanLabelOptions(defaultSubject, defaultLabel)}</select></label>
        <label>开始时间<select id="hourPlanStart">${hourPlanTimeOptions(start)}</select></label>
        <label>结束时间<select id="hourPlanEnd">${hourPlanTimeOptions(end, true)}</select></label>
        <label class="hour-plan-content-field">规划内容<textarea id="hourPlanText" maxlength="240" placeholder="例如：完成操作系统进程同步专题并整理错题">${escapeHtml(item?.text || "")}</textarea></label>
      </div>
      <div class="hour-plan-editor-foot">
        <span id="hourPlanDuration">预计 ${hourPlanDurationText(start, end)}</span>
        <div>
          <button type="button" class="text-btn" data-hour-plan-cancel>取消</button>
          <button type="submit" class="primary">${item ? "保存修改" : "加入日程"}</button>
        </div>
      </div>
    </form>
  `;
}

function renderHourPlanTimeline(key, readOnly = false) {
  const items = ensureDay(key).hourPlan.items;
  const layoutById = new Map();
  let cluster = [];
  let clusterEnd = -1;
  const flushCluster = () => {
    if (!cluster.length) return;
    const laneEnds = [];
    const laneById = new Map();
    cluster.forEach(item => {
      const start = hourPlanTimeToMinutes(item.start);
      let lane = laneEnds.findIndex(end => end <= start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = hourPlanTimeToMinutes(item.end);
      laneById.set(item.id, lane);
    });
    const lanes = Math.max(1, laneEnds.length);
    cluster.forEach(item => layoutById.set(item.id, { lane: laneById.get(item.id) || 0, lanes }));
    cluster = [];
    clusterEnd = -1;
  };
  items.forEach(item => {
    const start = hourPlanTimeToMinutes(item.start);
    if (cluster.length && start >= clusterEnd) flushCluster();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, hourPlanTimeToMinutes(item.end));
  });
  flushCluster();
  const hours = [];
  for (let hour = 6; hour <= 24; hour += 1) {
    const top = (hour - 6) * hourPlanPixelsPerHour;
    hours.push(`
      <div class="hour-plan-hour" style="--hour-top:${top}px">
        <span>${String(hour).padStart(2, "0")}:00</span><i></i>
      </div>
    `);
  }
  const blocks = items.map(item => {
    const startMinutes = Math.max(hourPlanStartMinutes, hourPlanTimeToMinutes(item.start));
    const endMinutes = Math.min(hourPlanEndMinutes, hourPlanTimeToMinutes(item.end));
    const top = (startMinutes - hourPlanStartMinutes) / 60 * hourPlanPixelsPerHour;
    const height = Math.max(36, (endMinutes - startMinutes) / 60 * hourPlanPixelsPerHour - 4);
    const layout = layoutById.get(item.id) || { lane: 0, lanes: 1 };
    return `
      <article class="hour-plan-task subject-${item.subject}" style="--task-top:${top}px;--task-height:${height}px;--subject-color:${subjectColors[item.subject]};--task-lane:${layout.lane};--task-lanes:${layout.lanes}" data-hour-plan-task="${item.id}">
        <div class="hour-plan-task-copy">
          <span>${item.start}–${item.end} · ${hourPlanDurationText(item.start, item.end)}</span>
          <strong>${escapeHtml(item.text || "未填写规划内容")}</strong>
          <small>${subjects[item.subject]} · ${escapeHtml(item.label)}</small>
        </div>
        ${readOnly ? "" : `
          <div class="hour-plan-task-actions">
            <button type="button" data-hour-plan-edit="${item.id}" title="编辑">✎</button>
            <button type="button" data-hour-plan-delete="${item.id}" title="删除">×</button>
          </div>
        `}
      </article>
    `;
  }).join("");
  return `
    <div class="hour-plan-timeline-wrap">
      <div class="hour-plan-timeline" style="--timeline-height:${(24 - 6) * hourPlanPixelsPerHour}px">
        ${hours.join("")}
        ${blocks}
        ${items.length ? "" : '<div class="hour-plan-empty"><strong>今天还没有小时任务</strong><span>点击“新建任务”，把想补回来的内容安排进具体时间。</span></div>'}
      </div>
    </div>
  `;
}

function renderHourPlan(key, readOnly) {
  const plan = ensureDay(key).hourPlan;
  const plannedMinutes = plan.items.reduce((sum, item) => sum + hourPlanTimeToMinutes(item.end) - hourPlanTimeToMinutes(item.start), 0);
  const plannedText = hourPlanDurationText("00:00", `${String(Math.floor(plannedMinutes / 60)).padStart(2, "0")}:${String(plannedMinutes % 60).padStart(2, "0")}`);
  return `
    <section class="hour-plan-root ${plan.completed ? "is-complete" : ""}" aria-label="按小时规划">
      <div class="hour-plan-toolbar">
        <div>
          <span>今日小时日程</span>
          <strong>${plan.items.length} 个任务 · 预计 ${plannedMinutes ? plannedText : "0 小时"}</strong>
          <small>${plan.completed ? "今日小时规划已完成，月历已点亮独立金色标记。" : "独立于原任务完成率，不会改变已有统计。"}</small>
        </div>
        <div class="hour-plan-toolbar-actions">
          <button type="button" class="hour-plan-new" data-hour-plan-new ${readOnly ? "disabled" : ""}>＋ 新建任务</button>
          <button type="button" class="hour-plan-complete ${plan.completed ? "active" : ""}" data-hour-plan-complete ${readOnly || !plan.items.length ? "disabled" : ""}>
            ${plan.completed ? "✓ 今日规划已完成" : "完成今日规划"}
          </button>
        </div>
      </div>
      ${hourPlanComposerOpen && !readOnly ? renderHourPlanEditor(key) : ""}
      ${renderHourPlanTimeline(key, readOnly)}
    </section>
  `;
}

function attachHourPlanEvents(key) {
  const root = document.querySelector(".hour-plan-root");
  if (!root) return;
  const plan = ensureDay(key).hourPlan;

  root.querySelector("[data-hour-plan-new]")?.addEventListener("click", () => {
    editingHourPlanTaskId = null;
    hourPlanComposerOpen = true;
    renderDailyCard();
  });
  root.querySelectorAll("[data-hour-plan-cancel]").forEach(button => {
    button.addEventListener("click", () => {
      hourPlanComposerOpen = false;
      editingHourPlanTaskId = null;
      renderDailyCard();
    });
  });
  root.querySelectorAll("[data-hour-plan-edit]").forEach(button => {
    button.addEventListener("click", () => {
      editingHourPlanTaskId = button.dataset.hourPlanEdit;
      hourPlanComposerOpen = true;
      renderDailyCard();
    });
  });
  root.querySelectorAll("[data-hour-plan-delete]").forEach(button => {
    button.addEventListener("click", () => {
      if (!guardEdit() || !confirm("确定删除这个小时任务吗？")) return;
      plan.items = plan.items.filter(item => item.id !== button.dataset.hourPlanDelete);
      plan.completed = false;
      plan.completedAt = "";
      saveState();
      renderAll();
    });
  });
  root.querySelector("[data-hour-plan-complete]")?.addEventListener("click", () => {
    if (!guardEdit()) return;
    plan.completed = !plan.completed;
    plan.completedAt = plan.completed ? new Date().toISOString() : "";
    saveState();
    renderAll();
  });

  const subjectSelect = root.querySelector("#hourPlanSubject");
  const labelSelect = root.querySelector("#hourPlanLabel");
  subjectSelect?.addEventListener("change", () => {
    labelSelect.innerHTML = hourPlanLabelOptions(subjectSelect.value, timerDefaultLabel);
  });
  const updateDuration = () => {
    const start = root.querySelector("#hourPlanStart")?.value;
    const end = root.querySelector("#hourPlanEnd")?.value;
    const target = root.querySelector("#hourPlanDuration");
    if (!target) return;
    const valid = hourPlanTimeToMinutes(end) > hourPlanTimeToMinutes(start);
    target.textContent = valid ? `预计 ${hourPlanDurationText(start, end)}` : "结束时间必须晚于开始时间";
    target.classList.toggle("error", !valid);
  };
  root.querySelector("#hourPlanStart")?.addEventListener("change", updateDuration);
  root.querySelector("#hourPlanEnd")?.addEventListener("change", updateDuration);
  root.querySelector("#hourPlanEditor")?.addEventListener("submit", event => {
    event.preventDefault();
    if (!guardEdit()) return;
    const subject = subjectSelect.value;
    const label = labelSelect.value;
    const start = root.querySelector("#hourPlanStart").value;
    const end = root.querySelector("#hourPlanEnd").value;
    const text = root.querySelector("#hourPlanText").value.trim();
    if (!text) {
      root.querySelector("#hourPlanText").focus();
      return;
    }
    if (hourPlanTimeToMinutes(end) <= hourPlanTimeToMinutes(start)) {
      updateDuration();
      return;
    }
    const next = { id: editingHourPlanTaskId || `${Date.now()}-${Math.random().toString(16).slice(2)}`, subject, label, text, start, end };
    const index = plan.items.findIndex(item => item.id === editingHourPlanTaskId);
    if (index >= 0) plan.items[index] = next;
    else plan.items.push(next);
    plan.items.sort((a, b) => hourPlanTimeToMinutes(a.start) - hourPlanTimeToMinutes(b.start));
    plan.completed = false;
    plan.completedAt = "";
    hourPlanComposerOpen = false;
    editingHourPlanTaskId = null;
    saveState();
    renderAll();
  });
}
