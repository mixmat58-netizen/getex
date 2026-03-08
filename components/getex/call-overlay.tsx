"use client"

import { useEffect, useRef, useState } from "react"
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Volume2, X, Minimize2, Maximize2, ScreenShare } from "lucide-react"
import Image from "next/image"

interface CallOverlayProps {
  isOpen: boolean
  type: "audio" | "video"
  direction: "incoming" | "outgoing"
  status: "ringing" | "connecting" | "connected" | "ended"
  user: {
    name: string
    avatar: string
  }
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  remoteVideoActive: boolean
  remoteScreenSharing: boolean
  onAccept: () => void
  onDecline: () => void
  onEnd: () => void
  onToggleMute: () => void
  onToggleVideo: () => void
  onToggleSpeaker: () => void
  onToggleScreenShare: () => void
  onToggleMinimize: () => void
  isMinimized: boolean
  isMuted: boolean
  isVideoOff: boolean
  isScreenSharing: boolean
  isSpeakerOn: boolean
}

export function CallOverlay({
  isOpen,
  type,
  direction,
  status,
  user,
  localStream,
  remoteStream,
  remoteVideoActive,
  remoteScreenSharing,
  onAccept,
  onDecline,
  onEnd,
  onToggleMute,
  onToggleVideo,
  onToggleSpeaker,
  onToggleScreenShare,
  onToggleMinimize,
  isMinimized,
  isMuted,
  isVideoOff,
  isScreenSharing,
  isSpeakerOn,
}: CallOverlayProps) {
  const [duration, setDuration] = useState(0)
  const [localVideoPosition, setLocalVideoPosition] = useState({ x: 20, y: 20 })
  const [isDragging, setIsDragging] = useState(false)
  const [miniPosition, setMiniPosition] = useState({ x: 24, y: 24 })
  const [isMiniDragging, setIsMiniDragging] = useState(false)

  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!isOpen) {
      setDuration(0)
      return
    }

    if (status !== "connected") return

    const interval = setInterval(() => {
      setDuration((prev) => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [isOpen, status])

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream
      remoteVideoRef.current.muted = true
      const playPromise = remoteVideoRef.current.play()
      if (playPromise) {
        void playPromise.catch(() => undefined)
      }
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream
      remoteAudioRef.current.autoplay = true
      remoteAudioRef.current.muted = !isSpeakerOn
      const playPromise = remoteAudioRef.current.play()
      if (playPromise) {
        void playPromise.catch(() => undefined)
      }
    }
  }, [remoteStream, isSpeakerOn])

  useEffect(() => {
    if (!remoteAudioRef.current) return
    remoteAudioRef.current.muted = !isSpeakerOn
  }, [isSpeakerOn])

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream
      const playPromise = localVideoRef.current.play()
      if (playPromise) {
        void playPromise.catch(() => undefined)
      }
    }
  }, [localStream])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const remoteVideoTrack = remoteStream?.getVideoTracks().find((track) => track.readyState === "live") || null
  const localVideoTrack = localStream?.getVideoTracks().find((track) => track.readyState === "live") || null
  const hasRemoteVideo = Boolean(remoteVideoTrack && remoteVideoActive)
  const hasLocalVideo = Boolean(localVideoTrack)
  const remoteDisplaySurface = remoteVideoTrack
    ? (remoteVideoTrack.getSettings() as MediaTrackSettings & { displaySurface?: string }).displaySurface
    : undefined
  const localDisplaySurface = localVideoTrack
    ? (localVideoTrack.getSettings() as MediaTrackSettings & { displaySurface?: string }).displaySurface
    : undefined
  const remoteIsScreenShare = Boolean(
    remoteScreenSharing || remoteDisplaySurface || (remoteVideoTrack && /screen|window|display/i.test(remoteVideoTrack.label))
  )
  const localIsScreenShare = Boolean(
    isScreenSharing || localDisplaySurface || (localVideoTrack && /screen|window|display/i.test(localVideoTrack.label))
  )
  const showRemoteStage = status === "connected" && hasRemoteVideo
  const showLocalPreview = status === "connected" && hasLocalVideo
  const showInfoStage = status !== "connected" || !showRemoteStage

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDrag = (e: React.MouseEvent) => {
    if (!isDragging) return
    const width = window.innerWidth
    const height = window.innerHeight
    const previewWidth = localIsScreenShare ? Math.min(width * 0.42, 540) : 260
    const previewHeight = localIsScreenShare ? Math.min(height * 0.34, 260) : 340
    const nextX = Math.min(Math.max(8, e.clientX - previewWidth / 2), width - previewWidth - 8)
    const nextY = Math.min(Math.max(8, e.clientY - previewHeight / 2), height - previewHeight - 8)
    setLocalVideoPosition({ x: nextX, y: nextY })
  }

  const handleDragEnd = () => {
    setIsDragging(false)
  }

  const handleMiniDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsMiniDragging(true)
  }

  const handleMiniDrag = (e: React.MouseEvent) => {
    if (!isMiniDragging) return
    const nextX = Math.min(Math.max(8, e.clientX - 130), window.innerWidth - 288)
    const nextY = Math.min(Math.max(8, e.clientY - 24), window.innerHeight - 140)
    setMiniPosition({ x: nextX, y: nextY })
  }

  const handleMiniDragEnd = () => {
    setIsMiniDragging(false)
  }

  if (!isOpen) return null

  if (direction === "incoming" && status === "ringing") {
    return (
      <div className="fixed top-4 right-4 z-50 w-80 glass-card p-4 animate-in slide-in-from-top-4">
        <audio ref={remoteAudioRef} playsInline />
        <div className="flex items-center gap-4 mb-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-full overflow-hidden">
              <Image src={user.avatar} alt={user.name} width={56} height={56} className="w-full h-full object-cover" />
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-[var(--success)] pulse-ring" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--text)]">{user.name}</p>
            <p className="text-xs text-[var(--text-sub)]">Входящий {type === "video" ? "видеозвонок" : "звонок"}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onDecline}
            className="flex-1 py-3 rounded-xl bg-[var(--error)] text-white font-medium hover:bg-[var(--error)]/80 transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
          >
            <PhoneOff size={18} />
            Отклонить
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-3 rounded-xl bg-[var(--success)] text-white font-medium hover:bg-[var(--success)]/80 transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
          >
            <Phone size={18} />
            Ответить
          </button>
        </div>
      </div>
    )
  }

  if (isMinimized) {
    return (
      <div
        className="fixed z-50 w-72 glass-card p-3 border border-[var(--glass-border)]"
        style={{ left: miniPosition.x, top: miniPosition.y }}
        onMouseMove={handleMiniDrag}
        onMouseUp={handleMiniDragEnd}
        onMouseLeave={handleMiniDragEnd}
      >
        <audio ref={remoteAudioRef} playsInline />
        <div className="flex items-center gap-3 cursor-move" onMouseDown={handleMiniDragStart}>
          <div className="w-11 h-11 rounded-full overflow-hidden shrink-0">
            <Image src={user.avatar} alt={user.name} width={44} height={44} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--text)] truncate">{user.name}</p>
            <p className="text-xs text-[var(--text-sub)]">
              {status === "connected" ? formatDuration(duration) : status === "connecting" ? "Подключение..." : "Звонок"}
            </p>
          </div>
          <button onClick={onToggleMinimize} className="p-2 rounded-lg hover:bg-[var(--glass)] transition-colors" title="Развернуть">
            <Maximize2 size={16} className="text-[var(--text-sub)]" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onToggleMute}
            className={`flex-1 py-2 rounded-lg transition-colors ${isMuted ? "bg-[var(--error)]/20 text-[var(--error)]" : "bg-[var(--glass)] text-[var(--text)] hover:bg-[var(--glass-border)]"}`}
          >
            {isMuted ? <MicOff size={18} className="mx-auto" /> : <Mic size={18} className="mx-auto" />}
          </button>
          <button
            onClick={onToggleSpeaker}
            className={`flex-1 py-2 rounded-lg transition-colors ${isSpeakerOn ? "bg-[var(--accent)] text-[var(--bg)]" : "bg-[var(--glass)] text-[var(--text)] hover:bg-[var(--glass-border)]"}`}
          >
            <Volume2 size={18} className="mx-auto" />
          </button>
          <button
            onClick={onToggleScreenShare}
            className={`flex-1 py-2 rounded-lg transition-colors ${isScreenSharing ? "bg-[var(--accent)] text-[var(--bg)]" : "bg-[var(--glass)] text-[var(--text)] hover:bg-[var(--glass-border)]"}`}
          >
            <ScreenShare size={18} className="mx-auto" />
          </button>
          <button onClick={onEnd} className="flex-1 py-2 rounded-lg bg-[var(--error)] text-white hover:bg-[var(--error)]/80 transition-colors">
            <PhoneOff size={18} className="mx-auto" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg)]" onMouseMove={handleDrag} onMouseUp={handleDragEnd}>
      <audio ref={remoteAudioRef} playsInline />

      <button
        onClick={onToggleMinimize}
        className="absolute top-4 right-4 z-20 p-2.5 rounded-lg bg-[var(--glass)] hover:bg-[var(--glass-border)] transition-all hover:scale-105"
        title="Свернуть"
      >
        <Minimize2 size={20} className="text-[var(--text)]" />
      </button>

      {showRemoteStage && (
        <div className="absolute inset-0 bg-black">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full ${remoteIsScreenShare ? "object-contain" : "object-cover"}`}
          />
        </div>
      )}

      {showInfoStage && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="aurora-bg" />
          <div className="relative mb-8">
            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-[var(--glass-border)]">
              <Image src={user.avatar} alt={user.name} width={128} height={128} className="w-full h-full object-cover" />
            </div>
            {status === "ringing" && <div className="absolute inset-0 rounded-full border-2 border-[var(--accent)] pulse-ring" />}
          </div>

          <h2 className="text-2xl font-semibold text-[var(--text)] mb-2">{user.name}</h2>
          <p className="text-[var(--text-sub)] mb-8">
            {status === "ringing" && direction === "outgoing" && "Вызываем..."}
            {status === "connecting" && "Подключение..."}
            {status === "connected" && formatDuration(duration)}
            {status === "ended" && "Звонок завершен"}
          </p>
        </div>
      )}

      {showLocalPreview && (
        <div
          className={`absolute overflow-hidden shadow-2xl cursor-move z-10 bg-black border border-white/20 rounded-2xl ${
            localIsScreenShare ? "w-[min(42vw,32rem)] h-[min(34vh,18rem)]" : "w-52 h-72 sm:w-60 sm:h-80"
          }`}
          style={{ left: localVideoPosition.x, top: localVideoPosition.y }}
          onMouseDown={handleDragStart}
        >
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={`w-full h-full ${localIsScreenShare ? "object-contain" : "object-cover"}`}
          />
        </div>
      )}

      {status !== "ended" && (
        <div className="absolute bottom-0 left-0 right-0 p-8">
          <div className="flex items-center justify-center gap-4">
            {status === "connected" && (
              <>
                <button
                  onClick={onToggleMute}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 ${
                    isMuted ? "bg-[var(--error)] text-white" : "bg-[var(--glass)] text-[var(--text)] hover:bg-[var(--glass-border)]"
                  }`}
                >
                  {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                </button>

                <button
                  onClick={onToggleVideo}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 ${
                    isVideoOff ? "bg-[var(--error)] text-white" : "bg-[var(--glass)] text-[var(--text)] hover:bg-[var(--glass-border)]"
                  }`}
                >
                  {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                </button>

                <button
                  onClick={onEnd}
                  className="w-16 h-16 rounded-full bg-[var(--error)] text-white flex items-center justify-center hover:bg-[var(--error)]/80 transition-all hover:scale-105"
                >
                  <PhoneOff size={28} />
                </button>

                <button
                  onClick={onToggleSpeaker}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 ${
                    isSpeakerOn ? "bg-[var(--accent)] text-[var(--bg)]" : "bg-[var(--glass)] text-[var(--text)] hover:bg-[var(--glass-border)]"
                  }`}
                >
                  <Volume2 size={24} />
                </button>

                <button
                  onClick={onToggleScreenShare}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 ${
                    isScreenSharing ? "bg-[var(--accent)] text-[var(--bg)]" : "bg-[var(--glass)] text-[var(--text)] hover:bg-[var(--glass-border)]"
                  }`}
                >
                  <ScreenShare size={24} />
                </button>
              </>
            )}

            {status === "ringing" && direction === "outgoing" && (
              <button
                onClick={onEnd}
                className="w-16 h-16 rounded-full bg-[var(--error)] text-white flex items-center justify-center hover:bg-[var(--error)]/80 transition-colors"
              >
                <PhoneOff size={28} />
              </button>
            )}
          </div>
        </div>
      )}

      {status === "ended" && (
        <button onClick={onEnd} className="absolute top-4 right-4 p-2 rounded-lg bg-[var(--glass)] hover:bg-[var(--glass-border)] transition-colors">
          <X size={24} className="text-[var(--text)]" />
        </button>
      )}
    </div>
  )
}