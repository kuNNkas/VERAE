import { getToken, setToken, clearToken } from "./auth.mjs";
import {
  login as apiLogin,
  register as apiRegister,
  createAnalysis,
  getAnalysisStatus,
  getAnalysisResult,
  listAnalyses,
} from "./api.mjs";
import {
  REQUIRED_BASE,
  BMI_ALTERNATIVE,
  computeMissingRequired,
  computeProgress,
} from "./risk-form-logic.mjs";

const LAST_ANALYSIS_KEY = "verae_last_analysis_id";
const recommended = [
  "LBXLYPCT", "LBXMOPCT", "LBXNEPCT", "LBXEOPCT", "LBXBAPCT", "LBXMC",
  "LBXPLTSI", "LBXWBCSI", "LBXMPSI", "BP_SYS", "BP_DIA", "BMXWAIST",
  "LBXSCH", "LBXSGL",
];
const fields = [...new Set([...REQUIRED_BASE, ...BMI_ALTERNATIVE, ...recommended])];

let state = { screen: "login", analysisId: null, result: null, error: null, list: [] };
let pollingTimer = null;
const POLL_TIMEOUT_MS = 75000;
const POLL_INITIAL_MS = 1500;
const BACKOFF_START_AFTER_MS = 8000;
const MAX_POLL_INTERVAL_MS = 15000;

function getLastAnalysisId() {
  return sessionStorage.getItem(LAST_ANALYSIS_KEY);
}
function setLastAnalysisId(id) {
  sessionStorage.setItem(LAST_ANALYSIS_KEY, id);
}
function clearLastAnalysisId() {
  sessionStorage.removeItem(LAST_ANALYSIS_KEY);
}

function showScreen(name) {
  document.querySelectorAll("[data-screen]").forEach((el) => {
    el.hidden = el.dataset.screen !== name;
  });
  state.screen = name;
}

function guard() {
  const hash = (window.location.hash || "#login").slice(1).split("?")[0];
  const protectedRoutes = ["form", "status", "result", "list"];
  if (!getToken() && protectedRoutes.includes(hash)) {
    window.location.hash = "login";
    return true;
  }
  return false;
}

function applyHash() {
  if (guard()) return;
  const hash = window.location.hash || "#form";
  const [path, qs] = hash.slice(1).split("?");
  const params = new URLSearchParams(qs || "");
  if (path === "login") {
    showScreen("login");
    return;
  }
  if (path === "register") {
    showScreen("register");
    return;
  }
  if (path === "form") {
    showScreen("form");
    renderForm();
    return;
  }
  if (path === "status" && params.get("id")) {
    state.analysisId = params.get("id");
    showScreen("status");
    startPolling(state.analysisId);
    return;
  }
  if (path === "result") {
    const id = params.get("id") || getLastAnalysisId();
    if (id) {
      state.analysisId = id;
      showScreen("result");
      loadResult(id);
    } else {
      showScreen("form");
      renderForm();
    }
    return;
  }
  if (path === "list") {
    showScreen("list");
    loadList();
    return;
  }
  window.location.hash = "form";
  showScreen("form");
  renderForm();
}

function renderForm() {
  const form = document.getElementById("riskForm");
  if (!form) return;
  form.innerHTML = "";
  fields.forEach((name) => {
    const label = document.createElement("label");
    label.className =
      REQUIRED_BASE.includes(name) || BMI_ALTERNATIVE.includes(name) ? "required" : "";
    label.textContent =
      name + (recommended.includes(name) ? " (повышает точность)" : "");
    const input = document.createElement("input");
    input.name = name;
    input.type = "number";
    input.step = "any";
    input.oninput = updateFormProgress;
    label.appendChild(input);
    form.appendChild(label);
  });
  updateFormProgress();
  const lastBtn = document.getElementById("openLastResultBtn");
  if (lastBtn) {
    lastBtn.hidden = !getLastAnalysisId();
  }
}

function getFormPayload() {
  const form = document.getElementById("riskForm");
  if (!form) return {};
  const payload = {};
  for (const name of fields) {
    const el = form.querySelector(`[name="${name}"]`);
    const v = el?.value?.trim();
    if (v !== "") payload[name] = Number(v);
  }
  return payload;
}

