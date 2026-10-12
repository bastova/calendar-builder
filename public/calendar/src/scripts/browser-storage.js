/** Small UI preferences use localStorage; directory references use IndexedDB; photo contents are never persisted. */
export function readPreference(key, fallback) {
  try { const value = localStorage.getItem(`calendar-ui:${key}`); return value === null ? fallback : JSON.parse(value); }
  catch { return fallback; }
}
export function writePreference(key, value) {
  try { localStorage.setItem(`calendar-ui:${key}`, JSON.stringify(value)); }
  catch { reportStorageFailure(); }
}
export function reportStorageFailure() {
  window.dispatchEvent(new CustomEvent('calendar-storage-error'));
}
