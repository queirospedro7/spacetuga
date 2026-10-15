import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { playUiSound } from '@/lib/ui-sound';
import { toast } from 'sonner';
import { createMicrophoneStream, stopTrack } from '@/lib/audio-settings';
import { PeerMedia, mediaPeer, closeMediaPeer } from '@/lib/peer-media';
import { notifyIncoming } from '@/lib/notifications';
import type {
  MyProfile,
  PublicUser,
  Message,
  Community,
  ChannelMessage,
  RemoteMedia,
} from '@/types';

interface ActiveCall {
  peerId: string;
  kind: 'voice' | 'video';
  pc: RTCPeerConnection;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteMedia?: RemoteMedia;
  isOfferer: boolean;
  connected: boolean;
}

interface IncomingCall {
  from: string;
  kind: 'voice' | 'video';
}

let rtcConfiguration: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection(rtcConfiguration);
}

async function getMedia(kind: 'voice' | 'video'): Promise<MediaStream> {
  const microphone = await createMicrophoneStream();
  if (kind === 'voice') return microphone;
  try {
    const deviceId = localStorage.getItem('melo.videoDevice') || '';
    const camera = await navigator.mediaDevices.getUserMedia({ video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    return new MediaStream([...microphone.getTracks(), ...camera.getTracks()]);
  } catch { toast.info('Câmara indisponível. A chamada continua com áudio.'); return microphone; }
}

function cleanupCall(call: ActiveCall | null) {
  if (!call) return;
  try {
    closeMediaPeer(call.pc);
    call.pc?.close();
  } catch (e) {
    console.error('Failed to close RTCPeerConnection', e);
  }
  call.localStream?.getTracks().forEach(stopTrack);
  call.remoteStream?.getTracks().forEach(stopTrack);
}

export function useChat() {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<PublicUser[]>([]);
  const [friendsState, setFriendsState] = useState<{ friends: PublicUser[]; incoming: PublicUser[]; outgoing: PublicUser[] }>({ friends: [], incoming: [], outgoing: [] });
  const [conversations, setConversations] = useState<Map<string, Message[]>>(new Map());
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [typingFrom, setTypingFrom] = useState<string | null>(null);

  // Community & Channels state
  const [communities, setCommunities] = useState<Community[]>([]);
  const [publicCommunities, setPublicCommunities] = useState<Community[]>([]);
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null); // null means DMs mode
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [channelMessages, setChannelMessages] = useState<Map<string, ChannelMessage[]>>(new Map());
  const [voiceState, setVoiceState] = useState<Record<string, string[]>>({});
  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<string | null>(null);
  const [pendingVoiceChannelId, setPendingVoiceChannelId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceVideoStreams, setVoiceVideoStreams] = useState<Record<string, RemoteMedia>>({});

  // Voice stream refs
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const [voiceLocalStream, setVoiceLocalStream] = useState<MediaStream | null>(null);
  const voiceVideoStreamRef = useRef<MediaStream | null>(null);
  const voiceScreenStreamRef = useRef<MediaStream | null>(null);
  const voiceChannelIdRef = useRef<string | null>(null);
  const voiceConnectionsRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingVoiceOffers = useRef(new WeakSet<RTCPeerConnection>());
  const deafenedRef = useRef(false);
  const mutedRef = useRef(false);
  const serverMutedRef = useRef(false);
  const pendingVoiceCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  // Push-to-Talk refs (declared early so joinVoiceChannel/leaveVoiceChannel can reference them)
  const pttActiveRef = useRef(false);
  const pttPressedRef = useRef(false);

  // Refs to avoid stale closures in async callbacks
  const activeCallRef = useRef<ActiveCall | null>(activeCall);
  const profileRef = useRef<MyProfile | null>(profile);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const isStartingOfferRef = useRef(false);
  const acceptingCallRef = useRef(false);
  const incomingCallRef = useRef<IncomingCall | null>(incomingCall);
  const voiceJoinGenerationRef = useRef(0);

  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);

  const closeVoiceConnection = useCallback((peerId: string) => {
    const connection = voiceConnectionsRef.current.get(peerId);
    if (connection) { closeMediaPeer(connection); connection.close(); }
    voiceConnectionsRef.current.delete(peerId);
    pendingVoiceCandidatesRef.current.delete(peerId);
    setVoiceVideoStreams((previous) => { const next = { ...previous }; delete next[peerId]; return next; });
  }, []);

  const ensureVoiceConnection = useCallback((peerId: string, channelId: string) => {
    const existing = voiceConnectionsRef.current.get(peerId);
    if (existing) return existing;

    const pc = createPeerConnection();
    voiceConnectionsRef.current.set(peerId, pc);
    const peer = new PeerMedia(pc, peerId, (media) => {
      if (voiceConnectionsRef.current.get(peerId) === pc) setVoiceVideoStreams((previous) => ({ ...previous, [peerId]: media }));
    }, (data) => api.sendVoiceSignal(channelId, peerId, data));
    voiceConnectionsRef.current.forEach((connection) => mediaPeer(connection).setParticipantCount(voiceConnectionsRef.current.size + 1));
    peer.setDeafened(deafenedRef.current);
    void peer.publish('microphone', voiceStreamRef.current);
    void peer.publish('camera', voiceVideoStreamRef.current);
    void peer.publish('screen', voiceScreenStreamRef.current);
    pc.onicecandidate = (event) => { if (event.candidate) api.sendVoiceSignal(channelId, peerId, { candidate: event.candidate.toJSON() }); };
    return pc;
  }, []);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    api.connect();

    const unsubs: Array<() => void> = [];

    unsubs.push(
      api.on('ready', ({ profile: p, users: u, conversations: convs, communities: comms, publicCommunities: pubComms, channelMessages: cMsgs, voiceState: vState, blockedUsers: blocked }) => {
        void api.getRtcConfig().then((configuration) => { rtcConfiguration = configuration; }).catch(() => undefined);
        setProfile(p);
        profileRef.current = p;
        setUsers(u);
        setBlockedUsers(blocked || []);
        api.loadFriends();
        const map = new Map<string, Message[]>();
        for (const conv of convs) {
          const otherId = conv.user.id;
          map.set(otherId, conv.messages);
        }
        setConversations(map);

        if (comms) {
          setCommunities(comms);
        }

        if (pubComms) {
          setPublicCommunities(pubComms);
        }

        if (cMsgs) {
          const cMap = new Map<string, ChannelMessage[]>();
          for (const m of cMsgs) {
            const list = cMap.get(m.channelId) ?? [];
            if (!list.some((existing) => existing.id === m.id)) {
              cMap.set(m.channelId, [...list, m]);
            }
          }
          setChannelMessages(cMap);
        }

        if (vState) {
          setVoiceState(vState);
        }

        setIsConnected(true);
      })
    );

    unsubs.push(
      api.on('err', ({ code }) => {
        if (['session', 'session_replaced', 'account_suspended'].includes(code)) {
          // Token expirado ou reinício de servidor
          setProfile(null);
          setIsConnected(false);
          if (code === 'account_suspended') toast.error('Esta conta está suspensa.');
          if (code === 'session_replaced') toast.info('A conta foi aberta noutra sessão.');
        } else if (code === 'voice_forbidden' || code === 'community_suspended') {
          voiceJoinGenerationRef.current++;
          for (const peerId of voiceConnectionsRef.current.keys()) closeVoiceConnection(peerId);
          voiceStreamRef.current?.getTracks().forEach(stopTrack);
          voiceStreamRef.current = null; setVoiceLocalStream(null);
          voiceChannelIdRef.current = null;
          setActiveVoiceChannelId(null);
          setPendingVoiceChannelId(null);
          api.leaveVoiceChannel();
          setVoiceError(code === 'community_suspended' ? 'Este servidor está suspenso.' : 'Não tens acesso a este canal de voz.');
          if (code === 'community_suspended') toast.error('Este servidor está suspenso.');
        } else if (code === 'cannot_kick_owner') {
          toast.error('Não é possível expulsar o criador do servidor.');
        } else if (code === 'cannot_mute_owner') {
          toast.error('Não é possível silenciar o criador do servidor.');
        } else if (code === 'permission_denied') {
          toast.error('Não tens permissão para realizar esta ação.');
        } else if (['member_permission', 'target_forbidden', 'announcement_readonly', 'forbidden'].includes(code)) {
          toast.error('Não tens permissão para realizar esta ação neste canal.');
        } else if (code === 'account_restricted') {
          toast.error('Esta conta está temporariamente limitada.');
        } else if (code === 'rate_limit' || code === 'queue_full') {
          toast.error('Demasiadas ações seguidas. Aguarda um momento e tenta novamente.');
        }
      })
    );

    unsubs.push(
      api.on('voice:kicked', () => {
        for (const peerId of voiceConnectionsRef.current.keys()) closeVoiceConnection(peerId);
        if (voiceStreamRef.current) {
          voiceStreamRef.current.getTracks().forEach(stopTrack);
          voiceStreamRef.current = null; setVoiceLocalStream(null);
        }
        voiceChannelIdRef.current = null;
        setActiveVoiceChannelId(null);
        setPendingVoiceChannelId(null);
        setVoiceVideoStreams({});
        voiceVideoStreamRef.current = null;
        voiceScreenStreamRef.current = null;
        playUiSound('leave');
        toast.error('Foste expulso da chamada de voz por um administrador.');
      })
    );

    unsubs.push(
      api.on('voice:muted', ({ muted }) => {
        serverMutedRef.current = muted;
        const effectiveMute = muted || mutedRef.current || deafenedRef.current;
        setIsMuted(effectiveMute);
        if (voiceStreamRef.current) {
          voiceStreamRef.current.getAudioTracks().forEach((t) => {
            t.enabled = !effectiveMute;
          });
        }
        if (muted) {
          toast.info('Foste silenciado na chamada de voz por um moderador/administrador.');
        } else {
          toast.success('O teu microfone foi reativado por um moderador.');
        }
        voiceConnectionsRef.current.forEach((pc) => mediaPeer(pc).announce());
      })
    );

    unsubs.push(
      api.on('disconnected', () => {
        serverMutedRef.current = false;
        voiceJoinGenerationRef.current++;
        incomingCallRef.current = null;
        setIsConnected(false);
        cleanupCall(activeCallRef.current);
        activeCallRef.current = null;
        setActiveCall(null);
        setIncomingCall(null);
        pendingCandidatesRef.current = [];
        isStartingOfferRef.current = false;
        for (const peerId of voiceConnectionsRef.current.keys()) closeVoiceConnection(peerId);
        voiceStreamRef.current?.getTracks().forEach(stopTrack);
        voiceStreamRef.current = null; setVoiceLocalStream(null);
        voiceVideoStreamRef.current = null;
        voiceScreenStreamRef.current = null;
        voiceChannelIdRef.current = null;
        setActiveVoiceChannelId(null);
        setPendingVoiceChannelId(null);
        setVoiceVideoStreams({});
      })
    );

    unsubs.push(
      api.on('users', ({ users: u }) => {
        setUsers(u);
        setFriendsState((s) => ({
          ...s,
          friends: s.friends.map((friend) => u.find((peer) => peer.id === friend.id) || friend),
        }));
      })
    );
    unsubs.push(
      api.on('users:add', ({ users: newUsers }) => {
        setUsers((prev) => {
          const map = new Map(prev.map((user) => [user.id, user]));
          let changed = false;
          for (const user of newUsers) {
            if (!map.has(user.id)) {
              map.set(user.id, user);
              changed = true;
            }
          }
          return changed ? Array.from(map.values()) : prev;
        });
      })
    );
    unsubs.push(
      api.on('friends:update', (payload) => {
        setFriendsState((previous) => {
          const newIncoming = (payload.incoming || []).filter((u) => !previous.incoming.some((p) => p.id === u.id));
          for (const u of newIncoming) {
            toast.info(`Novo pedido de amizade de ${u.displayName}`, {
              description: `@${u.username}`,
            });
          }
          return {
            friends: payload.friends || [],
            incoming: payload.incoming || [],
            outgoing: payload.outgoing || [],
          };
        });
      })
    );
    unsubs.push(api.on('blocks:update', ({ users: blocked }) => setBlockedUsers(blocked)));

    unsubs.push(
      api.on('msg', ({ msg }) => {
        const myId = profileRef.current?.id;
        if (msg.from !== myId && profileRef.current?.status !== 'busy') { playUiSound('receive'); void notifyIncoming('message', { peerId: msg.from }); }
        const otherId = msg.from === myId ? msg.to : msg.from;
        setConversations((prev) => {
          const next = new Map(prev);
          const existing = next.get(otherId) ?? [];
          const combined = [...existing, msg];
          next.set(otherId, combined.length > 250 ? combined.slice(-250) : combined);
          return next;
        });
      })
    );

    unsubs.push(api.on('reaction:update', ({ scope, msg }) => {
      if (scope === 'dm') {
        const direct = msg as Message;
        const otherId = direct.from === profileRef.current?.id ? direct.to : direct.from;
        setConversations((previous) => {
          const next = new Map(previous);
          next.set(otherId, (next.get(otherId) || []).map((entry) => entry.id === direct.id ? direct : entry));
          return next;
        });
      } else {
        const channel = msg as ChannelMessage;
        setChannelMessages((previous) => {
          const next = new Map(previous);
          next.set(channel.channelId, (next.get(channel.channelId) || []).map((entry) => entry.id === channel.id ? channel : entry));
          return next;
        });
      }
    }));

    unsubs.push(api.on('poll:update', ({ scope, msg }) => {
      if (scope === 'dm') {
        const direct = msg as Message;
        const otherId = direct.from === profileRef.current?.id ? direct.to : direct.from;
        setConversations((previous) => { const next = new Map(previous); next.set(otherId, (next.get(otherId) || []).map((entry) => entry.id === direct.id ? direct : entry)); return next; });
      } else {
        const channel = msg as ChannelMessage;
        setChannelMessages((previous) => { const next = new Map(previous); next.set(channel.channelId, (next.get(channel.channelId) || []).map((entry) => entry.id === channel.id ? channel : entry)); return next; });
      }
    }));

    unsubs.push(api.on('msg:delete', ({ scope, messageId, channelId }) => {
      playUiSound('leave');
      if (scope === 'dm') {
        setConversations((previous) => {
          const next = new Map(previous);
          for (const [peerId, list] of next.entries()) {
            if (list.some((m) => m.id === messageId)) {
              next.set(peerId, list.filter((m) => m.id !== messageId));
            }
          }
          return next;
        });
      } else {
        setChannelMessages((previous) => {
          const next = new Map(previous);
          if (channelId && next.has(channelId)) {
            next.set(channelId, (next.get(channelId) || []).filter((m) => m.id !== messageId));
          } else {
            for (const [cId, list] of next.entries()) {
              if (list.some((m) => m.id === messageId)) {
                next.set(cId, list.filter((m) => m.id !== messageId));
              }
            }
          }
          return next;
        });
      }
    }));

    unsubs.push(
      api.on('profile', ({ profile: p }) => {
        setProfile(p);
        profileRef.current = p;
      })
    );

    unsubs.push(
      api.on('typing', ({ from }) => {
        setTypingFrom(from);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          setTypingFrom(null);
        }, 2000);
      })
    );

    // Communities events
    unsubs.push(
      api.on('communities:update', ({ communities: comms }) => {
        setCommunities(comms);
      })
    );

    unsubs.push(
      api.on('community:created', ({ community }) => {
        setCommunities((prev) => {
          if (prev.some((c) => c.id === community.id)) return prev;
          return [...prev, community];
        });
        setActiveCommunityId(community.id);
        const firstChan = community.channels.find((c: { type: string }) => c.type === 'text') || community.channels[0];
        if (firstChan) setActiveChannelId(firstChan.id);
      })
    );

    unsubs.push(
      api.on('community:joined', ({ community, communities: comms, channelMessages: cMsgs }) => {
        if (comms) setCommunities(comms);
        else {
          setCommunities((prev) => {
            if (prev.some((c) => c.id === community.id)) return prev;
            return [...prev, community];
          });
        }
        if (cMsgs) {
          setChannelMessages((prev) => {
            const next = new Map(prev);
            for (const m of cMsgs) {
              const list = next.get(m.channelId) ?? [];
              if (!list.some((existing) => existing.id === m.id)) {
                next.set(m.channelId, [...list, m]);
              }
            }
            return next;
          });
        }
        setActiveCommunityId(community.id);
        const firstChan = community.channels.find((c: { type: string }) => c.type === 'text') || community.channels[0];
        if (firstChan) setActiveChannelId(firstChan.id);
      })
    );

    unsubs.push(
      api.on('community:update', ({ community }) => {
        setCommunities((prev) =>
          prev.map((c) => (c.id === community.id ? community : c))
        );
        const visible = new Set(community.channels.map((channel) => channel.id));
          setChannelMessages((prev) => {
            const next = new Map(prev);
            for (const [channelId, messages] of next) {
              if (messages.some((message) => message.communityId === community.id) && !visible.has(channelId)) next.delete(channelId);
            }
            return next;
          });
      })
    );

    unsubs.push(
      api.on('community:left', ({ communityId }) => {
        setCommunities((previous) => previous.filter((community) => community.id !== communityId));
        setActiveCommunityId((current) => current === communityId ? null : current);
        setChannelMessages((previous) => new Map([...previous].filter(([, messages]) => !messages.some((message) => message.communityId === communityId))));
      })
    );

    unsubs.push(
      api.on('community:deleted', ({ communityId }) => {
        setCommunities((prev) => prev.filter((c) => c.id !== communityId));
        setActiveCommunityId((current) => (current === communityId ? null : current));
        toast.info('O servidor foi eliminado.');
      })
    );

    unsubs.push(
      api.on('community:kicked', ({ communityId }) => {
        setCommunities((prev) => prev.filter((c) => c.id !== communityId));
        setActiveCommunityId((current) => (current === communityId ? null : current));
        toast.info('Foste removido deste servidor.');
      })
    );

    unsubs.push(
      api.on('community:public:list', ({ communities: pubList }) => {
        if (pubList) setPublicCommunities(pubList);
      })
    );

    unsubs.push(
      api.on('community:msg', ({ msg }) => {
        if (msg.from !== profileRef.current?.id && profileRef.current?.status !== 'busy') { playUiSound('receive'); void notifyIncoming('message', { communityId: msg.communityId, channelId: msg.channelId }); }
        setChannelMessages((prev) => {
          const next = new Map(prev);
          const list = next.get(msg.channelId) ?? [];
          const combined = [...list, msg];
          next.set(msg.channelId, combined.length > 250 ? combined.slice(-250) : combined);
          return next;
        });
      })
    );

    // Voice channel state
    unsubs.push(
      api.on('voice:state', ({ voiceState: vState }) => {
        setVoiceState(vState);
        const myId = profileRef.current?.id;
        const foundChan = myId
          ? Object.entries(vState).find(([, members]) => members.includes(myId))?.[0] ?? null
          : null;
        const previousChan = voiceChannelIdRef.current;
        voiceChannelIdRef.current = foundChan;
        setActiveVoiceChannelId(foundChan);
        if (foundChan) setPendingVoiceChannelId(null);

        if (previousChan && !foundChan) {
          for (const peerId of voiceConnectionsRef.current.keys()) closeVoiceConnection(peerId);
          voiceStreamRef.current?.getTracks().forEach(stopTrack);
          voiceStreamRef.current = null; setVoiceLocalStream(null);
          deafenedRef.current = false;
          setIsDeafened(false);
        }

        const currentMembers = foundChan ? vState[foundChan] ?? [] : [];
        voiceConnectionsRef.current.forEach((pc) => mediaPeer(pc).setParticipantCount(currentMembers.length));
        for (const peerId of voiceConnectionsRef.current.keys()) {
          if (!currentMembers.includes(peerId)) closeVoiceConnection(peerId);
        }

        if (myId && foundChan && voiceStreamRef.current) {
          for (const peerId of currentMembers) {
            // Use a stable offerer for every pair to avoid simultaneous offers.
            if (peerId === myId || myId.localeCompare(peerId) > 0) continue;
            const pc = ensureVoiceConnection(peerId, foundChan);
            if (pc.signalingState !== 'stable' || pc.localDescription || pendingVoiceOffers.current.has(pc)) continue;
            pendingVoiceOffers.current.add(pc);
            void pc.createOffer()
              .then((offer) => pc.setLocalDescription(offer))
              .then(() => {
                if (pc.localDescription) {
                  api.sendVoiceSignal(foundChan, peerId, mediaPeer(pc).withState({ description: pc.localDescription }));
                }
              })
              .catch((error) => console.error('Voice offer failed', error))
              .finally(() => pendingVoiceOffers.current.delete(pc));
          }
        }
      })
    );

    unsubs.push(
      api.on('voice:signal', async ({ from, channelId, data }) => {
        if (channelId !== voiceChannelIdRef.current) return;
        const pc = ensureVoiceConnection(from, channelId);
        mediaPeer(pc).applyState(data.media);
        try {
          if (data.description?.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.description));
            await mediaPeer(pc).bindRemote();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            api.sendVoiceSignal(channelId, from, mediaPeer(pc).withState({ description: pc.localDescription! }));
            const pending = pendingVoiceCandidatesRef.current.get(from) ?? [];
            for (const candidate of pending) await pc.addIceCandidate(new RTCIceCandidate(candidate));
            pendingVoiceCandidatesRef.current.delete(from);
          } else if (data.description?.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.description));
            await mediaPeer(pc).bindRemote();
            const pending = pendingVoiceCandidatesRef.current.get(from) ?? [];
            for (const candidate of pending) await pc.addIceCandidate(new RTCIceCandidate(candidate));
            pendingVoiceCandidatesRef.current.delete(from);
          } else if (data.renegotiate && profileRef.current && profileRef.current.id.localeCompare(from) < 0 && pc.signalingState === 'stable') {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (pc.localDescription) api.sendVoiceSignal(channelId, from, mediaPeer(pc).withState({ description: pc.localDescription }));
          }
          if (data.candidate) {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
              pendingVoiceCandidatesRef.current.set(from, [
                ...(pendingVoiceCandidatesRef.current.get(from) ?? []),
                data.candidate,
              ]);
            }
          }
        } catch (error) {
          console.error('Voice connection negotiation failed', error);
        }
      })
    );

    // Direct 1-on-1 Call handling
    unsubs.push(
      api.on('call:invite', ({ from, kind, user }) => {
        if (user) setUsers((previous) => previous.some((entry) => entry.id === user.id) ? previous : [...previous, user]);
        playUiSound('call');
        void notifyIncoming('call', { peerId: from });
        setIncomingCall({ from, kind });
      })
    );

    unsubs.push(
      api.on('call:accept', async ({ from }) => {
        const call = activeCallRef.current;
        if (!call || call.peerId !== from) return;
        if (call.pc.localDescription || isStartingOfferRef.current) return;
        isStartingOfferRef.current = true;

        const pc = call.pc;
        let localStream: MediaStream | null = null;
        try {
          localStream = await getMedia(call.kind);
          if (activeCallRef.current?.pc !== call.pc) { localStream.getTracks().forEach(stopTrack); return; }
          localStream.getAudioTracks().forEach((track) => { track.enabled = !mutedRef.current; });
          await mediaPeer(pc).publishInitial(localStream);
        } catch (e) {
          console.error('getUserMedia failed', e);
          if (activeCallRef.current?.pc !== pc) return;
          toast.error('Microfone indisponível. A chamada continua apenas para ouvir.');
          /* Fixed transceivers already allow receiving without a microphone. */
          
        }

        setActiveCall((prev) =>
          prev && prev.peerId === from ? { ...prev, localStream } : prev
        );
        if (activeCallRef.current && activeCallRef.current.peerId === from) {
          activeCallRef.current.localStream = localStream;
        }

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          api.signal(from, mediaPeer(pc).withState({ description: pc.localDescription! }));
        } catch (e) {
          console.error('createOffer failed', e);
        }
      })
    );

    unsubs.push(
      api.on('call:reject', ({ from }) => {
        const call = activeCallRef.current;
        if (call?.peerId === from) {
          cleanupCall(call);
          pendingCandidatesRef.current = [];
          isStartingOfferRef.current = false;
          activeCallRef.current = null;
          setActiveCall(null);
        }
      })
    );

    unsubs.push(
      api.on('call:hangup', ({ from }) => {
        if (incomingCallRef.current?.from === from) {
          incomingCallRef.current = null;
          setIncomingCall(null);
        }
        const call = activeCallRef.current;
        if (call?.peerId === from) {
          cleanupCall(call);
          pendingCandidatesRef.current = [];
          isStartingOfferRef.current = false;
          activeCallRef.current = null;
          setActiveCall(null);
        }
      })
    );

    const stopCallFailure = api.on('call:busy', ({ peerId }) => {
      const call = activeCallRef.current;
      if (call?.peerId !== peerId) return;
      cleanupCall(call);
      pendingCandidatesRef.current = [];
      isStartingOfferRef.current = false;
      activeCallRef.current = null;
      setActiveCall(null);
      setVoiceError('Esta pessoa já está noutra chamada.');
      toast.error('Esta pessoa já está noutra chamada.');
    });
    const stopCallOffline = api.on('call:offline', ({ peerId }) => {
      if (activeCallRef.current?.peerId !== peerId) return;
      cleanupCall(activeCallRef.current);
      activeCallRef.current = null;
      setActiveCall(null);
      toast.error('Esta pessoa não está ligada neste momento.');
    });
    const stopCallTimeout = api.on('call:timeout', ({ peerId }) => {
      if (activeCallRef.current?.peerId === peerId) {
        cleanupCall(activeCallRef.current);
        activeCallRef.current = null;
        setActiveCall(null);
      }
      setIncomingCall((current) => current?.from === peerId ? null : current);
      toast.error('A chamada não foi atendida.');
    });
    unsubs.push(stopCallFailure, stopCallOffline, stopCallTimeout);

    unsubs.push(api.on('dm:read:update', ({ peerId, messageIds, readAt }) => {
      const ids = new Set(messageIds);
      setConversations((previous) => {
        const next = new Map(previous);
        next.set(peerId, (next.get(peerId) || []).map((message) => ids.has(message.id) ? { ...message, readAt } : message));
        return next;
      });
    }));

    unsubs.push(
      api.on('signal', async ({ from, data }) => {
        const call = activeCallRef.current;
        if (!call || call.peerId !== from) return;
        const pc = call.pc;
        mediaPeer(pc).applyState(data.media);
        if (!pc) return;

        if (data.description) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.description));
            await mediaPeer(pc).bindRemote();
            for (const cand of pendingCandidatesRef.current) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
            pendingCandidatesRef.current = [];

            if (data.description.type === 'offer') {
              let localStream = call.localStream;
              if (!localStream) {
                try {
                  localStream = await getMedia(call.kind);
                if (activeCallRef.current?.pc !== call.pc) { localStream.getTracks().forEach(stopTrack); return; }
                localStream.getAudioTracks().forEach((track) => { track.enabled = !mutedRef.current; });
                  await mediaPeer(pc).publishInitial(localStream);
                  setActiveCall((prev) => (prev ? { ...prev, localStream } : null));
                  if (activeCallRef.current) activeCallRef.current.localStream = localStream;
                } catch (e) {
                  console.error('getUserMedia failed in offer reply', e);
                }
              }
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              api.signal(from, mediaPeer(pc).withState({ description: pc.localDescription! }));
            }
          } catch (e) {
            console.error('signal description error', e);
          }
        }

        if (data.renegotiate && call.isOfferer && pc.signalingState === 'stable') {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (pc.localDescription) api.signal(from, mediaPeer(pc).withState({ description: pc.localDescription }));
          } catch (error) { console.error('Call video negotiation failed', error); }
        }

        if (data.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
              console.error('addIceCandidate error', e);
            }
          } else {
            pendingCandidatesRef.current.push(data.candidate);
          }
        }
      })
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [closeVoiceConnection, ensureVoiceConnection]);

  const sendMessage = useCallback(
    async (text: string) => {
      try {
        if (activeCommunityId && activeChannelId) await api.sendChannelMessageConfirmed(activeCommunityId, activeChannelId, text);
        else if (activeUserId) await api.sendMessageConfirmed(activeUserId, text);
        else return false;
        return true;
      } catch { toast.error('Não foi possível confirmar o envio. O rascunho foi mantido.'); return false; }
    },
    [activeCommunityId, activeChannelId, activeUserId]
  );

  const sendTyping = useCallback(() => {
    if (activeUserId && !activeCommunityId) {
      if (sendTypingTimerRef.current) return;
      api.sendTyping(activeUserId);
      sendTypingTimerRef.current = setTimeout(() => {
        sendTypingTimerRef.current = null;
      }, 3000);
    }
  }, [activeUserId, activeCommunityId]);

  // Voice channel actions
  const joinVoiceChannel = useCallback(async (channelId: string) => {
    if (profileRef.current?.accountStatus === 'restricted') { setVoiceError('Esta conta está temporariamente limitada.'); return; }
    if (pendingVoiceChannelId === channelId || activeVoiceChannelId === channelId) return;
    const generation = ++voiceJoinGenerationRef.current;
    try {
      setVoiceError(null);
      setPendingVoiceChannelId(channelId);
      const stream = await createMicrophoneStream();
      if (generation !== voiceJoinGenerationRef.current) { stream.getTracks().forEach(stopTrack); return; }
      for (const peerId of voiceConnectionsRef.current.keys()) closeVoiceConnection(peerId);
      // Apply PTT: if enabled, start with mic muted
      const pttOn = localStorage.getItem('tuga.pttEnabled') === 'true';
      pttActiveRef.current = pttOn;
      const startMuted = pttOn || mutedRef.current;
      stream.getAudioTracks().forEach((track) => { track.enabled = !startMuted; });
      if (pttOn) mutedRef.current = true;
      voiceStreamRef.current?.getTracks().forEach(stopTrack);
      voiceStreamRef.current = stream; setVoiceLocalStream(stream);
      voiceChannelIdRef.current = channelId;
      setIsMuted(mutedRef.current);
      api.joinVoiceChannel(channelId);
      playUiSound('join');
    } catch (error) {
      console.warn('Microphone permission was not granted for voice channel:', error);
      setPendingVoiceChannelId(null);
      setVoiceError('Permite o acesso ao microfone para entrar no canal de voz.');
    }
  }, [activeVoiceChannelId, pendingVoiceChannelId, closeVoiceConnection]);

  const leaveVoiceChannel = useCallback(() => {
    voiceJoinGenerationRef.current++;
    serverMutedRef.current = false;
    pttActiveRef.current = false;
    pttPressedRef.current = false;
    setIsMuted(mutedRef.current);
    for (const peerId of voiceConnectionsRef.current.keys()) closeVoiceConnection(peerId);
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach(stopTrack);
      voiceStreamRef.current = null; setVoiceLocalStream(null);
    }
    api.leaveVoiceChannel();
    playUiSound('leave');
    voiceChannelIdRef.current = null;
    setActiveVoiceChannelId(null);
    setPendingVoiceChannelId(null);
    setVoiceVideoStreams({});
    voiceVideoStreamRef.current = null;
        voiceScreenStreamRef.current = null;
    setVoiceError(null);
  }, [closeVoiceConnection]);

  const setVoiceVideoStream = useCallback(async (kind: 'camera' | 'screen', stream: MediaStream | null) => {
    if (kind === 'camera') voiceVideoStreamRef.current = stream; else voiceScreenStreamRef.current = stream;
    for (const pc of voiceConnectionsRef.current.values()) await mediaPeer(pc).publish(kind, stream);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      if (serverMutedRef.current) { toast.info('O microfone foi silenciado pela moderação.'); return prev; }
      if (prev && deafenedRef.current) return prev;
      const next = !prev;
      mutedRef.current = next;
      if (voiceStreamRef.current) {
        voiceStreamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = !next;
        });
      }
      activeCallRef.current?.localStream?.getAudioTracks().forEach((track) => { track.enabled = !next; });
      voiceConnectionsRef.current.forEach((pc) => mediaPeer(pc).announce());
      if (activeCallRef.current) mediaPeer(activeCallRef.current.pc).announce();
      return next;
    });
  }, []);

  const toggleDeafen = useCallback(() => {
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setIsDeafened(next);
    voiceConnectionsRef.current.forEach((pc) => mediaPeer(pc).setDeafened(next));
    if (activeCallRef.current) mediaPeer(activeCallRef.current.pc).setDeafened(next);
    if (next && !mutedRef.current) {
      mutedRef.current = true;
      setIsMuted(true);
      voiceStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
      activeCallRef.current?.localStream?.getAudioTracks().forEach((track) => { track.enabled = false; });
    }
    voiceConnectionsRef.current.forEach((pc) => mediaPeer(pc).announce());
    if (activeCallRef.current) mediaPeer(activeCallRef.current.pc).announce();
  }, []);

  // Push-to-Talk: when enabled, mic is always muted unless PTT key is held
  // (pttActiveRef and pttPressedRef declared earlier at top of hook to avoid forward-reference errors)

  const setPttMicEnabled = useCallback((enabled: boolean) => {
    if (serverMutedRef.current) return;
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = enabled; });
    }
    activeCallRef.current?.localStream?.getAudioTracks().forEach((t) => { t.enabled = enabled; });
    voiceConnectionsRef.current.forEach((pc) => mediaPeer(pc).announce());
    if (activeCallRef.current) mediaPeer(activeCallRef.current.pc).announce();
    // PTT visual state: show as muted when key not held
    setIsMuted(!enabled);
  }, []);

  // Global PTT keydown/keyup listener — active only when in a voice channel
  useEffect(() => {
    function getPttKey() {
      return localStorage.getItem('tuga.pttKey') || '';
    }
    function onKeyDown(e: KeyboardEvent) {
      if (!pttActiveRef.current) return;
      if (!voiceChannelIdRef.current && !activeCallRef.current) return;
      const key = getPttKey();
      if (!key) return;
      if (e.code === key && !pttPressedRef.current && !e.repeat) {
        pttPressedRef.current = true;
        setPttMicEnabled(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (!pttActiveRef.current) return;
      const key = getPttKey();
      if (!key) return;
      if (e.code === key && pttPressedRef.current) {
        pttPressedRef.current = false;
        setPttMicEnabled(false);
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    };
  }, [setPttMicEnabled]);

  const enablePtt = useCallback((enable: boolean) => {
    pttActiveRef.current = enable;
    if (enable) {
      // When PTT is enabled, start muted
      mutedRef.current = true;
      setPttMicEnabled(false);
    } else {
      // When PTT is disabled, restore to normal unmuted state
      mutedRef.current = false;
      setPttMicEnabled(true);
    }
  }, [setPttMicEnabled]);

  const changeAudioDevice = useCallback(async (deviceId: string) => {
    localStorage.setItem('melo.audioDevice', deviceId);
    const voiceActive = !!voiceChannelIdRef.current;
    const voiceChannel = voiceChannelIdRef.current;
    const call = activeCallRef.current;
    const callHasLocalMedia = !!call?.localStream;
    if (!voiceActive && !callHasLocalMedia) return;
    try {

      if (voiceActive) {
        const stream = await createMicrophoneStream(deviceId);
        if (voiceChannelIdRef.current !== voiceChannel) { stream.getTracks().forEach(stopTrack); return; }
        const track = stream.getAudioTracks()[0];
        if (!track) { stream.getTracks().forEach(stopTrack); return; }
        track.enabled = !mutedRef.current && !serverMutedRef.current;
        const previous = voiceStreamRef.current;
        for (const pc of voiceConnectionsRef.current.values()) {
          await mediaPeer(pc).publish('microphone', stream);
        }
        voiceStreamRef.current = stream; setVoiceLocalStream(stream);
        previous?.getTracks().forEach(stopTrack);
      }
      if (callHasLocalMedia && call?.pc && call.localStream) {
        const stream = await createMicrophoneStream(deviceId);
        if (activeCallRef.current?.pc !== call.pc) { stream.getTracks().forEach(stopTrack); return; }
        const track = stream.getAudioTracks()[0];
        if (!track) { stream.getTracks().forEach(stopTrack); return; }
        track.enabled = !mutedRef.current;
        await mediaPeer(call.pc).publish('microphone', stream);
        const videoTracks = call.localStream?.getVideoTracks() ?? [];
        const nextStream = new MediaStream([...videoTracks, track]);
        call.localStream?.getAudioTracks().forEach((oldTrack) => { stopTrack(oldTrack); });
        call.localStream = nextStream;
        setActiveCall((previous) => previous?.peerId === call.peerId ? { ...previous, localStream: nextStream } : previous);

      }
    } catch (error) {
      console.error('Microphone device change failed', error);
      toast.error('Não foi possível mudar de microfone.');
    }
  }, []);

  // Direct 1-on-1 Call actions
  const startCall = useCallback((to: string, kind: 'voice' | 'video') => {
    if (voiceChannelIdRef.current) leaveVoiceChannel();
    playUiSound('call');
    const prev = activeCallRef.current;
    if (prev) { api.hangup(prev.peerId); cleanupCall(prev); }
    pendingCandidatesRef.current = [];
    isStartingOfferRef.current = false;

    const pc = createPeerConnection();
    const media = new PeerMedia(pc, to, (remoteMedia) => setActiveCall((current) => current?.pc === pc ? { ...current, remoteMedia, remoteStream: remoteMedia.camera } : current), (data) => api.signal(to, data));
    media.setDeafened(deafenedRef.current);
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        api.signal(to, { candidate: ev.candidate.toJSON() });
      }
    };
    pc.onconnectionstatechange = () => {
      if (activeCallRef.current?.peerId !== to) return;
      if (pc.connectionState === 'connected') setActiveCall((current) => current?.peerId === to ? { ...current, connected: true } : current);
      if (pc.connectionState === 'failed') {
        api.hangup(to);
        cleanupCall(activeCallRef.current);
        activeCallRef.current = null;
        setActiveCall(null);
      }
    };

    const newCall: ActiveCall = {
      peerId: to,
      kind,
      pc,
      localStream: null,
      remoteStream: null,
      isOfferer: true,
      connected: false,
    };
    activeCallRef.current = newCall;
    setActiveCall(newCall);

    api.call(to, kind);
  }, [leaveVoiceChannel]);

  const acceptCall = useCallback(async () => {
    playUiSound('call');
    const incoming = incomingCallRef.current;
    if (!incoming || acceptingCallRef.current) return;
    acceptingCallRef.current = true;
    if (voiceChannelIdRef.current) leaveVoiceChannel();

    const prev = activeCallRef.current;
    if (prev) { api.hangup(prev.peerId); cleanupCall(prev); }
    pendingCandidatesRef.current = [];
    isStartingOfferRef.current = false;

    const pc = createPeerConnection();
    const media = new PeerMedia(pc, incoming.from, (remoteMedia) => setActiveCall((current) => current?.pc === pc ? { ...current, remoteMedia, remoteStream: remoteMedia.camera } : current), (data) => api.signal(incoming.from, data));
    media.setDeafened(deafenedRef.current);
    let localStream: MediaStream | null = null;
    try {
      localStream = await getMedia(incoming.kind);
      localStream.getAudioTracks().forEach((track) => { track.enabled = !mutedRef.current; });
      await mediaPeer(pc).publishInitial(localStream);
    } catch (e) {
      console.error('getUserMedia failed', e);
      toast.error('Não foi possível aceder ao microfone. Podes continuar a ouvir a chamada.');
      /* Fixed transceivers already allow receiving without a microphone. */
      
    }
    acceptingCallRef.current = false;
    if (incomingCallRef.current !== incoming) { localStream?.getTracks().forEach(stopTrack); closeMediaPeer(pc); pc.close(); return; }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        api.signal(incoming.from, { candidate: ev.candidate.toJSON() });
      }
    };
    pc.onconnectionstatechange = () => {
      if (activeCallRef.current?.peerId !== incoming.from) return;
      if (pc.connectionState === 'connected') setActiveCall((current) => current?.peerId === incoming.from ? { ...current, connected: true } : current);
      if (pc.connectionState === 'failed') {
        api.hangup(incoming.from);
        cleanupCall(activeCallRef.current);
        activeCallRef.current = null;
        setActiveCall(null);
      }
    };

    const newCall: ActiveCall = {
      peerId: incoming.from,
      kind: incoming.kind,
      pc,
      localStream,
      remoteStream: null,
      isOfferer: false,
      connected: false,
    };
    activeCallRef.current = newCall;
    setActiveCall(newCall);
    setIncomingCall(null);
    api.accept(incoming.from);
  }, [leaveVoiceChannel]);

  const setCallVideoStream = useCallback(async (kind: 'camera' | 'screen', stream: MediaStream | null) => {
    const call = activeCallRef.current;
    if (!call || call.pc.signalingState === 'closed') return;
    await mediaPeer(call.pc).publish(kind, stream);
  }, []);

  const rejectCall = useCallback(() => {
    if (!incomingCall) return;
    incomingCallRef.current = null;
    api.reject(incomingCall.from);
    setIncomingCall(null);
  }, [incomingCall]);

  const hangup = useCallback(() => {
    const call = activeCallRef.current;
    if (!call) return;
    api.hangup(call.peerId);
    cleanupCall(call);
    pendingCandidatesRef.current = [];
    isStartingOfferRef.current = false;
    activeCallRef.current = null;
    setActiveCall(null);
  }, []);

  const logout = useCallback(() => {
    voiceJoinGenerationRef.current++;
    incomingCallRef.current = null;
    const call = activeCallRef.current;
    if (call) {
      cleanupCall(call);
      activeCallRef.current = null;
    }
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach(stopTrack);
      voiceStreamRef.current = null; setVoiceLocalStream(null);
    }
    for (const peerId of voiceConnectionsRef.current.keys()) closeVoiceConnection(peerId);
    voiceChannelIdRef.current = null;
    pendingCandidatesRef.current = [];
    isStartingOfferRef.current = false;
    mutedRef.current = false;
    deafenedRef.current = false;
    setIsMuted(false);
    setIsDeafened(false);
    api.logout();
    setProfile(null);
    setUsers([]);
    setBlockedUsers([]);
    setFriendsState({ friends: [], incoming: [], outgoing: [] });
    setConversations(new Map());
    setCommunities([]);
    setActiveCommunityId(null);
    setActiveChannelId(null);
    setChannelMessages(new Map());
    setActiveVoiceChannelId(null);
    setActiveUserId(null);
    setIncomingCall(null);
    setActiveCall(null);
    setIsConnected(false);
    setTypingFrom(null);
  }, [closeVoiceConnection]);

  return {
    profile,
    users,
    blockedUsers,
    friendsState,
    conversations,
    activeUserId,
    setActiveUserId,
    communities,
    publicCommunities,
    activeCommunityId,
    setActiveCommunityId,
    activeChannelId,
    setActiveChannelId,
    channelMessages,
    voiceState,
    activeVoiceChannelId,
    pendingVoiceChannelId,
    isMuted,
    voiceError,
    voiceVideoStreams,
    voiceLocalStream,
    setVoiceVideoStream,
    isDeafened,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
    changeAudioDevice,
    enablePtt,
    pttActiveRef,
    incomingCall,
    activeCall,
    setCallVideoStream,
    isConnected,
    typingFrom,
    sendMessage,
    sendTyping,
    startCall,
    acceptCall,
    rejectCall,
    hangup,
    logout,
  };
}