function updateFormProgress() {
  const progressEl = document.getElementById("progress");
  if (progressEl) {
    const done = computeProgress(
      Object.fromEntries(
        fields.map((n) => {
          const el = document.querySelector(`[name="${n}"]`);
          return [n, el?.value ?? ""];
        })
      )
    );
    progressEl.textContent = `${done}/8`;
  }
}

async function onSubmitAnalyze(e) {
  e.preventDefault();
  const payload = getFormPayload();
  const missing = computeMissingRequired(payload);
  const errEl = document.getElementById("formError");
  if (errEl) errEl.textContent = "";
  if (missing.length) {
    if (errEl) errEl.textContent = `Заполните обязательные поля: ${missing.join(", ")}`;
    return;
  }
  const lab = {};
  for (const k of fields) {
    if (payload[k] !== undefined) lab[k] = payload[k];
  }
  const labJson = JSON.stringify(lab);
  const upload = {
    filename: "manual.json",
    content_type: "application/json",
    size_bytes: new TextEncoder().encode(labJson).length,
  };
  try {
    const data = await createAnalysis(upload, lab);
    setLastAnalysisId(data.analysis_id);
    state.analysisId = data.analysis_id;
    window.location.hash = `#status?id=${data.analysis_id}`;
    applyHash();
  } catch (err) {
    if (errEl) errEl.textContent = err.message || "Ошибка создания анализа";
  }
}

async function loadResult(id) {
  const container = document.getElementById("resultContent");
  const errEl = document.getElementById("resultError");
  if (errEl) errEl.textContent = "";
  if (container) container.textContent = "Загрузка…";
  try {
    const statusRes = await getAnalysisStatus(id);
    if (!statusRes) {
      clearLastAnalysisId();
      if (errEl) errEl.textContent = "Анализ не найден.";
      if (container) container.innerHTML = "";
      return;
    }
    if (statusRes.status === "failed") {
      if (errEl) errEl.textContent = "Обработка завершилась с ошибкой. Создайте новый анализ.";
      if (container) container.innerHTML = "";
      return;
    }
    if (statusRes.status !== "completed") {
      if (errEl) errEl.textContent = "Результат ещё не готов. Подождите или создайте новый анализ.";
      if (container) container.innerHTML = "";
      return;
    }
    const result = await getAnalysisResult(id);
    if (!result) {
      if (errEl) errEl.textContent = "Не удалось загрузить результат.";
      return;
    }
    state.result = result;
    renderResult(result);
  } catch (err) {
    if (errEl) errEl.textContent = err.message || "Ошибка загрузки результата";
    if (container) container.innerHTML = "";
  }
}

function renderResult(result) {
  const container = document.getElementById("resultContent");
  if (!container) return;
  const tierOrder = ["LOW", "GRAY", "WARNING", "HIGH"];
  const tierIndex = tierOrder.indexOf(result.risk_tier || "GRAY");
  const percent = (tierIndex + 1) / 4 * 100;
  let html = `
    <div class="result-block">
      <p><strong>Риск:</strong> ${result.risk_tier || "—"} ${result.risk_percent != null ? `(${result.risk_percent}%)` : ""}</p>
      <div class="risk-bar"><div class="risk-fill" style="width:${percent}%"></div></div>
      <p class="tier-labels">LOW — GRAY — WARNING — HIGH</p>
      ${result.clinical_action ? `<p><strong>Рекомендация:</strong> ${escapeHtml(result.clinical_action)}</p>` : ""}
      ${result.confidence ? `<p><strong>Уверенность:</strong> ${escapeHtml(result.confidence)}</p>` : ""}
    </div>
  `;
  if (result.explanations && result.explanations.length) {
    html += `<details class="explanations-block"><summary>Подробнее: что повлияло на оценку</summary><ul>`;
    for (const e of result.explanations) {
      html += `<li><strong>${escapeHtml(e.label || e.feature)}</strong>: ${escapeHtml(e.text || "")} (${e.direction === "negative" ? "↓" : "↑"})</li>`;
    }
    html += `</ul></details>`;
  }
  container.innerHTML = html;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function startPolling(analysisId) {
  stopPolling();
  const statusEl = document.getElementById("statusText");
  const errEl = document.getElementById("statusError");
  const start = Date.now();
  let pollInterval = POLL_INITIAL_MS;
  let nextPollAt = start + pollInterval;

  async function tick() {
    if (state.screen !== "status" || state.analysisId !== analysisId) {
      stopPolling();
      return;
    }
    const elapsed = Date.now() - start;
    if (elapsed >= POLL_TIMEOUT_MS) {
      if (statusEl) statusEl.textContent = "";
      if (errEl) errEl.textContent = "Слишком долго. Попробуйте позже или создайте новый анализ.";
      stopPolling();
      return;
    }
    try {
      const data = await getAnalysisStatus(analysisId);
      if (!data) {
        if (errEl) errEl.textContent = "Анализ не найден.";
        stopPolling();
        return;
      }
      if (statusEl) statusEl.textContent = `Статус: ${data.status} (${data.progress_stage})`;
      if (data.status === "completed") {
        stopPolling();
        window.location.hash = `#result?id=${analysisId}`;
        applyHash();
        return;
      }
      if (data.status === "failed") {
        if (errEl) errEl.textContent = "Обработка завершилась с ошибкой. Создайте новый анализ.";
        stopPolling();
        return;
      }
    } catch (err) {
      if (errEl) errEl.textContent = err.message || "Ошибка запроса статуса.";
    }
    if (elapsed > BACKOFF_START_AFTER_MS) {
      pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL_MS);
    }
    nextPollAt = Date.now() + pollInterval;
    pollingTimer = setTimeout(tick, pollInterval);
  }
  pollingTimer = setTimeout(tick, pollInterval);
}

