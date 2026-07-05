function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  scheduleCloudSync();
}

function ensureMeta() {
  if (!state.__meta || typeof state.__meta !== "object" || Array.isArray(state.__meta)) state.__meta = {};
  if (!state.__meta.hourBreakdowns || typeof state.__meta.hourBreakdowns !== "object") state.__meta.hourBreakdowns = {};
  if (!Array.isArray(state.__meta.studySessions)) state.__meta.studySessions = [];
  state.__meta.studySessions = state.__meta.studySessions
    .filter(item => item && typeof item === "object")
    .map(item => buildStudySession(item))
    .filter(Boolean)
    .sort((a, b) => b.endMs - a.endMs);
  return state.__meta;
}

function hourBreakdownRangeKey(rangeKey, range) {
  return `${rangeKey}:${dateKey(range.start)}:${dateKey(range.end)}`;
}

function ensureHourBreakdown(rangeKey, range, subject) {
  const meta = ensureMeta();
  const key = hourBreakdownRangeKey(rangeKey, range);
  if (!meta.hourBreakdowns[key]) meta.hourBreakdowns[key] = {};
  if (!Array.isArray(meta.hourBreakdowns[key][subject])) meta.hourBreakdowns[key][subject] = [];
  meta.hourBreakdowns[key][subject] = meta.hourBreakdowns[key][subject]
    .filter(item => item && typeof item === "object")
    .map(item => ({
      id: item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label: typeof item.label === "string" ? item.label : "",
      hours: Math.max(0, Number(item.hours || 0))
    }));
  return meta.hourBreakdowns[key][subject];
}

function loadCloudConfig() {
  try {
    const raw = localStorage.getItem(cloudConfigKey);
    const parsed = raw ? JSON.parse(raw) : {};
    const fallback = {
      url: bundledCloudConfig.url || "",
      anonKey: bundledCloudConfig.anonKey || ""
    };
    return {
      url: typeof parsed.url === "string" && parsed.url ? parsed.url : fallback.url,
      anonKey: typeof parsed.anonKey === "string" && parsed.anonKey ? parsed.anonKey : fallback.anonKey
    };
  } catch {
    return {
      url: bundledCloudConfig.url || "",
      anonKey: bundledCloudConfig.anonKey || ""
    };
  }
}
