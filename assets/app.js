function renderAll() {
  renderStats();
  renderHourStats();
  renderPhaseTabs();
  renderPhasePanel();
  renderSyllabusPanel();
  renderCalendar();
  renderDailyCard();
  renderIssuesPanel();
  renderAllPhaseSelect();
  renderAllRows();
  renderCloudPanel();
  initMotionDetails();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  const button = document.getElementById("themeToggle");
  if (button) {
    button.textContent = nextTheme === "dark" ? "浅色模式" : "深色模式";
    button.setAttribute("aria-pressed", nextTheme === "dark" ? "true" : "false");
  }
}

function loadTheme() {
  const saved = localStorage.getItem(themeStorageKey);
  applyTheme(saved === "dark" ? "dark" : "light");
}

function goToday() {
  selectedDate = clampDate(new Date());
  visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  selectedPhaseName = getPhase(dateKey(selectedDate)).name;
  renderAll();
  document.getElementById("dailyCard").scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateMobileMiniVisibility() {
  const bar = document.getElementById("mobileMiniBar");
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  const headerHeight = document.querySelector("header")?.offsetHeight || 260;
  const shouldShow = isMobile && window.scrollY > Math.max(180, headerHeight - 24);
  document.body.classList.toggle("mobile-mini-visible", shouldShow);
  if (bar) bar.setAttribute("aria-hidden", shouldShow ? "false" : "true");
}

function restartAnimation(element, className) {
  if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  element.addEventListener("animationend", () => element.classList.remove(className), { once: true });
}

function playTaskCompletion(key, subject) {
  requestAnimationFrame(() => {
    const selector = `[data-task-key="${key}"][data-task-subject="${subject}"]`;
    restartAnimation(document.querySelector(selector), "completion-flash");
  });
}

function playDailyDateFocus() {
  requestAnimationFrame(() => {
    restartAnimation(document.getElementById("dailyCard"), "date-focus-highlight");
  });
}

const motionDetailsSelector = ".cloud-sync, .collapsible-panel, .syllabus-root, .all-card, .syllabus-category, .syllabus-subject, .phase-progress-details";
const motionDurationMs = 520;

function getDetailsSummary(details) {
  return Array.from(details.children).find(child => child.tagName === "SUMMARY");
}

function finishDetailsMotion(details, shouldBeOpen) {
  window.clearTimeout(details.motionTimer);
  details.open = shouldBeOpen;
  details.style.height = "";
  details.style.overflow = "";
  details.classList.remove("is-animating");
}

function openMotionDetails(details) {
  const summary = getDetailsSummary(details);
  if (!summary || details.open) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    details.open = true;
    return;
  }
  window.clearTimeout(details.motionTimer);
  details.classList.add("is-animating");
  details.style.overflow = "hidden";
  details.style.height = `${summary.offsetHeight}px`;
  details.open = true;
  requestAnimationFrame(() => {
    details.style.height = `${details.scrollHeight}px`;
  });
  details.motionTimer = window.setTimeout(() => finishDetailsMotion(details, true), motionDurationMs + 80);
  const onEnd = event => {
    if (event.propertyName !== "height" || event.target !== details) return;
    details.removeEventListener("transitionend", onEnd);
    finishDetailsMotion(details, true);
  };
  details.addEventListener("transitionend", onEnd);
}

function closeMotionDetails(details) {
  const summary = getDetailsSummary(details);
  if (!summary || !details.open) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    details.open = false;
    return;
  }
  window.clearTimeout(details.motionTimer);
  details.classList.add("is-animating");
  details.style.overflow = "hidden";
  details.style.height = `${details.scrollHeight}px`;
  requestAnimationFrame(() => {
    details.style.height = `${summary.offsetHeight}px`;
  });
  details.motionTimer = window.setTimeout(() => finishDetailsMotion(details, false), motionDurationMs + 80);
  const onEnd = event => {
    if (event.propertyName !== "height" || event.target !== details) return;
    details.removeEventListener("transitionend", onEnd);
    finishDetailsMotion(details, false);
  };
  details.addEventListener("transitionend", onEnd);
}

function initMotionDetails() {
  document.querySelectorAll(motionDetailsSelector).forEach(details => {
    if (details.dataset.motionReady) return;
    const summary = getDetailsSummary(details);
    if (!summary) return;
    details.dataset.motionReady = "true";
    details.classList.add("motion-details");
    summary.addEventListener("click", event => {
      event.preventDefault();
      if (details.classList.contains("is-animating")) return;
      details.open ? closeMotionDetails(details) : openMotionDetails(details);
    });
  });
}

document.getElementById("prevMonth").addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
  renderCalendar();
});

document.getElementById("nextMonth").addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
  renderCalendar();
});

