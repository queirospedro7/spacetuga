// Gestor de volumes individuais e partilha de ecrã para utilizadores locais
const STORAGE_PREFIX = 'tuga.userVolume.';
const SCREEN_VOLUME_KEY = 'tuga.screenVolume';

type VolumeChangeListener = (userId: string, volume: number) => void;
const listeners = new Set<VolumeChangeListener>();

export function getUserVolume(userId: string): number {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (raw !== null) {
      const val = Number(raw);
      if (Number.isFinite(val) && val >= 0 && val <= 200) return val;
    }
  } catch { /* Armazenamento local indisponível. */ }
  return 100;
}

export function setUserVolume(userId: string, volume: number) {
  if (!Number.isFinite(volume)) return;
  const clamped = Math.max(0, Math.min(200, Math.round(volume)));
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, String(clamped));
  } catch { /* Armazenamento local indisponível. */ }
  listeners.forEach((cb) => cb(userId, clamped));
}

export function getScreenShareVolume(): number {
  try {
    const raw = localStorage.getItem(SCREEN_VOLUME_KEY);
    if (raw !== null) {
      const val = Number(raw);
      if (Number.isFinite(val) && val >= 0 && val <= 200) return val;
    }
  } catch { /* Armazenamento local indisponível. */ }
  return 100;
}

export function setScreenShareVolume(volume: number) {
  if (!Number.isFinite(volume)) return;
  const clamped = Math.max(0, Math.min(200, Math.round(volume)));
  try {
    localStorage.setItem(SCREEN_VOLUME_KEY, String(clamped));
  } catch { /* Armazenamento local indisponível. */ }
  listeners.forEach((cb) => cb('__screenshare__', clamped));
}

export function subscribeVolumeChange(callback: VolumeChangeListener): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
