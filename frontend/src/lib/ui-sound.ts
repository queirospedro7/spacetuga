let lastReceive = 0;
let soundContext: AudioContext | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
export function playUiSound(kind: 'send' | 'receive' | 'join' | 'leave' | 'call' = 'send') {
  if (kind === 'receive') { if (Date.now() - lastReceive < 700) return; lastReceive = Date.now(); }
  if (kind === 'call' ? localStorage.getItem('tuga.callSounds') === 'false' : localStorage.getItem('melo.sounds') === 'false') return;
  const volume = Math.max(0, Math.min(100, Number(localStorage.getItem('melo.soundVolume') ?? 28))) / 100;
  if (!volume) return;
  try {
    const context = soundContext ||= new AudioContext();
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => { if (soundContext === context) { soundContext = null; void context.close().catch(() => undefined); } releaseTimer = null; }, 800);
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const notes = kind === 'join' ? [660, 880] : kind === 'leave' ? [520, 390] : kind === 'call' ? [740, 990] : [620];
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(notes[0], context.currentTime);
    if (notes[1]) oscillator.frequency.setValueAtTime(notes[1], context.currentTime + 0.055);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * 0.06), context.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.14);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.15);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch { /* Audio output may be unavailable or blocked until a user gesture. */ }
}
