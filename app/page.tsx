"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Socket } from "socket.io-client"
import { MessageSquare } from "lucide-react"
import { AuroraBackground } from "@/components/getex/aurora-background"
import { LoginForm } from "@/components/getex/login-form"
import { Topbar } from "@/components/getex/topbar"
import { ChatSidebar } from "@/components/getex/chat-sidebar"
import { ChatArea } from "@/components/getex/chat-area"
import { SettingsPanel } from "@/components/getex/settings-panel"
import { CallOverlay } from "@/components/getex/call-overlay"
import { StoryViewer } from "@/components/getex/story-viewer"
import { UserProfileModal } from "@/components/getex/user-profile-modal"
import {
  changePassword,
  checkUsername,
  clearToken,
  createGroup,
  createStory,
  approveQrLogin,
  endOtherSessions,
  endSession,
  getChats,
  getGroupMessages,
  getGroups,
  getMe,
  getMessages,
  getSessions,
  getStories,
  getToken,
  login,
  logout,
  markStoryViewed,
  registerUser,
  searchUsers,
  sendDirectMessage,
  sendGroupMessage,
  setToken,
  startDirectChat,
  updateProfile,
} from "@/lib/client/api"
import { createClientSocket } from "@/lib/client/socket"
import type {
  ChatPreview,
  DeviceSession,
  GroupMessage,
  GroupPreview,
  IncomingCallPayload,
  Message,
  MessageType,
  StoryUser,
  User,
} from "@/lib/client/types"
import { createPeerConnection, getMediaStream } from "@/lib/client/webrtc"

interface UiSession {
  id: string
  device: "desktop" | "mobile" | "tablet"
  browser: string
  os: string
  ip: string
  country: string
  lastActive: string
  isCurrent: boolean
}

interface AppCallState {
  callId: string
  type: "audio" | "video"
  direction: "incoming" | "outgoing"
  status: "ringing" | "connecting" | "connected" | "ended"
  userId: string
  user: {
    name: string
    avatar: string
  }
}

interface ProfileViewUser {
  id: string
  name: string
  username: string
  phone: string
  avatar: string
  bio?: string
}

function parseUserAgent(userAgent: string) {
  const value = userAgent.toLowerCase()

  let browser = "Unknown"
  if (value.includes("edg")) browser = "Edge"
  else if (value.includes("chrome")) browser = "Chrome"
  else if (value.includes("safari") && !value.includes("chrome")) browser = "Safari"
  else if (value.includes("firefox")) browser = "Firefox"

  let os = "Unknown"
  if (value.includes("windows")) os = "Windows"
  else if (value.includes("mac os")) os = "macOS"
  else if (value.includes("android")) os = "Android"
  else if (value.includes("iphone") || value.includes("ios")) os = "iOS"
  else if (value.includes("linux")) os = "Linux"

  let device: UiSession["device"] = "desktop"
  if (value.includes("mobile") || value.includes("iphone") || value.includes("android")) device = "mobile"
  if (value.includes("ipad") || value.includes("tablet")) device = "tablet"

  return { browser, os, device }
}

