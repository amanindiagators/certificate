const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

const rawBackendUrl =
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.NEXT_PUBLIC_BACKEND_URL ||
  import.meta.env.REACT_APP_BACKEND_URL ||
  DEFAULT_BACKEND_URL;

export const BACKEND_URL = rawBackendUrl.replace(/\/+$/, "");
export const API_PREFIX = `${BACKEND_URL}/api`;

if (
  typeof window !== "undefined" &&
  !import.meta.env.VITE_BACKEND_URL &&
  !import.meta.env.NEXT_PUBLIC_BACKEND_URL &&
  !import.meta.env.REACT_APP_BACKEND_URL
) {
  console.warn(
    `Backend URL env is not set. Falling back to ${DEFAULT_BACKEND_URL}.`
  );
}
