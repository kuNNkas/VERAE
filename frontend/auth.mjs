const TOKEN_KEY = "verae_token";
const STORAGE = sessionStorage;

export function getToken() {
  return STORAGE.getItem(TOKEN_KEY);
}

export function setToken(token) {
  STORAGE.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  STORAGE.removeItem(TOKEN_KEY);
}

/**
 * Fetch with Authorization Bearer. On 401: clearToken() and redirect to login.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
export async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    window.location.hash = "#login";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    throw new Error("Unauthorized");
  }
  return res;
}