function relativeTime(iso: string) {
  const now = Date.now()
  const date = new Date(iso).getTime()
  const diff = now - date

  if (diff < 60000) return "сейчас"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}м`
  if (diff < 86400000) return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
}

function messagePreview(message?: Message | GroupMessage | null) {
  if (!message) return ""
  if (message.type === "image") return "Изображение"
  if (message.type === "voice") return "Голосовое сообщение"
  if (message.type === "video") return "Видео"
  if (message.type === "file") return message.fileName ? `Файл: ${message.fileName}` : "Файл"
  return message.text || "Сообщение"
}

async function pickFileAsDataUrl(accept: string): Promise<{ file: File; dataUrl: string } | null> {
  if (typeof window === "undefined") return null

  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = accept
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }

      const reader = new FileReader()
      reader.onload = () => resolve({ file, dataUrl: String(reader.result || "") })
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    }
    input.click()
  })
}

export default function GetexApp() {
  const [isBooting, setIsBooting] = useState(true)
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  const [activeTab, setActiveTab] = useState<"chats" | "groups" | "channels">("chats")
  const [activeDirectChat, setActiveDirectChat] = useState<string | null>(null)
  const [activeGroupChat, setActiveGroupChat] = useState<string | null>(null)

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<"profile" | "devices" | "themes" | "qr">("profile")
  const [currentTheme, setCurrentTheme] = useState("aurora")

  const [chats, setChats] = useState<ChatPreview[]>([])
  const [groups, setGroups] = useState<GroupPreview[]>([])
  const [channels, setChannels] = useState<GroupPreview[]>([])

  const [messagesByUser, setMessagesByUser] = useState<Record<string, Message[]>>({})
  const [groupMessagesById, setGroupMessagesById] = useState<Record<string, GroupMessage[]>>({})

  const [searchResults, setSearchResults] = useState<User[]>([])
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set())
  const [sessions, setSessions] = useState<UiSession[]>([])

  const [stories, setStories] = useState<StoryUser[]>([])
  const [isStoryViewerOpen, setIsStoryViewerOpen] = useState(false)
  const [storyViewerUserId, setStoryViewerUserId] = useState<string | null>(null)

  const [callState, setCallState] = useState<AppCallState | null>(null)
  const [isCallMinimized, setIsCallMinimized] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(true)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [remoteVideoActive, setRemoteVideoActive] = useState(false)
  const [remoteScreenSharing, setRemoteScreenSharing] = useState(false)
  const [profileUser, setProfileUser] = useState<ProfileViewUser | null>(null)

  const socketRef = useRef<Socket | null>(null)
  const callStateRef = useRef<AppCallState | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const audioSenderRef = useRef<RTCRtpSender | null>(null)
  const videoSenderRef = useRef<RTCRtpSender | null>(null)
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null)
  const screenTrackRef = useRef<MediaStreamTrack | null>(null)
  const remoteMediaStreamRef = useRef<MediaStream | null>(null)
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const currentUserRef = useRef<User | null>(null)
  const chatsRef = useRef<ChatPreview[]>([])
  const groupsRef = useRef<GroupPreview[]>([])
  const channelsRef = useRef<GroupPreview[]>([])

  useEffect(() => {
    currentUserRef.current = currentUser
  }, [currentUser])

  useEffect(() => {
    chatsRef.current = chats
  }, [chats])

  useEffect(() => {
    groupsRef.current = groups
  }, [groups])

  useEffect(() => {
    channelsRef.current = channels
  }, [channels])

  useEffect(() => {
    callStateRef.current = callState
  }, [callState])

  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  useEffect(() => {
    const pc = peerConnectionRef.current
    if (!pc) return

    if (!audioSenderRef.current) {
      audioSenderRef.current = pc.getTransceivers().find((item) => item.receiver.track.kind === "audio")?.sender || null
    }
    if (!videoSenderRef.current) {
      videoSenderRef.current = pc.getTransceivers().find((item) => item.receiver.track.kind === "video")?.sender || null
    }

    const audioTrack = localStream?.getAudioTracks()[0] || null
    const videoTrack = localStream?.getVideoTracks()[0] || null

    if (audioSenderRef.current) {
      void audioSenderRef.current.replaceTrack(audioTrack)
    }
    if (videoSenderRef.current) {
      void videoSenderRef.current.replaceTrack(videoTrack)
    }
  }, [localStream])

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", currentTheme === "aurora" ? "" : currentTheme)
  }, [currentTheme])

  const notify = useCallback((title: string, body: string) => {
    if (typeof window === "undefined") return
    if (!("Notification" in window)) return

    if (Notification.permission === "granted") {
      if (document.visibilityState !== "visible") {
        new Notification(title, { body })
      }
      return
    }

    if (Notification.permission === "default") {
      void Notification.requestPermission()
    }
  }, [])

  const cleanupPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null
      peerConnectionRef.current.ontrack = null
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    audioSenderRef.current = null
    videoSenderRef.current = null
    remoteMediaStreamRef.current = null
    pendingIceCandidatesRef.current = []

    setRemoteStream(null)
    setRemoteVideoActive(false)
    setRemoteScreenSharing(false)
  }, [])

  const cleanupLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
    }
    if (cameraTrackRef.current) {
      cameraTrackRef.current.stop()
      cameraTrackRef.current = null
    }
    if (screenTrackRef.current) {
      screenTrackRef.current.stop()
      screenTrackRef.current = null
    }

    setLocalStream(null)
    setIsMuted(false)
    setIsVideoOff(false)
    setIsScreenSharing(false)
  }, [])

  const finishCall = useCallback(() => {
    cleanupPeerConnection()
    cleanupLocalStream()
    setIsCallMinimized(false)
    setTimeout(() => {
      setCallState(null)
    }, 600)
  }, [cleanupLocalStream, cleanupPeerConnection])

  const syncRemoteVideoActivity = useCallback(() => {
    const stream = remoteMediaStreamRef.current
    if (!stream) {
      setRemoteVideoActive(false)
      return
    }
    const active = stream.getVideoTracks().some((track) => track.readyState === "live")
    setRemoteVideoActive(active)
  }, [])

  const renegotiateCall = useCallback(async () => {
    const pc = peerConnectionRef.current
    const socket = socketRef.current
    const state = callStateRef.current
    if (!pc || !socket || !state?.callId) return
    if (state.status !== "connected") return
    if (pc.signalingState !== "stable") return

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    socket.emit("webrtc:offer", { callId: state.callId, data: offer })
  }, [])

  const emitLocalMediaState = useCallback((videoActive: boolean, screenSharing: boolean) => {
    const socket = socketRef.current
    const state = callStateRef.current
    if (!socket || !state?.callId) return

    socket.emit("webrtc:media-state", {
      callId: state.callId,
      data: {
        videoActive,
        screenSharing,
      },
    })
  }, [])

  const ensurePeerConnection = useCallback(async (callId: string) => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current
    }

    const pc = createPeerConnection()
    peerConnectionRef.current = pc
    const audioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" })
    const videoTransceiver = pc.addTransceiver("video", { direction: "sendrecv" })
    audioSenderRef.current = audioTransceiver.sender
    videoSenderRef.current = videoTransceiver.sender

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("webrtc:ice-candidate", {
          callId,
          data: event.candidate,
        })
      }
    }

    pc.ontrack = (event) => {
      const [stream] = event.streams
      if (stream) {
        remoteMediaStreamRef.current = stream
        setRemoteStream(stream)
      } else {
        if (!remoteMediaStreamRef.current) {
          remoteMediaStreamRef.current = new MediaStream()
        }

        const remote = remoteMediaStreamRef.current
        if (!remote.getTracks().some((track) => track.id === event.track.id)) {
          remote.addTrack(event.track)
        }
        setRemoteStream(remote)
      }

      if (event.track.kind === "video") {
        event.track.onunmute = () => {
          syncRemoteVideoActivity()
        }
        event.track.onmute = () => {
          syncRemoteVideoActivity()
        }
        event.track.onended = () => {
          syncRemoteVideoActivity()
        }
      }

      if (event.track.kind === "audio") {
        event.track.onended = () => {
          syncRemoteVideoActivity()
        }
      }

      syncRemoteVideoActivity()
    }

    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0] || null
      const videoTrack = localStreamRef.current.getVideoTracks()[0] || null
      await audioSenderRef.current.replaceTrack(audioTrack)
      await videoSenderRef.current.replaceTrack(videoTrack)
    }

    return pc
  }, [syncRemoteVideoActivity])

  const syncLocalStreamWithVideoTrack = useCallback((videoTrack: MediaStreamTrack | null) => {
    const current = localStreamRef.current
    if (!current) return
    const audioTracks = current.getAudioTracks()
    const nextTracks = videoTrack ? [...audioTracks, videoTrack] : [...audioTracks]
    const nextStream = new MediaStream(nextTracks)
    localStreamRef.current = nextStream
    setLocalStream(nextStream)
  }, [])

  const ensureVideoSender = useCallback(
    async (track: MediaStreamTrack | null) => {
      const pc = peerConnectionRef.current
      if (!pc) return

      if (!videoSenderRef.current) {
        const existingVideoSender =
          pc.getTransceivers().find((sender) => sender.receiver.track.kind === "video")?.sender ||
          pc.getSenders().find((sender) => sender.track?.kind === "video")
        if (existingVideoSender) {
          videoSenderRef.current = existingVideoSender
        }
      }

      if (videoSenderRef.current) {
        await videoSenderRef.current.replaceTrack(track)
      }
    },
    []
  )

  const flushPendingIceCandidates = useCallback(async () => {
    const pc = peerConnectionRef.current
    if (!pc || !pc.remoteDescription) return
    if (!pendingIceCandidatesRef.current.length) return

    const queue = [...pendingIceCandidatesRef.current]
    pendingIceCandidatesRef.current = []

    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch {
        // keep call alive even if one candidate is stale
      }
    }
  }, [])

  const disableVideoTrack = useCallback(async () => {
    const hadVideo = Boolean(localStreamRef.current?.getVideoTracks().length)

    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null
      screenTrackRef.current.stop()
      screenTrackRef.current = null
    }
    if (cameraTrackRef.current) {
      cameraTrackRef.current.stop()
      cameraTrackRef.current = null
    }

    await ensureVideoSender(null)
    syncLocalStreamWithVideoTrack(null)
    if (hadVideo) {
      await renegotiateCall()
    }
    emitLocalMediaState(false, false)
    setIsVideoOff(true)
    setIsScreenSharing(false)
  }, [ensureVideoSender, renegotiateCall, syncLocalStreamWithVideoTrack])

  const enableCameraVideo = useCallback(async () => {
    const hadVideo = Boolean(localStreamRef.current?.getVideoTracks().length)
    let track = cameraTrackRef.current
    if (!track || track.readyState !== "live") {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
        audio: false,
      })
      track = cameraStream.getVideoTracks()[0]
      cameraTrackRef.current = track
    }

    await ensureVideoSender(track)
    syncLocalStreamWithVideoTrack(track)
    if (!hadVideo) {
      await renegotiateCall()
    }
    emitLocalMediaState(true, false)
    setIsVideoOff(false)
    setIsScreenSharing(false)
  }, [ensureVideoSender, renegotiateCall, syncLocalStreamWithVideoTrack])

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      const hadVideo = Boolean(localStreamRef.current?.getVideoTracks().length)
      if (screenTrackRef.current) {
        screenTrackRef.current.onended = null
        screenTrackRef.current.stop()
        screenTrackRef.current = null
      }

      if (cameraTrackRef.current && cameraTrackRef.current.readyState === "live") {
        await ensureVideoSender(cameraTrackRef.current)
        syncLocalStreamWithVideoTrack(cameraTrackRef.current)
        setIsVideoOff(false)
      } else {
        await ensureVideoSender(null)
        syncLocalStreamWithVideoTrack(null)
        setIsVideoOff(true)
      }

      if (hadVideo && !cameraTrackRef.current) {
        await renegotiateCall()
      }
      emitLocalMediaState(Boolean(cameraTrackRef.current && cameraTrackRef.current.readyState === "live"), false)
      setIsScreenSharing(false)
      return
    }

    const hadVideo = Boolean(localStreamRef.current?.getVideoTracks().length)
    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    const screenTrack = displayStream.getVideoTracks()[0]
    if (!screenTrack) return

    screenTrackRef.current = screenTrack
    await ensureVideoSender(screenTrack)
    syncLocalStreamWithVideoTrack(screenTrack)
    if (!hadVideo) {
      await renegotiateCall()
    }
    emitLocalMediaState(true, true)
    setIsScreenSharing(true)
    setIsVideoOff(false)

    screenTrack.onended = () => {
      void (async () => {
        if (!screenTrackRef.current) return
        screenTrackRef.current = null
        if (cameraTrackRef.current && cameraTrackRef.current.readyState === "live") {
          await ensureVideoSender(cameraTrackRef.current)
          syncLocalStreamWithVideoTrack(cameraTrackRef.current)
          setIsVideoOff(false)
        } else {
          await ensureVideoSender(null)
          syncLocalStreamWithVideoTrack(null)
          setIsVideoOff(true)
        }
        setIsScreenSharing(false)
        if (!cameraTrackRef.current) {
          await renegotiateCall()
        }
        emitLocalMediaState(Boolean(cameraTrackRef.current && cameraTrackRef.current.readyState === "live"), false)
      })()
    }
  }, [ensureVideoSender, isScreenSharing, renegotiateCall, syncLocalStreamWithVideoTrack])

  const loadChats = useCallback(async () => {
    if (!currentUserRef.current) return

    const data = await getChats()
    setChats(data)

    if (!activeDirectChat && data.length > 0) {
      setActiveDirectChat(data[0].user.id)
    }
  }, [activeDirectChat])

  const loadGroups = useCallback(async () => {
    if (!currentUserRef.current) return

    const [groupData, channelData] = await Promise.all([getGroups("group"), getGroups("channel")])
    setGroups(groupData)
    setChannels(channelData)

    if (!activeGroupChat) {
      const firstId = (activeTab === "channels" ? channelData[0]?.id : groupData[0]?.id) || null
      if (firstId) {
        setActiveGroupChat(firstId)
      }
    }
  }, [activeGroupChat, activeTab])

  const loadStories = useCallback(async () => {
    if (!currentUserRef.current) return
    const data = await getStories()
    setStories(data)
  }, [])

  const loadSessions = useCallback(async () => {
    if (!currentUserRef.current) return

    const apiSessions = await getSessions()
    const mapped = apiSessions.map((session: DeviceSession) => {
      const { browser, os, device } = parseUserAgent(session.userAgent || "")
      return {
        id: session.id,
        browser,
        os,
        device,
        ip: session.ip,
        country: "Unknown",
        lastActive: relativeTime(session.lastActiveAt),
        isCurrent: session.isCurrent,
      } satisfies UiSession
    })
    setSessions(mapped)
  }, [])

  const loadMessagesForChat = useCallback(async (chatUserId: string) => {
    const messages = await getMessages(chatUserId)
    setMessagesByUser((prev) => ({ ...prev, [chatUserId]: messages }))
  }, [])

  const loadMessagesForGroup = useCallback(async (groupId: string) => {
    const messages = await getGroupMessages(groupId)
    setGroupMessagesById((prev) => ({ ...prev, [groupId]: messages }))
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setIsBooting(false)
      return
    }

    void (async () => {
      try {
        const user = await getMe()
        setCurrentUser(user)
      } catch {
        clearToken()
        setCurrentUser(null)
      } finally {
        setIsBooting(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!currentUser) return

    void Promise.all([loadChats(), loadGroups(), loadStories(), loadSessions()])

    const token = getToken()
    const socket = createClientSocket(token)
    socketRef.current = socket

    socket.on("message:new", (message: Message) => {
      const self = currentUserRef.current
      if (!self) return

      const partnerId = message.senderId === self.id ? message.receiverId : message.senderId

      setMessagesByUser((prev) => {
        const existing = prev[partnerId] || []
        if (existing.some((item) => item.id === message.id)) {
          return prev
        }
        return { ...prev, [partnerId]: [...existing, message] }
      })

      void loadChats()

      if (message.senderId !== self.id) {
        const senderChat = chatsRef.current.find((chat) => chat.user.id === message.senderId)
        notify(senderChat?.user.name || "Новое сообщение", messagePreview(message))
      }
    })

    socket.on("group:message:new", (message: GroupMessage) => {
      setGroupMessagesById((prev) => {
        const existing = prev[message.groupId] || []
        if (existing.some((item) => item.id === message.id)) {
          return prev
        }
        return { ...prev, [message.groupId]: [...existing, message] }
      })

      void loadGroups()

      if (message.senderId !== currentUserRef.current?.id) {
        const group = [...groupsRef.current, ...channelsRef.current].find((item) => item.id === message.groupId)
        notify(group?.name || "Группа", messagePreview(message))
      }
    })

    socket.on("typing:start", ({ userId }: { userId: string }) => {
      setTypingUserIds((prev) => new Set(prev).add(userId))
    })

    socket.on("typing:stop", ({ userId }: { userId: string }) => {
      setTypingUserIds((prev) => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    })

    socket.on("presence:update", ({ userId, online }: { userId: string; online: boolean }) => {
      setChats((prev) => prev.map((chat) => (chat.user.id === userId ? { ...chat, user: { ...chat.user, online } } : chat)))
      setSearchResults((prev) => prev.map((user) => (user.id === userId ? { ...user, online } : user)))
    })

    socket.on("call:incoming", (payload: IncomingCallPayload) => {
      pendingIceCandidatesRef.current = []
      remoteMediaStreamRef.current = null
      setRemoteStream(null)
      setRemoteVideoActive(false)
      setRemoteScreenSharing(false)
      setIsCallMinimized(false)
      setCallState({
        callId: payload.callId,
        type: payload.type === "video" ? "video" : "audio",
        direction: "incoming",
        status: "ringing",
        userId: payload.from.id,
        user: {
          name: payload.from.name,
          avatar: payload.from.avatar,
        },
      })

      notify("Входящий звонок", `${payload.from.name} звонит вам`)
    })

    socket.on("call:outgoing", (payload: IncomingCallPayload) => {
      setRemoteVideoActive(false)
      setRemoteScreenSharing(false)
      setIsCallMinimized(false)
      const targetId = String(payload.to)
      const targetUser = chatsRef.current.find((chat) => chat.user.id === targetId)?.user
      setCallState({
        callId: payload.callId,
        type: payload.type === "video" ? "video" : "audio",
        direction: "outgoing",
        status: "ringing",
        userId: targetId,
        user: {
          name: targetUser?.name || "User",
          avatar: targetUser?.avatar || "/placeholder-user.jpg",
        },
      })
    })

    socket.on("call:accepted", async ({ callId }: { callId: string }) => {
      const state = callStateRef.current
      if (!state || state.callId !== callId) return

      setCallState((prev) => (prev ? { ...prev, status: "connecting" } : prev))
      pendingIceCandidatesRef.current = []

      if (state.direction === "outgoing") {
        const pc = await ensurePeerConnection(callId)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit("webrtc:offer", { callId, data: offer })
      }
    })

    socket.on("call:declined", ({ callId }: { callId: string }) => {
      setCallState((prev) => (prev && prev.callId === callId ? { ...prev, status: "ended" } : prev))
      finishCall()
    })

    socket.on("call:ended", ({ callId }: { callId: string }) => {
      setCallState((prev) => (prev && prev.callId === callId ? { ...prev, status: "ended" } : prev))
      finishCall()
    })

    socket.on("webrtc:offer", async ({ callId, data }: { callId: string; data: RTCSessionDescriptionInit }) => {
      const state = callStateRef.current
      if (!state || state.callId !== callId) return

      const pc = await ensurePeerConnection(callId)
      await pc.setRemoteDescription(new RTCSessionDescription(data))
      await flushPendingIceCandidates()

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit("webrtc:answer", { callId, data: answer })
      setCallState((prev) => (prev ? { ...prev, status: "connected" } : prev))
      emitLocalMediaState(Boolean(localStreamRef.current?.getVideoTracks().length), Boolean(screenTrackRef.current))
    })

    socket.on("webrtc:answer", async ({ callId, data }: { callId: string; data: RTCSessionDescriptionInit }) => {
      const state = callStateRef.current
      if (!state || state.callId !== callId || !peerConnectionRef.current) return

      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data))
      await flushPendingIceCandidates()
      setCallState((prev) => (prev ? { ...prev, status: "connected" } : prev))
      emitLocalMediaState(Boolean(localStreamRef.current?.getVideoTracks().length), Boolean(screenTrackRef.current))
    })

    socket.on("webrtc:media-state", ({ callId, data }: { callId: string; data: { videoActive?: boolean; screenSharing?: boolean } }) => {
      const state = callStateRef.current
      if (!state || state.callId !== callId) return
      setRemoteVideoActive(Boolean(data?.videoActive))
      setRemoteScreenSharing(Boolean(data?.screenSharing))
    })

    socket.on("webrtc:ice-candidate", async ({ callId, data }: { callId: string; data: RTCIceCandidateInit }) => {
      const state = callStateRef.current
      if (!state || state.callId !== callId || !peerConnectionRef.current) return
      if (!peerConnectionRef.current.remoteDescription) {
        pendingIceCandidatesRef.current.push(data)
        return
      }

      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data))
      } catch {
        pendingIceCandidatesRef.current.push(data)
      }
    })

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
      cleanupPeerConnection()
      cleanupLocalStream()
    }
  }, [
    cleanupLocalStream,
    cleanupPeerConnection,
    currentUser,
    ensurePeerConnection,
    finishCall,
    flushPendingIceCandidates,
    loadChats,
    loadGroups,
    loadSessions,
    loadStories,
    emitLocalMediaState,
    notify,
  ])

  useEffect(() => {
    if (!currentUser) return

    if (activeTab === "chats" && activeDirectChat && !messagesByUser[activeDirectChat]) {
      void loadMessagesForChat(activeDirectChat)
    }

    if ((activeTab === "groups" || activeTab === "channels") && activeGroupChat && !groupMessagesById[activeGroupChat]) {
      void loadMessagesForGroup(activeGroupChat)
    }
  }, [activeDirectChat, activeGroupChat, activeTab, currentUser, groupMessagesById, loadMessagesForChat, loadMessagesForGroup, messagesByUser])

  const handleLogin = async (credentials: { usernameOrPhone: string; password: string }) => {
    const data = await login(credentials.usernameOrPhone, credentials.password)
    setToken(data.token)
    setCurrentUser(data.user)

    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission()
    }
  }

  const handleRegister = async (data: { displayName: string; username: string; phone: string; password: string }) => {
    const response = await registerUser({
      username: data.username,
      name: data.displayName,
      phone: data.phone,
      password: data.password,
    })

    setToken(response.token)
    setCurrentUser(response.user)

    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission()
    }
  }

  const handleQrLogin = async (auth: { token: string; user: User }) => {
    setToken(auth.token)
    setCurrentUser(auth.user)
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission()
    }
  }

  const handleSearch = async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([])
      return
    }

    try {
      const users = await searchUsers(query)
      setSearchResults(users)
    } catch {
      setSearchResults([])
    }
  }

  const openOrCreateDirectChat = useCallback(
    async (userId: string) => {
      const foundUser = searchResults.find((item) => item.id === userId)
      if (foundUser) {
        setChats((prev) => {
          if (prev.some((chat) => chat.user.id === foundUser.id)) return prev
          const now = new Date().toISOString()
          return [
            {
              user: foundUser,
              unread: 0,
              lastMessage: {
                id: `draft-${foundUser.id}-${Date.now()}`,
                senderId: currentUserRef.current?.id || foundUser.id,
                receiverId: foundUser.id,
                text: "",
                type: "text",
                createdAt: now,
              },
            },
            ...prev,
          ]
        })
      }

      await startDirectChat(userId)
      setActiveTab("chats")
      setActiveDirectChat(userId)
      setSearchResults([])
      await Promise.all([loadChats(), loadMessagesForChat(userId), loadStories()])
    },
    [loadChats, loadMessagesForChat, loadStories, searchResults]
  )

  const handleSidebarSelect = (id: string) => {
    const isSearchResult = searchResults.some((item) => item.id === id)

    if (isSearchResult) {
      void openOrCreateDirectChat(id)
      return
    }

    if (activeTab === "chats") {
      setActiveDirectChat(id)
      setChats((prev) => prev.map((chat) => (chat.user.id === id ? { ...chat, unread: 0 } : chat)))
      return
    }

    setActiveGroupChat(id)
  }

  const handleCreateNew = async () => {
    if (activeTab === "chats") {
      const query = prompt("Введите username или телефон")?.trim()
      if (!query) return

      const users = await searchUsers(query).catch(() => [])
      setSearchResults(users)
      if (users[0]) {
        await openOrCreateDirectChat(users[0].id)
      }
      return
    }

    const entityName = activeTab === "channels" ? "канал" : "группу"
    const name = prompt(`Введите название (${entityName})`)?.trim()
    if (!name) return

    const inviteRaw = prompt("Добавить участников? Введите username/телефон через запятую (опционально)")?.trim() || ""
    const inviteTokens = inviteRaw
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)

    const memberIds: string[] = []
    for (const token of inviteTokens) {
      const found = await searchUsers(token).catch(() => [])
      const first = found[0]
      if (first && !memberIds.includes(first.id)) {
        memberIds.push(first.id)
      }
    }

    let avatar = ""
    const wantAvatar = confirm("Загрузить аватар из памяти устройства?")
    if (wantAvatar) {
      const selected = await pickFileAsDataUrl("image/*")
      if (selected) {
        avatar = selected.dataUrl
      }
    }

    const created = await createGroup({
      name,
      kind: activeTab === "channels" ? "channel" : "group",
      memberIds,
      avatar,
    })

    await loadGroups()
    setActiveGroupChat(created.id)
    setGroupMessagesById((prev) => ({ ...prev, [created.id]: [] }))
  }

  const handleTyping = (typing: boolean) => {
    if (!socketRef.current || !activeDirectChat) return
    socketRef.current.emit(typing ? "typing:start" : "typing:stop", {
      receiverId: activeDirectChat,
    })
  }

  const handleSendDirectMessage = async (payload: {
    text: string
    type: MessageType
    imageUrl?: string
    voiceUrl?: string
    videoUrl?: string
    fileUrl?: string
    fileName?: string
    fileSize?: string
    voiceDuration?: number
  }) => {
    if (!activeDirectChat) return

    if (!socketRef.current) {
      const message = await sendDirectMessage({ ...payload, receiverId: activeDirectChat })
      setMessagesByUser((prev) => ({ ...prev, [activeDirectChat]: [...(prev[activeDirectChat] || []), message] }))
      await loadChats()
      return
    }

    await new Promise<void>((resolve, reject) => {
      socketRef.current?.emit(
        "message:send",
        {
          receiverId: activeDirectChat,
          ...payload,
        },
        (result: { ok: boolean; error?: string }) => {
          if (result?.ok) {
            resolve()
            return
          }
          reject(new Error(result?.error || "Не удалось отправить сообщение"))
        }
      )
    })
  }

  const handleSendGroupMessage = async (payload: {
    text: string
    type: MessageType
    imageUrl?: string
    voiceUrl?: string
    videoUrl?: string
    fileUrl?: string
    fileName?: string
    fileSize?: string
    voiceDuration?: number
  }) => {
    if (!activeGroupChat) return

    if (!socketRef.current) {
      const message = await sendGroupMessage(activeGroupChat, payload)
      setGroupMessagesById((prev) => ({ ...prev, [activeGroupChat]: [...(prev[activeGroupChat] || []), message] }))
      await loadGroups()
      return
    }

    await new Promise<void>((resolve, reject) => {
      socketRef.current?.emit(
        "group:message:send",
        {
          groupId: activeGroupChat,
          ...payload,
        },
        (result: { ok: boolean; error?: string }) => {
          if (result?.ok) {
            resolve()
            return
          }
          reject(new Error(result?.error || "Не удалось отправить сообщение"))
        }
      )
    })
  }

  const startCall = async (type: "audio" | "video") => {
    if (!socketRef.current || !activeDirectChat) return

    const chatUser = chats.find((chat) => chat.user.id === activeDirectChat)?.user || searchResults.find((user) => user.id === activeDirectChat)
    if (!chatUser) return

    pendingIceCandidatesRef.current = []
    remoteMediaStreamRef.current = null
    setRemoteStream(null)
    setRemoteVideoActive(false)
    setRemoteScreenSharing(false)

    const media = await getMediaStream(type === "video" ? "video" : "voice")
    localStreamRef.current = media
    setLocalStream(media)
    cameraTrackRef.current = media.getVideoTracks()[0] || null
    screenTrackRef.current = null
    setIsCallMinimized(false)
    setIsVideoOff(type !== "video")
    setIsScreenSharing(false)

    setCallState({
      callId: "",
      type,
      direction: "outgoing",
      status: "ringing",
      userId: chatUser.id,
      user: {
        name: chatUser.name,
        avatar: chatUser.avatar,
      },
    })

    await new Promise<void>((resolve, reject) => {
      socketRef.current?.emit(
        "call:start",
        {
          receiverId: chatUser.id,
          type: type === "video" ? "video" : "voice",
        },
        (result: { ok: boolean; call?: { callId: string }; error?: string }) => {
          if (!result?.ok || !result.call?.callId) {
            reject(new Error(result?.error || "Не удалось начать звонок"))
            return
          }

          setCallState((prev) => (prev ? { ...prev, callId: result.call?.callId || "" } : prev))
          resolve()
        }
      )
    }).catch((error) => {
      finishCall()
      throw error
    })
  }

  const acceptCall = async () => {
    if (!callState || !socketRef.current) return

    pendingIceCandidatesRef.current = []
    remoteMediaStreamRef.current = null
    setRemoteStream(null)
    setRemoteVideoActive(false)
    setRemoteScreenSharing(false)

    const media = await getMediaStream(callState.type === "video" ? "video" : "voice")
    localStreamRef.current = media
    setLocalStream(media)
    cameraTrackRef.current = media.getVideoTracks()[0] || null
    screenTrackRef.current = null
    setIsVideoOff(callState.type !== "video")
    setIsScreenSharing(false)

    setCallState((prev) => (prev ? { ...prev, status: "connecting" } : prev))

    socketRef.current.emit("call:accept", { callId: callState.callId })
  }

  const declineCall = () => {
    if (!callState || !socketRef.current) return
    socketRef.current.emit("call:decline", { callId: callState.callId })
    setCallState((prev) => (prev ? { ...prev, status: "ended" } : prev))
    finishCall()
  }

  const endCall = () => {
    if (!callState || !socketRef.current) return
    socketRef.current.emit("call:end", { callId: callState.callId })
    setCallState((prev) => (prev ? { ...prev, status: "ended" } : prev))
    finishCall()
  }

  const toggleMute = () => {
    const next = !isMuted
    setIsMuted(next)
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
  }

  const toggleVideo = () => {
    if (isVideoOff) {
      void enableCameraVideo().catch((error: Error) => {
        alert(error.message || "Не удалось включить камеру")
      })
      return
    }

    void disableVideoTrack().catch((error: Error) => {
      alert(error.message || "Не удалось выключить видео")
    })
  }

  const toggleSpeaker = () => {
    setIsSpeakerOn((prev) => !prev)
  }

  const updateCurrentProfile = async (data: { name?: string; username?: string; bio?: string; avatar?: string }) => {
    const user = await updateProfile(data)
    setCurrentUser(user)
    setChats((prev) => prev.map((chat) => (chat.user.id === user.id ? { ...chat, user: { ...chat.user, ...user } } : chat)))
    setStories((prev) => prev.map((storyUser) => (storyUser.id === user.id ? { ...storyUser, name: user.name, avatar: user.avatar } : storyUser)))
  }

  const updateCurrentPassword = async (data: { currentPassword: string; newPassword: string }) => {
    await changePassword(data.currentPassword, data.newPassword)
  }

  const logoutCurrentUser = async () => {
    try {
      await logout()
    } catch {
      // noop
    }

    clearToken()
    setCurrentUser(null)
    setChats([])
    setGroups([])
    setChannels([])
    setMessagesByUser({})
    setGroupMessagesById({})
    setSearchResults([])
    setActiveDirectChat(null)
    setActiveGroupChat(null)
    setStories([])
    setIsStoryViewerOpen(false)
    setProfileUser(null)
    setIsCallMinimized(false)
    setIsSettingsOpen(false)

    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }

    cleanupPeerConnection()
    cleanupLocalStream()
  }

  const handleEndSession = async (sessionId: string) => {
    await endSession(sessionId)
    await loadSessions()
  }

  const handleEndAllSessions = async () => {
    await endOtherSessions()
    await loadSessions()
  }

  const handleApproveQrLogin = async (code: string) => {
    await approveQrLogin(code)
  }

  const handleAddStory = async () => {
    const selected = await pickFileAsDataUrl("image/*,video/*")
    if (!selected) return

    const type = selected.file.type.startsWith("video/") ? "video" : "image"
    await createStory({ type, mediaUrl: selected.dataUrl })
    await loadStories()
  }

  const handleStoryViewed = (storyId: string) => {
    setStories((prev) =>
      prev.map((storyUser) => {
        const nextStories = storyUser.stories.map((story) => (story.id === storyId ? { ...story, viewed: true } : story))
        return {
          ...storyUser,
          stories: nextStories,
          viewed: nextStories.every((story) => story.viewed),
        }
      })
    )

    void markStoryViewed(storyId).catch(() => undefined)
  }

  const openProfileForCurrentDialog = () => {
    if (activeTab !== "chats" || !currentChatUser) return
    setProfileUser({
      id: currentChatUser.id,
      name: currentChatUser.name,
      username: currentChatUser.username,
      phone: currentChatUser.phone,
      avatar: currentChatUser.avatar,
      bio: currentChatUser.bio,
    })
  }

  const directSidebarChats = useMemo(
    () =>
      chats.map((chat) => ({
        id: chat.user.id,
        name: chat.user.name,
        avatar: chat.user.avatar,
        lastMessage: messagePreview(chat.lastMessage),
        time: relativeTime(chat.lastMessage.createdAt),
        unread: chat.unread,
        online: Boolean(chat.user.online),
        verified: false,
        typing: typingUserIds.has(chat.user.id),
      })),
    [chats, typingUserIds]
  )

  const groupSidebarChats = useMemo(() => {
    const source = activeTab === "channels" ? channels : groups

    return source.map((group) => ({
      id: group.id,
      name: group.name,
      avatar: group.avatar,
      lastMessage: messagePreview(group.lastMessage),
      time: group.lastMessage ? relativeTime(group.lastMessage.createdAt) : relativeTime(group.updatedAt),
      unread: group.unread,
      online: false,
      verified: group.kind === "channel",
      typing: false,
    }))
  }, [activeTab, channels, groups])

  const sidebarChats = activeTab === "chats" ? directSidebarChats : groupSidebarChats

  const currentGroupList = activeTab === "channels" ? channels : groups

  const currentChatUser = useMemo(() => {
    if (!activeDirectChat) return null
    return chats.find((chat) => chat.user.id === activeDirectChat)?.user || searchResults.find((user) => user.id === activeDirectChat) || null
  }, [activeDirectChat, chats, searchResults])

  const currentGroup = useMemo(() => {
    if (!activeGroupChat) return null
    return currentGroupList.find((group) => group.id === activeGroupChat) || null
  }, [activeGroupChat, currentGroupList])

  const currentMessages = useMemo(() => {
    if (activeTab === "chats") {
      if (!activeDirectChat) return []
      return messagesByUser[activeDirectChat] || []
    }

    if (!activeGroupChat) return []
    return groupMessagesById[activeGroupChat] || []
  }, [activeDirectChat, activeGroupChat, activeTab, groupMessagesById, messagesByUser])

  const searchItems = useMemo(
    () =>
      searchResults.map((user) => ({
        id: user.id,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
        online: user.online,
      })),
    [searchResults]
  )

  const storyItems = useMemo(
    () =>
      stories.map((story) => ({
        id: story.id,
        name: story.name,
        avatar: story.avatar,
        viewed: story.viewed,
        isOwn: story.isOwn,
      })),
    [stories]
  )

  const storyViewerUsers = useMemo(
    () =>
      stories.map((item) => ({
        id: item.id,
        name: item.name,
        avatar: item.avatar,
        stories: item.stories,
      })),
    [stories]
  )

  if (isBooting) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <AuroraBackground />
        <p className="text-[var(--text)]">Загрузка...</p>
      </main>
    )
  }

  if (!currentUser) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <AuroraBackground />
        <LoginForm onLogin={handleLogin} onRegister={handleRegister} onCheckUsername={checkUsername} onQRLogin={handleQrLogin} />
      </main>
    )
  }

  const hasActiveConversation =
    (activeTab === "chats" && activeDirectChat && currentChatUser) ||
    ((activeTab === "groups" || activeTab === "channels") && activeGroupChat && currentGroup)

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      <AuroraBackground />

      <Topbar
        currentUser={{
          name: currentUser.name,
          avatar: currentUser.avatar,
          verified: false,
        }}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab)
          if (tab === "chats" && !activeDirectChat && chats[0]) {
            setActiveDirectChat(chats[0].user.id)
          }
          if ((tab === "groups" || tab === "channels") && !activeGroupChat) {
            const first = tab === "channels" ? channels[0] : groups[0]
            if (first) {
              setActiveGroupChat(first.id)
            }
          }
        }}
        onCreateNew={() => void handleCreateNew()}
        onOpenSettings={() => {
          setSettingsSection("profile")
          setIsSettingsOpen(true)
        }}
      />

      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        <ChatSidebar
          chats={sidebarChats}
          stories={activeTab === "chats" ? storyItems : []}
          showStories={activeTab === "chats"}
          searchResults={searchItems}
          activeChat={activeTab === "chats" ? activeDirectChat : activeGroupChat}
          onChatSelect={handleSidebarSelect}
          onStoryClick={(storyUserId) => {
            setStoryViewerUserId(storyUserId)
            setIsStoryViewerOpen(true)
          }}
          onAddStory={() => void handleAddStory()}
          onSearch={(query) => void handleSearch(query)}
        />

        {hasActiveConversation ? (
          <ChatArea
            mode={activeTab === "chats" ? "direct" : "group"}
            user={
              activeTab === "chats" && currentChatUser
                ? {
                    id: currentChatUser.id,
                    name: currentChatUser.name,
                    avatar: currentChatUser.avatar,
                    online: Boolean(currentChatUser.online),
                    verified: false,
                  }
                : {
                    id: currentGroup?.id || "",
                    name: currentGroup?.name || "",
                    avatar: currentGroup?.avatar || "/placeholder-user.jpg",
                    online: false,
                    verified: activeTab === "channels",
                  }
            }
            messages={currentMessages as Array<Message & GroupMessage>}
            currentUserId={currentUser.id}
            onSendMessage={activeTab === "chats" ? handleSendDirectMessage : handleSendGroupMessage}
            onCall={
              activeTab === "chats"
                ? (type) => {
                    void startCall(type).catch((error: Error) => {
                      alert(error.message || "Не удалось начать звонок")
                    })
                  }
                : undefined
            }
            onOpenSettings={() => {
              setSettingsSection("profile")
              setIsSettingsOpen(true)
            }}
            onOpenProfile={() => {
              openProfileForCurrentDialog()
            }}
            onTyping={activeTab === "chats" ? handleTyping : undefined}
            isTyping={activeTab === "chats" ? typingUserIds.has(activeDirectChat || "") : false}
          />
        ) : (
          <div className="flex-1 glass-card flex items-center justify-center">
            <div className="text-center">
              <MessageSquare size={64} className="text-[var(--text-muted)] mx-auto mb-4" />
              <p className="text-[var(--text-sub)]">
                {activeTab === "chats" && "Выберите чат для начала общения"}
                {activeTab === "groups" && "Создайте или выберите группу"}
                {activeTab === "channels" && "Создайте или выберите канал"}
              </p>
            </div>
          </div>
        )}
      </div>

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        preferredSection={settingsSection}
        user={{
          name: currentUser.name,
          username: currentUser.username,
          avatar: currentUser.avatar,
          bio: currentUser.bio,
          phone: currentUser.phone,
          verified: false,
        }}
        sessions={sessions}
        onUpdateProfile={updateCurrentProfile}
        onChangePassword={updateCurrentPassword}
        onEndSession={handleEndSession}
        onEndAllSessions={handleEndAllSessions}
        onApproveQrLogin={handleApproveQrLogin}
        onCheckUsername={checkUsername}
        onChangeTheme={setCurrentTheme}
        onLogout={logoutCurrentUser}
        currentTheme={currentTheme}
      />

      <StoryViewer
        isOpen={isStoryViewerOpen}
        users={storyViewerUsers}
        initialUserId={storyViewerUserId}
        onClose={() => setIsStoryViewerOpen(false)}
        onViewStory={handleStoryViewed}
      />

      <UserProfileModal isOpen={Boolean(profileUser)} user={profileUser} onClose={() => setProfileUser(null)} />

      {callState && (
        <CallOverlay
          isOpen
          type={callState.type}
          direction={callState.direction}
          status={callState.status}
          user={callState.user}
          localStream={localStream}
          remoteStream={remoteStream}
          remoteVideoActive={remoteVideoActive}
          remoteScreenSharing={remoteScreenSharing}
          onAccept={() =>
            void acceptCall().catch((error: Error) => {
              alert(error.message || "Не удалось принять звонок")
            })
          }
          onDecline={declineCall}
          onEnd={endCall}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onToggleSpeaker={toggleSpeaker}
          onToggleScreenShare={() =>
            void toggleScreenShare().catch((error: Error) => {
              alert(error.message || "Не удалось включить демонстрацию экрана")
            })
          }
          onToggleMinimize={() => setIsCallMinimized((prev) => !prev)}
          isMinimized={isCallMinimized}
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          isScreenSharing={isScreenSharing}
          isSpeakerOn={isSpeakerOn}
        />
      )}
    </main>
  )
}
