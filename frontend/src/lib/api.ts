import { fetchWithAuth } from "@/lib/auth";

type ApiErrorPayload = {
  detail?: string | { message?: string };
};

export type AnalysisStatus = "pending" | "processing" | "completed" | "failed";

export type AnalysisItem = {
  analysis_id: string;
  status: AnalysisStatus;
  created_at: string;
};

export type AnalysisStatusResponse = {
  analysis_id: string;
  status: AnalysisStatus;
  progress_stage?: string | null;
  created_at: string;
  updated_at: string;
};

export type PredictResponse = {
  status?: "ok" | "needs_input";
  iron_index?: number;
  risk_percent?: number;
  risk_tier?: "HIGH" | "WARNING" | "GRAY" | "LOW";
  clinical_action?: string;
  confidence?: "high" | "medium" | "low";
  explanations?: Array<{ feature?: string; label?: string; text?: string; direction?: string }>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

async function parseError(response: Response, fallback: string): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as ApiErrorPayload;
  const message =
    typeof body.detail === "string"
      ? body.detail
      : body.detail?.message ?? fallback;

  throw new Error(message);
}

export async function login(email: string, password: string) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    await parseError(response, "Login failed");
  }

  return response.json() as Promise<{ access_token: string }>;
}

export async function register(email: string, password: string) {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    await parseError(response, "Registration failed");
  }

  return response.json() as Promise<{ access_token: string }>;
}

export async function createAnalysis(upload: Record<string, unknown>, lab: Record<string, number>) {
  const response = await fetchWithAuth(`${API_BASE}/analyses`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ upload, lab }),
  });

  if (!response.ok) {
    await parseError(response, "Create analysis failed");
  }

  return response.json() as Promise<{ analysis_id: string }>;
}

export async function listAnalyses() {
  const response = await fetchWithAuth(`${API_BASE}/analyses`);
  if (!response.ok) {
    await parseError(response, "Failed to list analyses");
  }
  return response.json() as Promise<{ analyses: AnalysisItem[] }>;
}

export async function getAnalysisStatus(analysisId: string): Promise<AnalysisStatusResponse | null> {
  const response = await fetchWithAuth(`${API_BASE}/analyses/${analysisId}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    await parseError(response, "Failed to get status");
  }
  return response.json() as Promise<AnalysisStatusResponse>;
}

export async function getAnalysisResult(analysisId: string): Promise<PredictResponse | null> {
  const response = await fetchWithAuth(`${API_BASE}/analyses/${analysisId}/result`);
  if (response.status === 404 || response.status === 409) return null;
  if (!response.ok) {
    await parseError(response, "Failed to get result");
  }
  return response.json() as Promise<PredictResponse>;
}
