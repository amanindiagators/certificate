export const AUTH_KEY = "auth_user";
export const TOKEN_KEY = "auth_token";

function getLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

export function getStoredToken() {
  const storage = getLocalStorage();
  return storage?.getItem(TOKEN_KEY) || null;
}

export function getStoredUser() {
  const storage = getLocalStorage();
  const raw = storage?.getItem(AUTH_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    clearAuthStorage();
    return null;
  }
}

export function persistAuthSession(token, user) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  storage.setItem(TOKEN_KEY, token);
  storage.setItem(AUTH_KEY, JSON.stringify(user));

  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(AUTH_KEY);
  }
}

export function clearAuthStorage() {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(AUTH_KEY);
  }

  const storage = getLocalStorage();
  storage?.removeItem(TOKEN_KEY);
  storage?.removeItem(AUTH_KEY);
}
