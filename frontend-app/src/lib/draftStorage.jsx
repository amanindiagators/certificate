const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 minutes

function nowMs() {
  return Date.now();
}

export function loadDraftWithTTL(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const expiresAt = Number(parsed?.expiresAt || 0);
    if (!expiresAt || nowMs() > expiresAt) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed?.data ?? null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function saveDraftWithTTL(key, data, ttlMs = DEFAULT_TTL_MS) {
  try {
    const expiresAt = nowMs() + Number(ttlMs || DEFAULT_TTL_MS);
    const payload = {
      savedAt: nowMs(),
      expiresAt,
      data,
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore storage errors (private mode/full quota).
  }
}

export function clearDraft(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
}

export const ONE_HOUR_DRAFT_TTL_MS = DEFAULT_TTL_MS;
