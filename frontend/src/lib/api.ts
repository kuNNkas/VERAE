import { fetchWithAuth } from "@/lib/auth";

type ApiErrorPayload = {
  detail?: string | { message?: string };
};

export type AnalysisStatus = "queued" | "processing" | "completed" | "failed";

export type ProgressStage =
  | "queued"
  | "validating_input"
  | "preprocessing"
  | "model_inference"
  | "postprocessing"
  | "completed"
  | "failed";

export type AnalysisItem = {
  analysis_id: string;
  status: AnalysisStatus;
  created_at: string;
};

export type AnalysisStatusResponse = {
  analysis_id: string;
  status: AnalysisStatus;
  progress_stage: ProgressStage;
  error_code: string | null;
  updated_at: string;
};

export type PredictExplanation = {
  feature: string;
  label: string;
  impact: number;
  direction: "negative" | "positive";
  text: string;
};

export type PredictResponseOk = {
  status: "ok";
  confidence: "low" | "medium" | "high";
  model_name: string;
  missing_required_fields: string[];
  iron_index: number;
  risk_percent: number;
  risk_tier: "HIGH" | "WARNING" | "GRAY" | "LOW";
  clinical_action: string;
  explanations: PredictExplanation[];
};

export type PredictResponseNeedsInput = {
  status: "needs_input";
  confidence: "low";
  model_name: string;
  missing_required_fields: string[];
  iron_index: null;
  risk_percent: null;
  risk_tier: null;
  clinical_action: null;
  explanations: PredictExplanation[];
};

export type PredictResponse = PredictResponseOk | PredictResponseNeedsInput;

export type UserInfo = {
  id: string;
  email: string;
  created_at: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: UserInfo;
};

export type UploadMetadata = {
  filename: string;
  content_type: string;
  size_bytes: number;
  checksum_sha256?: string;
  source?: string;
};

export type CreateAnalysisResponse = {
  analysis_id: string;
  user_id: string;
  status: AnalysisStatus;
  progress_stage: ProgressStage;
  job: {
    id: string;
    status: "queued";
  };
  created_at: string;
  updated_at: string;
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

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    await parseError(response, "Login failed");
  }

  return response.json() as Promise<AuthResponse>;
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    await parseError(response, "Registration failed");
  }

  return response.json() as Promise<AuthResponse>;
}

export async function createAnalysis(
  upload: UploadMetadata,
  lab: Record<string, number>,
): Promise<CreateAnalysisResponse> {
  const response = await fetchWithAuth(`${API_BASE}/analyses`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ upload, lab }),
  });

  if (!response.ok) {
    await parseError(response, "Create analysis failed");
  }

  return response.json() as Promise<CreateAnalysisResponse>;
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
