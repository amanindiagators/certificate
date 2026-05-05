export function getApiErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .join(" ");
  }
  return fallback;
}
