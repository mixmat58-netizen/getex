export type MessageType = "text" | "voice" | "image" | "file" | "video";

export interface User {
  id: string;
  username: string;
  name: string;
  phone: string;
  avatar: string;
  bio: string;
  createdAt?: string;
  online?: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  type: MessageType;
  imageUrl?: string;
  voiceUrl?: string;
  videoUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  voiceDuration?: number;
  readAt?: string | null;
  createdAt: string;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  text: string;
  type: MessageType;
  imageUrl?: string;
  voiceUrl?: string;
  videoUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  voiceDuration?: number;
  sender?: {
    id: string;
    name: string;
    username: string;
    avatar: string;
  } | null;
  createdAt: string;
}

export interface ChatPreview {
  user: User;
  unread: number;
  lastMessage: Message;
}

export interface GroupPreview {
  id: string;
  kind: "group" | "channel";
  name: string;
  avatar: string;
  members: string[];
  memberCount: number;
  unread: number;
  updatedAt: string;
  lastMessage: GroupMessage | null;
}

export interface StoryItem {
  id: string;
  type: "image" | "video";
  mediaUrl: string;
  createdAt: string;
  viewed: boolean;
}

export interface StoryUser {
  id: string;
  name: string;
  avatar: string;
  isOwn: boolean;
  viewed: boolean;
  stories: StoryItem[];
}

export interface DeviceSession {
  id: string;
  userAgent: string;
  ip: string;
  lastActiveAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface IncomingCallPayload {
  callId: string;
  from: {
    id: string;
    name: string;
    username: string;
    avatar: string;
  };
  to:
    | string
    | {
        id: string;
        name: string;
        username: string;
        avatar: string;
      };
  type: "voice" | "video";
  status: string;
  createdAt: string;
}
