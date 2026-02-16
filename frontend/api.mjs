import { fetchWithAuth } from "./auth.mjs";

const API_BASE =
  typeof window !== "undefined" && window.API_BASE
    ? window.API_BASE
    : "http://localhost:8000";

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail?.message || d.detail || "Login failed");
  }
  return res.json();
}

export async function register(email, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail?.message || d.detail || "Registration failed");
  }
  return res.json();
}

export async function createAnalysis(upload, lab) {
  const res = await fetchWithAuth(`${API_BASE}/analyses`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ upload, lab }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail?.message || JSON.stringify(d.detail) || "Create analysis failed");
  }
  return res.json();
}

export async function getAnalysisStatus(analysisId) {
  const res = await fetchWithAuth(`${API_BASE}/analyses/${analysisId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to get status");
  return res.json();
}

export async function getAnalysisResult(analysisId) {
  const res = await fetchWithAuth(`${API_BASE}/analyses/${analysisId}/result`);
  if (res.status === 404 || res.status === 409) return null;
  if (!res.ok) throw new Error("Failed to get result");
  return res.json();
}

export async function listAnalyses() {
  const res = await fetchWithAuth(`${API_BASE}/analyses`);
  if (!res.ok) throw new Error("Failed to list analyses");
  return res.json();
}
