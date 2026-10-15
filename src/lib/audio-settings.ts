export interface AudioSettings {
  inputVolume: number;
  outputVolume: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
}
const KEY = 'tuga.audioSettings';
const EVENT = 'tuga:audio-settings';
const defaults: AudioSettings = { inputVolume: 100, outputVolume: 100, noiseSuppression: true, echoCancellation: true };
export function getAudioSettings(): AudioSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    const clamp = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
    return { inputVolume: clamp(stored.inputVolume, 100), outputVolume: clamp(stored.outputVolume, 100), noiseSuppression: stored.noiseSuppression !== false, echoCancellation: stored.echoCancellation !== false };
  } catch { return { ...defaults }; }
}
export function setAudioSettings(patch: Partial<AudioSettings>) {
  const settings = { ...getAudioSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(EVENT));
}
export function subscribeAudioSettings(listener: (settings: AudioSettings) => void) {
  const changed = () => listener(getAudioSettings());
  window.addEventListener(EVENT, changed);
  window.addEventListener('storage', changed);
  return () => { window.removeEventListener(EVENT, changed); window.removeEventListener('storage', changed); };
}
const disposers = new WeakMap<MediaStreamTrack, () => void>();
export function stopTrack(track: MediaStreamTrack) {
  disposers.get(track)?.();
  disposers.delete(track);
  track.stop();
}
export function stopStream(stream: MediaStream | null | undefined) { stream?.getTracks().forEach(stopTrack); }
export async function createMicrophoneStream(deviceId = localStorage.getItem('melo.audioDevice') || '') {
  const settings = getAudioSettings();
  const audio: MediaTrackConstraints = { echoCancellation: settings.echoCancellation, noiseSuppression: settings.noiseSuppression, autoGainControl: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) };
  let raw: MediaStream;
  try { raw = await navigator.mediaDevices.getUserMedia({ audio, video: false }); }
  catch (error) {
    if (!deviceId || !(error instanceof DOMException) || !['NotFoundError', 'OverconstrainedError'].includes(error.name)) throw error;
    delete audio.deviceId;
    raw = await navigator.mediaDevices.getUserMedia({ audio, video: false });
  }
  let context: AudioContext | null = null;
  try {
    context = new AudioContext();
    await context.resume();
    const source = context.createMediaStreamSource(raw);
    const gain = context.createGain();
    gain.gain.value = settings.inputVolume / 100;
    const destination = context.createMediaStreamDestination();
    source.connect(gain).connect(destination);
    const off = subscribeAudioSettings((next) => {
      gain.gain.setTargetAtTime(next.inputVolume / 100, context!.currentTime, 0.015);
      void raw.getAudioTracks()[0]?.applyConstraints({ noiseSuppression: next.noiseSuppression, echoCancellation: next.echoCancellation, autoGainControl: true }).catch(() => undefined);
    });
    let disposed = false;
    const dispose = () => { if (disposed) return; disposed = true; off(); raw.getTracks().forEach((track) => track.stop()); source.disconnect(); gain.disconnect(); void context!.close().catch(() => undefined); };
    destination.stream.getTracks().forEach((track) => { disposers.set(track, dispose); track.addEventListener('ended', dispose, { once: true }); });
    raw.getAudioTracks()[0]?.addEventListener('ended', () => stopStream(destination.stream), { once: true });
    return destination.stream;
  } catch (error) { raw.getTracks().forEach((track) => track.stop()); void context?.close(); throw error; }
}