function stopPolling() {
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
}

async function onOpenLastResult(e) {
  e.preventDefault();
  const id = getLastAnalysisId();
  if (!id) return;
  window.location.hash = `#result?id=${id}`;
  applyHash();
}

async function loadList() {
  const container = document.getElementById("listContent");
  const errEl = document.getElementById("listError");
  if (errEl) errEl.textContent = "";
  try {
    const items = await listAnalyses();
    state.list = items.analyses || items || [];
    if (!container) return;
    if (state.list.length === 0) {
      container.innerHTML = "<p>Нет анализов.</p>";
      return;
    }
    container.innerHTML = state.list
      .map(
        (a) =>
          `<p><a href="#result?id=${a.analysis_id}">${a.analysis_id.slice(0, 8)}… — ${a.status} — ${a.created_at || ""}</a></p>`
      )
      .join("");
  } catch (err) {
    if (errEl) errEl.textContent = err.message || "Ошибка загрузки списка";
    if (container) container.innerHTML = "";
  }
}

function bindEvents() {
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById("loginEmail")?.value?.trim();
      const password = document.getElementById("loginPassword")?.value;
      const errEl = document.getElementById("loginError");
          if (errEl) errEl.textContent = "";
      if (!email || !password) {
        if (errEl) errEl.textContent = "Введите email и пароль.";
        return;
      }
      try {
        const data = await apiLogin(email, password);
        setToken(data.access_token);
        window.location.hash = "form";
        applyHash();
      } catch (err) {
        if (errEl) errEl.textContent = err.message || "Ошибка входа";
      }
    };
  }

  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    registerForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById("registerEmail")?.value?.trim();
      const password = document.getElementById("registerPassword")?.value;
      const errEl = document.getElementById("registerError");
      if (errEl) errEl.textContent = "";
      if (!email || !password) {
        if (errEl) errEl.textContent = "Введите email и пароль (не менее 8 символов).";
        return;
      }
      try {
        const data = await apiRegister(email, password);
        setToken(data.access_token);
        window.location.hash = "form";
        applyHash();
      } catch (err) {
        if (errEl) errEl.textContent = err.message || "Ошибка регистрации";
      }
    };
  }

  const submitBtn = document.getElementById("submitBtn");
  if (submitBtn) submitBtn.onclick = onSubmitAnalyze;

  const openLastBtn = document.getElementById("openLastResultBtn");
  if (openLastBtn) openLastBtn.onclick = onOpenLastResult;

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      clearToken();
      clearLastAnalysisId();
      window.location.hash = "login";
      applyHash();
    };
  }
}

function init() {
  bindEvents();
  window.addEventListener("hashchange", applyHash);
  applyHash();
}

init();
