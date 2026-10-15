import { getAudioSettings, subscribeAudioSettings } from './audio-settings';
import { getUserVolume, getScreenShareVolume, subscribeVolumeChange } from './call-volume';
import { getShareSettings, subscribeShareSettings } from './share-settings';
import type { MediaKind, MediaState, RemoteMedia, SignalData } from '@/types';

const kinds: MediaKind[] = ['microphone', 'camera', 'screen', 'screenAudio'];
const peers = new WeakMap<RTCPeerConnection, PeerMedia>();
let receiveContext: AudioContext | null = null;
const receiveOwners = new Set<PeerMedia>();
export function mediaPeer(pc: RTCPeerConnection) { const peer = peers.get(pc); if (!peer) throw new Error('Media peer not initialized'); return peer; }
export function closeMediaPeer(pc: RTCPeerConnection) { peers.get(pc)?.close(); peers.delete(pc); }

export class PeerMedia {
  private slots: Record<MediaKind, RTCRtpTransceiver>;
  private local: Partial<Record<MediaKind, MediaStreamTrack | null>> = {};
  private remote = new Map<string, MediaState>();
  private streams: Record<MediaKind, MediaStream> = { microphone: new MediaStream(), camera: new MediaStream(), screen: new MediaStream(), screenAudio: new MediaStream() };
  private context: AudioContext | null = null;
  private gains = new Map<MediaKind, GainNode>();
  private sources = new Map<MediaKind, MediaStreamAudioSourceNode>();
  private limiters = new Map<MediaKind, DynamicsCompressorNode>();
  private playback = new Map<MediaKind, HTMLAudioElement>();
  private deafened = false;
  private closed = false;
  private participantCount = 2;
  private off: (() => void)[];
  private pc: RTCPeerConnection;
  private peerId: string;
  private changed: (media: RemoteMedia) => void;
  private signal: (data: SignalData) => void;
  constructor(pc: RTCPeerConnection, peerId: string, changed: (media: RemoteMedia) => void, signal: (data: SignalData) => void) {
    this.pc = pc; this.peerId = peerId; this.changed = changed; this.signal = signal;
    // Four fixed slots allow camera, screen and their audio to change without SDP glare.
    this.slots = Object.fromEntries(kinds.map((kind) => [kind, pc.addTransceiver(kind === 'microphone' || kind === 'screenAudio' ? 'audio' : 'video', { direction: 'sendrecv' })])) as Record<MediaKind, RTCRtpTransceiver>;
    pc.ontrack = (event) => {
      if (this.closed) return;
      const kind = this.kindFor(event.transceiver);
      const stream = this.streams[kind];
      if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
      const refresh = () => { this.changed(this.snapshot()); this.updateVolumes(); };
      event.track.addEventListener('mute', refresh);
      event.track.addEventListener('unmute', refresh);
      event.track.addEventListener('ended', refresh);
      this.off.push(() => { event.track.removeEventListener('mute', refresh); event.track.removeEventListener('unmute', refresh); event.track.removeEventListener('ended', refresh); });
      if (event.track.kind === 'audio') this.attachAudio(kind, stream);
      refresh();
    };
    this.off = [subscribeAudioSettings(() => this.updateVolumes()), subscribeVolumeChange(() => this.updateVolumes()), subscribeShareSettings(() => { void this.configureScreen(); })];
    peers.set(pc, this);
  }
  private kindFor(transceiver: RTCRtpTransceiver): MediaKind {
    const declared = transceiver.mid ? this.remote.get(transceiver.mid)?.kind : undefined;
    return declared || kinds.find((kind) => this.slots[kind] === transceiver) || (transceiver.receiver.track.kind === 'audio' ? 'microphone' : 'camera');
  }
  states(): MediaState[] {
    return kinds.flatMap((kind) => { const mid = this.slots[kind].mid; const track = this.local[kind]; return mid === null ? [] : [{ mid, kind, active: !!track && track.readyState === 'live' && track.enabled }]; });
  }
  withState(data: SignalData): SignalData { return { ...data, media: this.states() }; }
  announce() { if (!this.closed && this.pc.localDescription) this.signal({ media: this.states() }); }
  private isClosed() { return this.closed || this.pc.signalingState === 'closed'; }
  async publish(kind: MediaKind, stream: MediaStream | null) {
    if (this.isClosed()) return;
    const track = (kind === 'camera' || kind === 'screen' ? stream?.getVideoTracks()[0] : stream?.getAudioTracks()[0]) || null;
    this.local[kind] = track;
    try { await this.slots[kind].sender.replaceTrack(track); }
    catch (error) { if (this.isClosed()) return; throw error; }
    if (kind === 'screen' && track) await this.configureScreen();
    if (kind === 'camera' && track) await this.configureCamera();
    this.announce();
    if (kind === 'screen') await this.publish('screenAudio', stream);
  }
  async publishInitial(stream: MediaStream | null) {
    await this.publish('microphone', stream);
    await this.publish('camera', stream);
  }
  async bindRemote() {
    // Receiving an offer can create negotiated transceivers instead of reusing
    // the local placeholders. Bind the senders to those negotiated slots.
    for (const kind of kinds) {
      const negotiated = this.pc.getTransceivers().find((slot) => slot.mid !== null && this.remote.get(slot.mid)?.kind === kind);
      if (!negotiated || negotiated === this.slots[kind]) continue;
      const previous = this.slots[kind];
      this.slots[kind] = negotiated;
      negotiated.direction = 'sendrecv';
      await negotiated.sender.replaceTrack(this.local[kind] || null);
      if (previous.mid === null) previous.stop();
    }
    this.changed(this.snapshot());
    this.updateVolumes();
    await this.configureCamera();
    await this.configureScreen();
  }
  applyState(states?: MediaState[]) {
    if (!states) return;
    for (const state of states) if (kinds.includes(state.kind) && typeof state.mid === 'string') this.remote.set(state.mid, state);
    this.changed(this.snapshot());
    this.updateVolumes();
  }
  snapshot(): RemoteMedia {
    const active = (kind: MediaKind) => {
      const transceiver = this.slots[kind];
      const declaration = transceiver.mid ? this.remote.get(transceiver.mid) : undefined;
      return declaration?.active !== false && this.streams[kind].getTracks().some((track) => track.readyState === 'live' && !track.muted);
    };
    return { ...this.streams, cameraActive: active('camera'), screenActive: active('screen'), microphoneActive: active('microphone'), screenAudioActive: active('screenAudio') };
  }
  setDeafened(value: boolean) { this.deafened = value; this.updateVolumes(); }
  setParticipantCount(count: number) {
    this.participantCount = Math.max(2, count);
    void this.configureCamera();
    void this.configureScreen();
  }
  private async configureCamera() {
    const sender = this.slots.camera.sender;
    if (!sender.track || this.closed) return;
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) return;
    const large = this.participantCount >= 6;
    const crowded = this.participantCount >= 12;
    parameters.encodings[0].maxBitrate = crowded ? 250000 : large ? 450000 : 1500000;
    parameters.encodings[0].maxFramerate = crowded ? 15 : large ? 20 : 30;
    parameters.encodings[0].scaleResolutionDownBy = crowded ? 3 : large ? 2 : 1;
    parameters.degradationPreference = 'balanced';
    try { await sender.setParameters(parameters); } catch { /* Sender controls vary by engine. */ }
  }
  private async configureScreen() {
    const sender = this.slots.screen.sender;
    if (!sender.track || this.closed) return;
    const { quality, fps } = getShareSettings();
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) return;
    const requested = (quality === '720' ? 2500000 : quality === '1440' ? 12000000 : 6000000) * (fps === 60 ? 1.5 : 1);
    parameters.encodings[0].maxBitrate = Math.min(requested, 18000000 / (this.participantCount - 1));
    parameters.encodings[0].maxFramerate = fps;
    parameters.degradationPreference = 'maintain-resolution';
    try { await sender.setParameters(parameters); } catch { /* The source constraints still apply on engines without sender controls. */ }
  }
  private attachAudio(kind: MediaKind, stream: MediaStream) {
    if (this.closed || this.sources.has(kind)) return;
    try {
      if (!this.context) { receiveContext ||= new AudioContext(); this.context = receiveContext; receiveOwners.add(this); }
      // Chromium needs media playback to activate decoding of a remote track.
      // The element stays muted; all audible output goes through the gain graph.
      const playback = new Audio(); playback.srcObject = stream; playback.muted = true; playback.autoplay = true;
      this.playback.set(kind, playback);
      void playback.play().catch(() => undefined);
      const source = this.context.createMediaStreamSource(stream);
      const gain = this.context.createGain();
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20;
      source.connect(gain).connect(limiter).connect(this.context.destination);
      this.limiters.set(kind, limiter);
      this.sources.set(kind, source); this.gains.set(kind, gain);
      const resume = () => { if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined); void playback.play().catch(() => undefined); };
      resume();
      window.addEventListener('pointerdown', resume);
      this.off.push(() => window.removeEventListener('pointerdown', resume));
    } catch { /* Unsupported output devices are reported by the call controls. */ }
  }
  private updateVolumes() {
    if (!this.context || this.closed) return;
    const output = getAudioSettings().outputVolume / 100;
    const snapshot = this.snapshot();
    for (const [kind, gain] of this.gains) {
      const active = kind === 'screenAudio' ? snapshot.screenAudioActive : snapshot.microphoneActive;
      const volume = kind === 'screenAudio' ? getScreenShareVolume() : getUserVolume(this.peerId);
      gain.gain.setTargetAtTime(this.deafened || !active ? 0 : output * volume / 100, this.context.currentTime, 0.015);
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.off.forEach((off) => off());
    this.off = [];
    this.sources.forEach((source) => source.disconnect());
    this.gains.forEach((gain) => gain.disconnect());
    this.limiters.forEach((limiter) => limiter.disconnect());
    this.playback.forEach((playback) => { playback.pause(); playback.srcObject = null; });
    Object.values(this.streams).forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    receiveOwners.delete(this);
    if (!receiveOwners.size && receiveContext) { void receiveContext.close().catch(() => undefined); receiveContext = null; }
    this.context = null;
    this.local = {};
    this.sources.clear(); this.gains.clear(); this.limiters.clear(); this.playback.clear(); this.remote.clear();
  }
}
