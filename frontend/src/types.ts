export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  hue: number;
  emoji: string;
  avatarUrl?: string;
  bannerUrl?: string;
  bannerPosition?: number;
  customStatus?: string;
  about: string;
  status: string;
  createdAt: number;
  online: boolean;
  globalRole?: 'owner' | 'admin';
  readReceiptsEnabled?: boolean;
  allowMemberDMs?: boolean;
  accountStatus?: 'active' | 'suspended' | 'restricted';
  statusReason?: string;
}

export type MyProfile = Omit<PublicUser, "online">;

export interface Message {
  id: string;
  from: string;
  to: string;
  text: string;
  at: number;
  reactions?: Record<string, string[]>;
  poll?: { question: string; options: string[]; votes: Record<string, number> };
  attachment?: Attachment;
  readAt?: number;
}

export interface Attachment { id: string; name: string; size: number; type: string }

export interface Conversation {
  user: PublicUser;
  messages: Message[];
}

export interface SignalData {
  media?: MediaState[];
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  renegotiate?: boolean;
}
export type MediaKind = 'microphone' | 'camera' | 'screen' | 'screenAudio';
export interface MediaState { mid: string; kind: MediaKind; active: boolean }
export interface RemoteMedia {
  microphone: MediaStream; camera: MediaStream; screen: MediaStream; screenAudio: MediaStream;
  microphoneActive: boolean; cameraActive: boolean; screenActive: boolean; screenAudioActive: boolean;
}

export interface CommunityCategory {
  id: string;
  name: string;
  position?: number;
}

export interface CommunityRolePermissions {
  administrator?: boolean;
  manageServer?: boolean;
  manageChannels?: boolean;
  manageRoles?: boolean;
  manageMessages?: boolean;
  sendMessages?: boolean;
  connectVoice?: boolean;
  speakVoice?: boolean;
  muteVoiceMembers?: boolean;
  kickVoiceMembers?: boolean;
  kickMembers?: boolean;
  inviteMembers?: boolean;
}

export interface CommunityRole {
  id: string;
  name: string;
  color?: string;
  permissions: CommunityRolePermissions;
}

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice' | 'announcement';
  deniedUsers?: string[];
  categoryId?: string;
  position?: number;
}

export interface Community {
  directGroup?: boolean;
  id: string;
  name: string;
  icon: string;
  bannerUrl?: string;
  bannerPosition?: number;
  bannerColor?: string;
  description: string;
  isPublic: boolean;
  ownerId: string;
  admins?: string[];
  memberRoles?: Record<string, string[]>;
  roles?: CommunityRole[];
  categories?: CommunityCategory[];
  defaultRoleId?: string | null;
  allowMemberInvites?: boolean;
  inviteCode: string;
  members: string[]; // user IDs
  memberCount?: number;
  textChannelCount?: number;
  voiceChannelCount?: number;
  channels: Channel[];
  createdAt: number;
  suspended?: boolean;
  suspendReason?: string;
}

export interface ChannelMessage {
  id: string;
  communityId: string;
  channelId: string;
  from: string;
  text: string;
  at: number;
  reactions?: Record<string, string[]>;
  poll?: { question: string; options: string[]; votes: Record<string, number> };
  attachment?: Attachment;
}
