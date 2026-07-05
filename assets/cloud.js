function hasCloudConfig() {
  return Boolean(cloudConfig.url && cloudConfig.anonKey);
}

function canEditState() {
  return !hasCloudConfig() || Boolean(cloudSession && cloudSession.user);
}

function guardEdit() {
  if (canEditState()) return true;
  setCloudMessage("当前是只读预览，登录后才能修改并同步。", "warn");
  return false;
}

function cloudSdkReady() {
  return Boolean(window.supabase && typeof window.supabase.createClient === "function");
}

function loadSupabaseSdk() {
  if (cloudSdkReady()) return Promise.resolve(true);
  if (cloudSdkLoading) return cloudSdkLoading;

  cloudSdkLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-supabase-sdk]");
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => reject(new Error("Supabase SDK 加载失败")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    script.async = true;
    script.dataset.supabaseSdk = "true";
    script.onload = () => resolve(true);
    script.onerror = () => {
      cloudSdkLoading = null;
      reject(new Error("Supabase SDK 加载失败"));
    };
    document.head.appendChild(script);
  });

  return cloudSdkLoading;
}

function formatCloudTime(value) {
  if (!value) return "尚未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未同步";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function defaultCloudStatus() {
  if (!hasCloudConfig()) {
    return { text: "未配置云同步，本地保存照常可用。", tone: "warn" };
  }
  if (!cloudSdkReady()) {
    return { text: "Supabase SDK 没有加载成功，请检查网络后刷新。", tone: "error" };
  }
  if (!cloudSession || !cloudSession.user) {
    return { text: "正在查看最新云端存档，登录后可修改。", tone: "warn" };
  }
  if (cloudSyncing) {
    return { text: "正在同步到云端。", tone: "ok" };
  }
  if (cloudLastSyncedAt) {
    return { text: `已同步：${formatCloudTime(cloudLastSyncedAt)}`, tone: "ok" };
  }
  return { text: "已登录，后续修改会自动同步。", tone: "ok" };
}

function cloudSummaryText() {
  if (!hasCloudConfig()) return "未配置 Supabase，本地保存正常。";
  if (!cloudSession || !cloudSession.user) return "只读查看最新云端存档。";
  if (cloudSyncing) return "正在同步。";
  return cloudLastSyncedAt ? `上次同步 ${formatCloudTime(cloudLastSyncedAt)}` : "已登录，等待首次同步。";
}

function setCloudMessage(text, tone = "") {
  cloudMessage = { text, tone };
  renderCloudPanel();
}

function renderAfterAuthChange() {
  renderCloudPanel();
  renderAll();
}

function renderCloudPanel() {
  const panel = document.getElementById("cloudPanel");
  const summary = document.getElementById("cloudSummary");
  if (!panel || !summary) return;

  summary.textContent = cloudSummaryText();
  const status = cloudMessage.text ? cloudMessage : defaultCloudStatus();
  const loggedIn = Boolean(cloudSession && cloudSession.user);
  const configured = hasCloudConfig();
  const sdkReady = cloudSdkReady();
  const authDisabled = !configured || !sdkReady || cloudSyncing;
  const syncDisabled = !configured || !sdkReady || !loggedIn || cloudSyncing;
  const userLabel = loggedIn ? escapeHtml(cloudSession.user.email || "已登录账号") : "未登录";
  const lastText = cloudLastSyncedAt ? formatCloudTime(cloudLastSyncedAt) : "尚未同步";

  panel.innerHTML = `
    <div class="cloud-status ${status.tone || ""}">
      <div>
        <strong>${escapeHtml(status.text)}</strong>
        <span>账号：${userLabel} · 云端：${lastText}</span>
      </div>
      <span>${cloudAutoSync ? "自动同步已开启" : "自动同步已关闭"}</span>
    </div>

    <div class="cloud-grid">
      <label class="cloud-field">
        Supabase Project URL
        <input class="cloud-input" id="cloudUrl" value="${escapeHtml(cloudConfig.url)}" placeholder="https://xxxx.supabase.co">
      </label>
      <label class="cloud-field">
        anon public key
        <input class="cloud-input" id="cloudAnonKey" type="password" value="${escapeHtml(cloudConfig.anonKey)}" placeholder="只填写 anon public key">
      </label>
    </div>

    <div class="cloud-auth">
      <label class="cloud-field">
        邮箱
        <input class="cloud-input" id="cloudEmail" type="email" autocomplete="email" placeholder="你的邮箱">
      </label>
      <label class="cloud-field">
        密码
        <input class="cloud-input" id="cloudPassword" type="password" autocomplete="current-password" placeholder="至少 6 位">
      </label>
      <button class="cloud-primary" id="cloudSignIn" ${authDisabled ? "disabled" : ""}>登录</button>
      <button class="cloud-ghost" id="cloudSignUp" ${authDisabled ? "disabled" : ""}>注册</button>
      <button class="cloud-ghost" id="cloudSignOut" ${!loggedIn || cloudSyncing ? "disabled" : ""}>退出</button>
    </div>

    <div class="cloud-actions">
      <label class="cloud-auto">
        <input id="cloudAutoSync" type="checkbox" ${cloudAutoSync ? "checked" : ""}>
        本地修改后自动同步
      </label>
      <div class="cloud-button-row">
        <button class="cloud-ghost" id="cloudSaveConfig">保存配置</button>
        <button class="cloud-ghost" id="cloudClearConfig">清除配置</button>
        <button class="cloud-primary" id="cloudPush" ${syncDisabled ? "disabled" : ""}>同步到云端</button>
        <button class="cloud-ghost" id="cloudPull" ${syncDisabled ? "disabled" : ""}>从云端恢复</button>
      </div>
    </div>
  `;

  attachCloudEvents();
}

function readCloudAccountFields() {
  return {
    email: document.getElementById("cloudEmail").value.trim(),
    password: document.getElementById("cloudPassword").value
  };
}

function attachCloudEvents() {
  const auto = document.getElementById("cloudAutoSync");
  if (auto) {
    auto.addEventListener("change", event => {
      cloudAutoSync = event.target.checked;
      localStorage.setItem(cloudAutoSyncKey, cloudAutoSync ? "on" : "off");
      setCloudMessage(cloudAutoSync ? "自动同步已开启。" : "自动同步已关闭。", cloudAutoSync ? "ok" : "warn");
      if (cloudAutoSync) scheduleCloudSync(300);
    });
  }

  document.getElementById("cloudSaveConfig").addEventListener("click", async () => {
    const url = document.getElementById("cloudUrl").value.trim().replace(/\/+$/, "");
    const anonKey = document.getElementById("cloudAnonKey").value.trim();
    if (!url || !anonKey) {
      setCloudMessage("请先填写 Project URL 和 anon public key。", "warn");
      return;
    }
    cloudConfig = { url, anonKey };
    localStorage.setItem(cloudConfigKey, JSON.stringify(cloudConfig));
    await initCloud(true);
    setCloudMessage("配置已保存，登录后即可同步。", "ok");
  });

  document.getElementById("cloudClearConfig").addEventListener("click", async () => {
    if (!confirm("确定清除 Supabase 配置吗？本地打卡进度不会删除。")) return;
    if (cloudClient) await cloudClient.auth.signOut();
    localStorage.removeItem(cloudConfigKey);
    cloudConfig = { url: "", anonKey: "" };
    cloudClient = null;
    cloudSession = null;
    cloudLastSyncedAt = "";
    setCloudMessage("已清除云同步配置，本地保存继续可用。", "warn");
  });

  document.getElementById("cloudSignIn").addEventListener("click", signInCloud);
  document.getElementById("cloudSignUp").addEventListener("click", signUpCloud);
  document.getElementById("cloudSignOut").addEventListener("click", signOutCloud);
  document.getElementById("cloudPush").addEventListener("click", () => pushCloudState(true));
  document.getElementById("cloudPull").addEventListener("click", pullCloudState);
}

async function initCloud(silent = false) {
  if (!hasCloudConfig()) {
    cloudClient = null;
    cloudSession = null;
    if (!silent) renderCloudPanel();
    return;
  }
  if (!cloudSdkReady()) {
    try {
      await loadSupabaseSdk();
    } catch (error) {
      cloudClient = null;
      cloudSession = null;
      setCloudMessage(`${error.message}，请检查网络后重试。`, "error");
      return;
    }
  }
  try {
    cloudClient = window.supabase.createClient(cloudConfig.url, cloudConfig.anonKey);
  } catch (error) {
    cloudClient = null;
    cloudSession = null;
    setCloudMessage(`Supabase 初始化失败：${error.message}`, "error");
    return;
  }

  if (cloudAuthSubscription && typeof cloudAuthSubscription.unsubscribe === "function") {
    cloudAuthSubscription.unsubscribe();
  }

  const { data, error } = await cloudClient.auth.getSession();
  if (error) {
    setCloudMessage(`读取登录状态失败：${error.message}`, "error");
    return;
  }
  cloudSession = data.session;
  const authChange = cloudClient.auth.onAuthStateChange((_event, session) => {
    cloudSession = session;
    renderAfterAuthChange();
    if (!cloudSession || !cloudSession.user) loadPublicSnapshot();
  });
  cloudAuthSubscription = authChange.data && authChange.data.subscription;
  if (!cloudSession || !cloudSession.user) {
    await loadPublicSnapshot();
  }
  if (!silent) renderCloudPanel();
}

async function loadPublicSnapshot() {
  if (!cloudClient) return;
  const { data, error } = await cloudClient
    .from(publicSnapshotTableName)
    .select("state_json, updated_at")
    .eq("id", publicSnapshotId)
    .maybeSingle();
  if (error) {
    setCloudMessage(`读取公开存档失败：${error.message}`, "error");
    return;
  }
  if (!data) {
    setCloudMessage("云端还没有公开存档，登录同步后会显示。", "warn");
    return;
  }
  cloudSyncPaused = true;
  state = data.state_json && typeof data.state_json === "object" ? data.state_json : {};
  localStorage.setItem(storageKey, JSON.stringify(state));
  cloudSyncPaused = false;
  cloudLastSyncedAt = data.updated_at || "";
  renderAll();
  setCloudMessage("已载入最新云端存档，当前为只读预览。", "ok");
}

async function signUpCloud() {
  if (!cloudClient) await initCloud(true);
  if (!cloudClient) return;
  const { email, password } = readCloudAccountFields();
  if (!email || password.length < 6) {
    setCloudMessage("请输入邮箱和至少 6 位密码。", "warn");
    return;
  }
  setCloudMessage("正在注册账号。", "ok");
  const { data, error } = await cloudClient.auth.signUp({ email, password });
  if (error) {
    setCloudMessage(`注册失败：${error.message}`, "error");
    return;
  }
  cloudSession = data.session || cloudSession;
  if (cloudSession) {
    renderAll();
    await inspectCloudAfterLogin();
  } else {
    setCloudMessage("注册成功，请按 Supabase 邮件确认后再登录。", "ok");
  }
}

async function signInCloud() {
  if (!cloudClient) await initCloud(true);
  if (!cloudClient) return;
  const { email, password } = readCloudAccountFields();
  if (!email || !password) {
    setCloudMessage("请输入邮箱和密码。", "warn");
    return;
  }
  setCloudMessage("正在登录。", "ok");
  const { data, error } = await cloudClient.auth.signInWithPassword({ email, password });
  if (error) {
    setCloudMessage(`登录失败：${error.message}`, "error");
    return;
  }
  cloudSession = data.session;
  renderAll();
  await inspectCloudAfterLogin();
}

async function signOutCloud() {
  if (!cloudClient) return;
  const { error } = await cloudClient.auth.signOut();
  if (error) {
    setCloudMessage(`退出失败：${error.message}`, "error");
    return;
  }
  cloudSession = null;
  setCloudMessage("已退出登录。", "warn");
  await loadPublicSnapshot();
  renderAll();
}

async function inspectCloudAfterLogin() {
  if (!cloudClient || !cloudSession || !cloudSession.user) return;
  const { data, error } = await cloudClient
    .from(cloudTableName)
    .select("updated_at")
    .eq("user_id", cloudSession.user.id)
    .maybeSingle();
  if (error) {
    setCloudMessage(`登录成功，但读取云端进度失败：${error.message}`, "error");
    return;
  }
  if (data) {
    cloudLastSyncedAt = data.updated_at || "";
    setCloudMessage("登录成功。云端已有进度，需要时可点“从云端恢复”。", "ok");
    return;
  }
  await pushCloudState(true);
}

function scheduleCloudSync(delay = 1200) {
  if (cloudSyncPaused || !cloudAutoSync || !cloudClient || !cloudSession || !cloudSession.user) return;
  window.clearTimeout(cloudSyncTimer);
  cloudSyncTimer = window.setTimeout(() => {
    pushCloudState(false);
  }, delay);
}

async function pushCloudState(manual = false) {
  if (!cloudClient || !cloudSession || !cloudSession.user) {
    if (manual) setCloudMessage("先登录后再同步到云端。", "warn");
    return;
  }
  if (cloudSyncing) return;
  cloudSyncing = true;
  setCloudMessage(manual ? "正在同步到云端。" : "正在自动同步。", "ok");
  const now = new Date().toISOString();
  const { error } = await cloudClient
    .from(cloudTableName)
    .upsert({
      user_id: cloudSession.user.id,
      state_json: state,
      updated_at: now
    }, { onConflict: "user_id" });
  cloudSyncing = false;
  if (error) {
    setCloudMessage(`同步失败：${error.message}`, "error");
    return;
  }
  const { error: publicError } = await cloudClient
    .from(publicSnapshotTableName)
    .upsert({
      id: publicSnapshotId,
      user_id: cloudSession.user.id,
      state_json: state,
      updated_at: now
    }, { onConflict: "id" });
  if (publicError) {
    cloudLastSyncedAt = now;
    setCloudMessage(`私有进度已同步，公开预览更新失败：${publicError.message}`, "warn");
    return;
  }
  cloudLastSyncedAt = now;
  setCloudMessage(manual ? "已同步到云端。" : "已自动同步。", "ok");
}

async function pullCloudState() {
  if (!cloudClient || !cloudSession || !cloudSession.user) {
    setCloudMessage("先登录后再从云端恢复。", "warn");
    return;
  }
  const { data, error } = await cloudClient
    .from(cloudTableName)
    .select("state_json, updated_at")
    .eq("user_id", cloudSession.user.id)
    .maybeSingle();
  if (error) {
    setCloudMessage(`读取云端进度失败：${error.message}`, "error");
    return;
  }
  if (!data) {
    setCloudMessage("云端还没有进度，可先同步到云端。", "warn");
    return;
  }
  if (!confirm("从云端恢复会覆盖当前浏览器里的本地进度，确定继续吗？")) return;
  cloudSyncPaused = true;
  state = data.state_json && typeof data.state_json === "object" ? data.state_json : {};
  localStorage.setItem(storageKey, JSON.stringify(state));
  cloudSyncPaused = false;
  cloudLastSyncedAt = data.updated_at || "";
  setCloudMessage("已从云端恢复。", "ok");
  renderAll();
}
