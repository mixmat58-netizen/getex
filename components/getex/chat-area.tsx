"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Phone,
  Video,
  MoreVertical,
  Paperclip,
  Smile,
  Mic,
  Send,
  Check,
  CheckCheck,
  X,
} from "lucide-react"
import Image from "next/image"

type MessageType = "text" | "image" | "voice" | "file" | "video"

interface Message {
  id: string
  senderId: string
  text: string
  type: MessageType
  imageUrl?: string
  voiceUrl?: string
  videoUrl?: string
  fileUrl?: string
  fileName?: string
  fileSize?: string
  voiceDuration?: number
  createdAt: string
  sender?: {
    id: string
    name: string
    avatar: string
  } | null
}

interface ChatUser {
  id: string
  name: string
  avatar: string
  online?: boolean
  lastSeen?: string
  verified?: boolean
}

interface ChatAreaProps {
  mode: "direct" | "group"
  user: ChatUser
  messages: Message[]
  currentUserId: string
  onSendMessage: (payload: {
    text: string
    type: MessageType
    imageUrl?: string
    voiceUrl?: string
    videoUrl?: string
    fileUrl?: string
    fileName?: string
    fileSize?: string
    voiceDuration?: number
  }) => Promise<void>
  onCall?: (type: "audio" | "video") => void
  onOpenSettings: () => void
  onOpenProfile: () => void
  onTyping?: (typing: boolean) => void
  isTyping?: boolean
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** idx
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"))
    reader.readAsDataURL(file)
  })
}

