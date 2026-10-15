export function readNumberPreference(key: string, fallback: number, min: number, max: number) {
  try { const stored = localStorage.getItem(key); const value = stored === null ? fallback : Number(stored); return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback; } catch { return fallback; }
}
