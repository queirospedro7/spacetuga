export interface ShareSettings { quality: '720' | '1080' | '1440'; fps: 15 | 30 | 60 }
export function getShareSettings(): ShareSettings {
  try {
    const value = JSON.parse(localStorage.getItem('tuga.shareSettings') || '{}');
    return { quality: ['720', '1080', '1440'].includes(value.quality) ? value.quality : '1080', fps: [15, 30, 60].includes(value.fps) ? value.fps : 30 };
  } catch { return { quality: '1080', fps: 30 }; }
}
export function setShareSettings(value: ShareSettings) { localStorage.setItem('tuga.shareSettings', JSON.stringify(value)); window.dispatchEvent(new Event('tuga:share-settings')); }
export function subscribeShareSettings(listener: () => void) { window.addEventListener('tuga:share-settings', listener); return () => window.removeEventListener('tuga:share-settings', listener); }
export async function applyShareSettings(track: MediaStreamTrack) {
  const { quality, fps } = getShareSettings();
  const [width, height] = quality === '720' ? [1280, 720] : quality === '1440' ? [2560, 1440] : [1920, 1080];
  track.contentHint = fps === 60 ? 'motion' : 'detail';
  await track.applyConstraints({ width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: fps, max: fps } });
}