document.getElementById("calendarToday").addEventListener("click", goToday);
document.getElementById("floatToday").addEventListener("click", goToday);
document.getElementById("floatAllTable").addEventListener("click", () => {
  openMotionDetails(document.getElementById("allCard"));
  document.getElementById("allCard").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.getElementById("floatTimer").addEventListener("click", openStudyTimer);
document.getElementById("studyTimerHide").addEventListener("click", closeStudyTimer);
document.getElementById("studyTimerStart").addEventListener("click", startStudyTimer);
document.getElementById("studyTimerPause").addEventListener("click", pauseStudyTimer);
document.getElementById("studyTimerReset").addEventListener("click", resetStudyTimer);

document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "考研每日打卡进度.json";
  link.click();
  URL.revokeObjectURL(url);
});

document.getElementById("resetBtn").addEventListener("click", () => {
  if (!guardEdit()) return;
  if (!confirm("确定清空所有勾选、时长和备注吗？")) return;
  state = {};
  saveState();
  renderAll();
});

function renderVersionLog(text) {
  const view = document.getElementById("versionLogView");
  const jumpBar = document.getElementById("versionJumpBar");
  const jumpList = document.getElementById("versionJumpList");
  if (!view || !jumpBar || !jumpList) return;

  const matches = [...text.matchAll(/^((\d+\.\d+\.\d+)[^\r\n]*)$/gm)];
  view.replaceChildren();
  jumpList.replaceChildren();

  if (!matches.length) {
    view.textContent = text;
    jumpBar.hidden = true;
    return;
  }

  const intro = text.slice(0, matches[0].index).trim();
  if (intro) {
    const introBlock = document.createElement("pre");
    introBlock.className = "version-log-intro";
    introBlock.textContent = intro;
    view.appendChild(introBlock);
  }

  const versions = matches.map((match, index) => {
    const section = document.createElement("section");
    const version = match[2];
    section.className = "version-log-entry";
    section.id = `version-log-${version.replaceAll(".", "-")}`;
    section.dataset.version = version;

    const heading = document.createElement("h3");
    heading.textContent = match[1];
    const details = document.createElement("pre");
    const end = matches[index + 1]?.index ?? text.length;
    details.textContent = text.slice(match.index + match[0].length, end).trim();
    section.append(heading, details);
    view.appendChild(section);
    return version;
  });

  [...versions].reverse().forEach(version => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = version;
    button.dataset.version = version;
    button.className = version === appVersion ? "current" : "";
    button.addEventListener("click", () => jumpToVersion(version));
    jumpList.appendChild(button);
  });
  jumpBar.hidden = false;
}

function jumpToVersion(version) {
  const target = document.querySelector(`.version-log-entry[data-version="${version}"]`);
  const button = document.querySelector(`#versionJumpList [data-version="${version}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.remove("is-target");
  void target.offsetWidth;
  target.classList.add("is-target");
  document.querySelectorAll("#versionJumpList button").forEach(item => {
    item.classList.toggle("selected", item === button);
  });
  window.setTimeout(() => target.classList.remove("is-target"), 1400);
}

async function openVersionLog() {
  const modal = document.getElementById("versionModal");
  const view = document.getElementById("versionLogView");
  if (!modal || !view) return;
  modal.hidden = false;
  view.textContent = "正在加载版本日志...";
  try {
    const response = await fetch("version-log.txt", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderVersionLog(await response.text());
  } catch (error) {
    const jumpBar = document.getElementById("versionJumpBar");
    if (jumpBar) jumpBar.hidden = true;
    view.replaceChildren();
    const fallback = document.createElement("iframe");
    fallback.className = "version-log-fallback";
    fallback.src = "version-log.txt";
    fallback.title = "历史版本日志文本";
    view.appendChild(fallback);
  }
  document.getElementById("versionModalClose")?.focus();
}

function closeVersionLog() {
  const modal = document.getElementById("versionModal");
  if (modal) modal.hidden = true;
}

document.getElementById("appVersionText").textContent = appVersion;
document.getElementById("versionModalCurrent").textContent = appVersion;
document.getElementById("versionLogBtn").addEventListener("click", openVersionLog);
document.getElementById("versionModalClose").addEventListener("click", closeVersionLog);
document.getElementById("versionModal").addEventListener("click", event => {
  if (event.target.id === "versionModal") closeVersionLog();
});

document.getElementById("themeToggle").addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(themeStorageKey, nextTheme);
  applyTheme(nextTheme);
});

document.addEventListener("click", event => {
  if (!activePiePopupSubject) return;
  if (event.target.closest(".pie-wrap")) return;
  activePiePopupSubject = null;
  renderHourStats();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeVersionLog();
});

window.addEventListener("scroll", updateMobileMiniVisibility, { passive: true });
window.addEventListener("resize", updateMobileMiniVisibility);

loadTheme();
renderAll();
renderStudyTimer();
startStudyTimerTick();
initMotionDetails();
updateMobileMiniVisibility();
initCloud();
