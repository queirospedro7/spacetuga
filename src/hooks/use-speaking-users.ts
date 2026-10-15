import { useEffect, useRef, useState } from 'react';

type Meter = { track: MediaStreamTrack; source: MediaStreamAudioSourceNode; analyser: AnalyserNode; samples: Float32Array<ArrayBuffer>; lastVoice: number };

export function useSpeakingUsers(streams: Record<string, MediaStream | null | undefined>, enabled = true) {
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const contextRef = useRef<AudioContext | null>(null);
  const silentRef = useRef<GainNode | null>(null);
  const metersRef = useRef(new Map<string, Meter>());
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
    const update = () => { const context = contextRef.current; if (!context || context.state === 'closed') return; if (enabled && document.visibilityState === 'visible') void context.resume().catch(() => undefined); else void context.suspend().catch(() => undefined); };
    update(); document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [enabled]);

  useEffect(() => {
    const meters = metersRef.current;
    for (const [id, meter] of meters) {
      const track = streams[id]?.getAudioTracks().find((candidate) => candidate.readyState === 'live');
      if (track !== meter.track) { meter.source.disconnect(); meter.analyser.disconnect(); meters.delete(id); }
    }
    for (const [id, stream] of Object.entries(streams)) {
      const track = stream?.getAudioTracks().find((candidate) => candidate.readyState === 'live');
      if (!track || meters.has(id)) continue;
      try {
        const context = contextRef.current ||= new AudioContext();
        if (!silentRef.current) { const silent = context.createGain(); silent.gain.value = 0; silent.connect(context.destination); silentRef.current = silent; }
        const source = context.createMediaStreamSource(new MediaStream([track]));
        const analyser = context.createAnalyser(); analyser.fftSize = 512;
        source.connect(analyser).connect(silentRef.current);
        meters.set(id, { track, source, analyser, samples: new Float32Array(512), lastVoice: 0 });
        if (enabled && document.visibilityState === 'visible') void context.resume().catch(() => undefined);
        else void context.suspend().catch(() => undefined);
      } catch { /* Keep the call usable if metering is unavailable. */ }
    }
    if (!meters.size && contextRef.current) {
      silentRef.current?.disconnect(); silentRef.current = null;
      void contextRef.current.close().catch(() => undefined); contextRef.current = null;
    }
  }, [streams, enabled]);

  useEffect(() => {
    const meters = metersRef.current;
    const resume = () => { if (enabledRef.current && document.visibilityState === 'visible' && contextRef.current?.state === 'suspended') void contextRef.current.resume().catch(() => undefined); };
    window.addEventListener('pointerdown', resume);
    const timer = window.setInterval(() => {
      if (!enabledRef.current || document.visibilityState === 'hidden' || !meters.size) return;
      const now = performance.now(); const next = new Set<string>();
      for (const [id, meter] of meters) {
        if (meter.track.readyState !== 'live') continue;
        meter.analyser.getFloatTimeDomainData(meter.samples);
        let energy = 0;
        for (const sample of meter.samples) energy += sample * sample;
        if (Math.sqrt(energy / meter.samples.length) > 0.012) meter.lastVoice = now;
        if (meter.lastVoice && now - meter.lastVoice < 300) next.add(id);
      }
      setSpeaking((previous) => previous.size === next.size && [...next].every((id) => previous.has(id)) ? previous : next);
    }, 100);
    return () => {
      clearInterval(timer); window.removeEventListener('pointerdown', resume);
      meters.forEach((meter) => { meter.source.disconnect(); meter.analyser.disconnect(); }); meters.clear();
      silentRef.current?.disconnect(); silentRef.current = null;
      void contextRef.current?.close().catch(() => undefined); contextRef.current = null;
    };
  }, []);
  return new Set([...speaking].filter((id) => !!streams[id]));
}