export function ChatArea({
  mode,
  user,
  messages,
  currentUserId,
  onSendMessage,
  onCall,
  onOpenSettings,
  onOpenProfile,
  onTyping,
  isTyping = false,
}: ChatAreaProps) {
  const [messageInput, setMessageInput] = useState("")
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [sending, setSending] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const cancelRecordingRef = useRef(false)
  const recordingTimeRef = useRef(0)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop()
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
    }
  }, [])

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages]
  )

  const emojiItems = [
    "😀",
    "😁",
    "😂",
    "🤣",
    "😊",
    "😍",
    "😘",
    "😎",
    "🤔",
    "😢",
    "😭",
    "😡",
    "👍",
    "👏",
    "🙏",
    "🔥",
    "❤️",
    "💜",
    "🎉",
    "😴",
    "🤝",
    "🤗",
    "😮",
    "🤯",
  ]

  const stopTypingSoon = () => {
    if (!onTyping || mode !== "direct") return
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false)
    }, 1200)
  }

  const handleInputChange = (value: string) => {
    setMessageInput(value)
    if (!onTyping || mode !== "direct") return

    if (value.trim()) {
      onTyping(true)
      stopTypingSoon()
    } else {
      onTyping(false)
    }
  }

  const handleSendText = async () => {
    const text = messageInput.trim()
    if (!text || sending) return

    setSending(true)
    try {
      await onSendMessage({ text, type: "text" })
      setMessageInput("")
      onTyping?.(false)
      inputRef.current?.focus()
    } finally {
      setSending(false)
    }
  }

  const handleFileByType = async (file: File, type: MessageType) => {
    const dataUrl = await fileToDataUrl(file)

    if (type === "image") {
      await onSendMessage({
        text: "",
        type,
        imageUrl: dataUrl,
        fileName: file.name,
        fileSize: formatBytes(file.size),
      })
      return
    }

    if (type === "video") {
      await onSendMessage({
        text: "",
        type,
        videoUrl: dataUrl,
        fileName: file.name,
        fileSize: formatBytes(file.size),
      })
      return
    }

    await onSendMessage({
      text: file.name,
      type: "file",
      fileUrl: dataUrl,
      fileName: file.name,
      fileSize: formatBytes(file.size),
    })
  }

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleStartRecording = async () => {
    if (isRecording || sending) return
    if (typeof window === "undefined" || !navigator.mediaDevices || !window.MediaRecorder) {
      alert("Запись голоса не поддерживается в этом браузере")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)

      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      recordingChunksRef.current = []
      cancelRecordingRef.current = false
      recordingTimeRef.current = 0
      setRecordingTime(0)
      setIsRecording(true)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null

        const shouldCancel = cancelRecordingRef.current
        setIsRecording(false)

        if (shouldCancel) {
          recordingChunksRef.current = []
          setRecordingTime(0)
          recordingTimeRef.current = 0
          return
        }

        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" })
        recordingChunksRef.current = []

        const voiceUrl = await fileToDataUrl(new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }))
        const duration = recordingTimeRef.current
        setRecordingTime(0)
        recordingTimeRef.current = 0

        await onSendMessage({
          text: "",
          type: "voice",
          voiceUrl,
          voiceDuration: duration,
          fileName: `voice-${Date.now()}.webm`,
          fileSize: formatBytes(blob.size),
        })
      }

      recorder.start()

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const next = prev + 1
          recordingTimeRef.current = next
          return next
        })
      }, 1000)
    } catch {
      alert("Не удалось получить доступ к микрофону")
      setIsRecording(false)
    }
  }

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return
    mediaRecorderRef.current.stop()
  }

  const handleCancelRecording = () => {
    cancelRecordingRef.current = true
    stopRecording()
  }

  const handleSendRecording = () => {
    cancelRecordingRef.current = false
    stopRecording()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSendText()
    }
  }

  const formatDayLabel = (iso: string) => {
    const date = new Date(iso)
    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" })
  }

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })

  return (
    <div className="flex-1 flex flex-col h-full glass-card overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ""
          if (!file) return
          if (file.type.startsWith("image/")) {
            void handleFileByType(file, "image")
            return
          }
          if (file.type.startsWith("video/")) {
            void handleFileByType(file, "video")
            return
          }
          void handleFileByType(file, "file")
        }}
      />

      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
        <button onClick={onOpenProfile} className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full overflow-hidden">
              <Image src={user.avatar} alt={user.name} width={40} height={40} className="w-full h-full object-cover" />
            </div>
            {mode === "direct" && user.online && <div className="absolute bottom-0 right-0 online-dot" />}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-[var(--text)]">{user.name}</span>
              {user.verified && (
                <span className="verified-badge">
                  <Check size={14} />
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-sub)]">
              {mode === "group" ? "Группа" : user.online ? "онлайн" : user.lastSeen || "был(а) недавно"}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {mode === "direct" && onCall && (
            <>
              <button onClick={() => onCall("audio")} className="p-2 rounded-lg hover:bg-[var(--glass)] transition-colors">
                <Phone size={20} className="text-[var(--text-sub)]" />
              </button>
              <button onClick={() => onCall("video")} className="p-2 rounded-lg hover:bg-[var(--glass)] transition-colors">
                <Video size={20} className="text-[var(--text-sub)]" />
              </button>
            </>
          )}
          <button onClick={onOpenSettings} className="p-2 rounded-lg hover:bg-[var(--glass)] transition-colors">
            <MoreVertical size={20} className="text-[var(--text-sub)]" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4" onClick={() => setShowEmojiPicker(false)}>
        {sortedMessages.map((message, index) => {
          const prev = sortedMessages[index - 1]
          const isOwn = message.senderId === currentUserId
          const showDate = !prev || new Date(prev.createdAt).toDateString() !== new Date(message.createdAt).toDateString()

          return (
            <div key={message.id}>
              {showDate && (
                <div className="flex justify-center my-4">
                  <span className="px-3 py-1 rounded-full bg-[var(--glass)] text-[var(--text-sub)] text-xs">{formatDayLabel(message.createdAt)}</span>
                </div>
              )}

              <div className={`group flex ${isOwn ? "justify-end" : "justify-start"} mb-2 message-animate`}>
                <div className={`relative max-w-[76%] ${isOwn ? "order-1" : ""}`}>
                  <div className={`relative px-4 py-2.5 rounded-2xl ${isOwn ? "bg-[var(--msg-out)] rounded-br-md" : "bg-[var(--msg-in)] rounded-bl-md"}`}>
                    {mode === "group" && !isOwn && (
                      <p className="text-[11px] text-[var(--accent)] mb-1">{message.sender?.name || "Участник"}</p>
                    )}

                    {message.type === "text" && <p className="text-sm text-[var(--text)] whitespace-pre-wrap break-words">{message.text}</p>}

                    {message.type === "image" && message.imageUrl && (
                      <a href={message.imageUrl} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden">
                        <img src={message.imageUrl} alt="image" className="max-w-full h-auto rounded-lg" />
                      </a>
                    )}

                    {message.type === "video" && message.videoUrl && (
                      <video controls preload="metadata" src={message.videoUrl} className="max-w-full rounded-lg" />
                    )}

                    {message.type === "voice" && (
                      <div className="min-w-[220px]">
                        <audio controls src={message.voiceUrl} className="w-full" preload="metadata" />
                      </div>
                    )}

                    {message.type === "file" && (
                      <a
                        href={message.fileUrl}
                        download={message.fileName || "file"}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg bg-[var(--glass)] border border-[var(--glass-border)] p-3 hover:border-[var(--accent)]/40 transition-colors"
                      >
                        <p className="text-sm text-[var(--text)] truncate">{message.fileName || message.text || "Файл"}</p>
                        <p className="text-xs text-[var(--text-sub)]">{message.fileSize || ""}</p>
                      </a>
                    )}

                    <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                      <span className="text-[10px] text-[var(--text-muted)]">{formatTime(message.createdAt)}</span>
                      {isOwn && (
                        <span className="check-delivered">
                          <CheckCheck size={14} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {mode === "direct" && isTyping && (
          <div className="flex justify-start mb-2">
            <div className="px-4 py-3 rounded-2xl bg-[var(--msg-in)] rounded-bl-md">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--text-sub)] typing-dot" />
                <span className="w-2 h-2 rounded-full bg-[var(--text-sub)] typing-dot" />
                <span className="w-2 h-2 rounded-full bg-[var(--text-sub)] typing-dot" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 py-3 border-t border-[var(--glass-border)] relative">
        {isRecording ? (
          <div className="flex items-center gap-3 py-2">
            <button onClick={handleCancelRecording} className="p-2 rounded-lg hover:bg-[var(--error)]/10 transition-colors">
              <X size={20} className="text-[var(--error)]" />
            </button>
            <div className="flex-1 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-[var(--error)] animate-pulse" />
              <span className="text-sm text-[var(--text)] tabular-nums">{Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, "0")}</span>
            </div>
            <button onClick={handleSendRecording} className="p-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors">
              <Send size={20} className="text-[var(--bg)]" />
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <button onClick={openFilePicker} className="interactive-glow p-2 rounded-lg hover:bg-[var(--glass)] transition-colors shrink-0">
              <Paperclip size={20} className="text-[var(--text-sub)]" />
            </button>

            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={messageInput}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Сообщение..."
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] placeholder:text-[var(--text-muted)] text-sm resize-none max-h-32 input-focus"
                rows={1}
              />
            </div>

            <button
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              className="interactive-glow p-2 rounded-lg hover:bg-[var(--glass)] transition-colors shrink-0"
            >
              <Smile size={20} className="text-[var(--text-sub)]" />
            </button>

            {messageInput.trim() ? (
              <button
                onClick={() => void handleSendText()}
                disabled={sending}
                className="interactive-glow btn-glow p-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] hover:scale-105 transition-all shrink-0 disabled:opacity-70"
              >
                <Send size={20} className="text-[var(--bg)]" />
              </button>
            ) : (
              <button
                onClick={() => void handleStartRecording()}
                className="interactive-glow p-3 rounded-xl bg-[var(--glass)] hover:bg-[var(--glass-border)] transition-colors shrink-0"
              >
                <Mic size={20} className="text-[var(--text-sub)]" />
              </button>
            )}
          </div>
        )}

        {showEmojiPicker && (
          <div className="absolute bottom-full mb-2 right-4 p-3 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] backdrop-blur-xl grid grid-cols-8 gap-1">
            {emojiItems.map((emoji, index) => (
              <button
                key={`${emoji}-${index}`}
                onClick={() => {
                  setMessageInput((prev) => prev + emoji)
                  setShowEmojiPicker(false)
                }}
                className="w-8 h-8 flex items-center justify-center hover:bg-[var(--glass-border)] rounded transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
