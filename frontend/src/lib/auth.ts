const TOKEN_KEY = "verae_token";
const LAST_ANALYSIS_KEY = "verae_last_analysis_id";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

export function getToken(): string | null {
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

export function setToken(token: string): void {
  storage()?.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  storage()?.removeItem(TOKEN_KEY);
}

export function setLastAnalysisId(id: string): void {
  storage()?.setItem(LAST_ANALYSIS_KEY, id);
}

export function getLastAnalysisId(): string | null {
  return storage()?.getItem(LAST_ANALYSIS_KEY) ?? null;
}

export async function fetchWithAuth(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
    throw new Error("Unauthorized");
  }

  return response;
}
