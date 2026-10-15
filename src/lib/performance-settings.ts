export function lightweightMode(): boolean {
  try { const preference = localStorage.getItem('tuga.lightweight'); return preference === null ? '__TAURI_INTERNALS__' in window : preference === 'true'; }
  catch { return '__TAURI_INTERNALS__' in window; }
}
export function setLightweightMode(enabled: boolean) {
  try { localStorage.setItem('tuga.lightweight', String(enabled)); } catch { /* Apply the preference for this session. */ }
  document.documentElement.classList.toggle('tuga-lightweight', enabled);
}
