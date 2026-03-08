import {
  AuthResponse,
  ChatPreview,
  DeviceSession,
  GroupMessage,
  GroupPreview,
  Message,
  MessageType,
  StoryItem,
  StoryUser,
  User,
} from "./types";

const TOKEN_KEY = "getex_token";

function getBaseUrl() {
  return "";
}

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
}

export async function login(identifier: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

export async function requestQrLoginChallenge(): Promise<{
  challengeId: string;
  secret: string;
  code: string;
  expiresAt: string;
}> {
  return request("/api/auth/qr/request", {
    method: "POST",
  });
}

export async function getQrLoginStatus(
  challengeId: string,
  secret: string
): Promise<
  | { status: "pending" | "expired" | "consumed"; expiresAt: string }
  | { status: "approved"; token: string; user: User; expiresAt: string }
> {
  return request(
    `/api/auth/qr/status/${encodeURIComponent(challengeId)}?secret=${encodeURIComponent(secret)}`
  );
}

export async function approveQrLogin(code: string): Promise<void> {
  await request("/api/auth/qr/approve", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function registerUser(payload: {
  username: string;
  name: string;
  phone: string;
  password: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function checkUsername(username: string): Promise<boolean> {
  const result = await request<{ available: boolean }>(
    `/api/auth/check-username?username=${encodeURIComponent(username)}`
  );
  return result.available;
}

export async function getMe(): Promise<User> {
  const data = await request<{ user: User }>("/api/auth/me");
  return data.user;
}

export async function logout(): Promise<void> {
  await request<void>("/api/auth/logout", { method: "POST" });
}

export async function searchUsers(q: string): Promise<User[]> {
  const data = await request<{ users: User[] }>(`/api/users/search?q=${encodeURIComponent(q)}`);
  return data.users;
}

export async function updateProfile(payload: Partial<Pick<User, "name" | "username" | "bio" | "avatar">>): Promise<User> {
  const data = await request<{ user: User }>("/api/users/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return data.user;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await request<void>("/api/users/password", {
    method: "PUT",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function getChats(): Promise<ChatPreview[]> {
  const data = await request<{ chats: ChatPreview[] }>("/api/chats");
  return data.chats;
}

export async function startDirectChat(userId: string): Promise<{ id: string; user: User }> {
  const data = await request<{ chat: { id: string; user: User } }>("/api/chats/start", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  return data.chat;
}

export async function getMessages(userId: string): Promise<Message[]> {
  const data = await request<{ messages: Message[] }>(`/api/messages/${userId}`);
  return data.messages;
}

export async function sendDirectMessage(payload: {
  receiverId: string;
  text?: string;
  type?: MessageType;
  imageUrl?: string;
  voiceUrl?: string;
  videoUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  voiceDuration?: number;
}): Promise<Message> {
  const data = await request<{ message: Message }>("/api/messages", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.message;
}

export async function getGroups(kind?: "group" | "channel"): Promise<GroupPreview[]> {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  const data = await request<{ groups: GroupPreview[] }>(`/api/groups${query}`);
  return data.groups;
}

export async function createGroup(payload: {
  name: string;
  kind?: "group" | "channel";
  avatar?: string;
  memberIds?: string[];
}): Promise<GroupPreview> {
  const data = await request<{ group: GroupPreview }>("/api/groups", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.group;
}

export async function updateGroupAvatar(groupId: string, avatar: string): Promise<void> {
  await request<{ group: { id: string; avatar: string } }>(`/api/groups/${groupId}/avatar`, {
    method: "PUT",
    body: JSON.stringify({ avatar }),
  });
}

export async function getGroupMessages(groupId: string): Promise<GroupMessage[]> {
  const data = await request<{ messages: GroupMessage[] }>(`/api/groups/${groupId}/messages`);
  return data.messages;
}

export async function sendGroupMessage(
  groupId: string,
  payload: {
    text?: string;
    type?: MessageType;
    imageUrl?: string;
    voiceUrl?: string;
    videoUrl?: string;
    fileUrl?: string;
    fileName?: string;
    fileSize?: string;
    voiceDuration?: number;
  }
): Promise<GroupMessage> {
  const data = await request<{ message: GroupMessage }>(`/api/groups/${groupId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.message;
}

export async function getStories(): Promise<StoryUser[]> {
  const data = await request<{ stories: StoryUser[] }>("/api/stories");
  return data.stories;
}

export async function createStory(payload: { type: "image" | "video"; mediaUrl: string }): Promise<StoryItem> {
  const data = await request<{ story: StoryItem }>("/api/stories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.story;
}

export async function markStoryViewed(storyId: string): Promise<void> {
  await request<void>(`/api/stories/${storyId}/view`, { method: "POST" });
}

export async function getSessions(): Promise<DeviceSession[]> {
  const data = await request<{ sessions: DeviceSession[] }>("/api/auth/sessions");
  return data.sessions;
}

export async function endSession(sessionId: string): Promise<void> {
  await request<void>(`/api/auth/sessions/${sessionId}`, { method: "DELETE" });
}

export async function endOtherSessions(): Promise<void> {
  await request<void>("/api/auth/sessions/revoke-others", { method: "POST" });
}
