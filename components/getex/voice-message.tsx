"use client"

import { useState, useEffect, useRef } from "react"
import { Mic, Send, X, Play, Pause, Trash2 } from "lucide-react"

interface VoiceRecorderProps {
  onSend: (duration: number) => void
  onCancel: () => void
}

export function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(true)
  const [recordingTime, setRecordingTime] = useState(0)
  const [waveform, setWaveform] = useState<number[]>(Array(50).fill(0.2))
  const animationRef = useRef<number | null>(null)

  // Simulate waveform animation
  useEffect(() => {
    if (isRecording) {
      const animate = () => {
        setWaveform(prev => 
          prev.map(() => Math.random() * 0.8 + 0.2)
        )
        animationRef.current = requestAnimationFrame(animate)
      }
      
      // Slower animation frame rate for smooth effect
      const interval = setInterval(() => {
        animationRef.current = requestAnimationFrame(animate)
      }, 100)

      return () => {
        clearInterval(interval)
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
        }
      }
    }
  }, [isRecording])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const handleSend = () => {
    setIsRecording(false)
    onSend(recordingTime)
  }

  return (
    <div className="flex items-center gap-4 p-2 animate-in slide-in-from-bottom-2 duration-200">
      {/* Cancel button */}
      <button 
        onClick={onCancel}
        className="interactive-glow p-2.5 rounded-full bg-[var(--error)]/10 hover:bg-[var(--error)]/20 transition-colors"
      >
        <X size={20} className="text-[var(--error)]" />
      </button>

      {/* Recording indicator */}
      <div className="flex items-center gap-3 flex-1">
        <div className="relative">
          <div className="w-3 h-3 rounded-full bg-[var(--error)] animate-pulse" />
          <div className="absolute inset-0 w-3 h-3 rounded-full bg-[var(--error)] animate-ping opacity-75" />
        </div>
        
        <span className="text-sm font-medium text-[var(--text)] tabular-nums min-w-[45px]">
          {formatTime(recordingTime)}
        </span>

        {/* Animated waveform */}
        <div className="flex-1 h-10 flex items-center justify-center gap-[2px] overflow-hidden">
          {waveform.map((height, i) => (
            <div 
              key={i}
              className="w-[3px] rounded-full bg-[var(--accent)] transition-all duration-100 ease-out"
              style={{ 
                height: `${height * 100}%`,
                opacity: 0.4 + height * 0.6
              }}
            />
          ))}
        </div>
      </div>

      {/* Send button */}
      <button 
        onClick={handleSend}
        className="interactive-glow p-3 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] hover:scale-105 transition-all"
      >
        <Send size={20} className="text-[var(--bg)]" />
      </button>
    </div>
  )
}

interface VoicePlayerProps {
  duration: number
  isOwn?: boolean
}

export function VoicePlayer({ duration, isOwn = false }: VoicePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [waveform] = useState(() => 
    Array(40).fill(0).map(() => Math.random() * 0.8 + 0.2)
  )
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false)
            return 0
          }
          return prev + 0.1
        })
      }, 100)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isPlaying, duration])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const playedBars = Math.floor((progress / 100) * waveform.length)

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const togglePlayback = () => {
    if (currentTime >= duration) {
      setCurrentTime(0)
    }
    setIsPlaying(!isPlaying)
  }

  return (
    <div className="flex items-center gap-3 min-w-[220px]">
      {/* Play/Pause button */}
      <button 
        onClick={togglePlayback}
        className="interactive-glow w-11 h-11 rounded-full bg-[var(--accent)] flex items-center justify-center shrink-0 hover:scale-105 transition-transform"
      >
        {isPlaying ? (
          <Pause size={20} className="text-[var(--bg)]" />
        ) : (
          <Play size={20} className="text-[var(--bg)] ml-0.5" />
        )}
      </button>

      {/* Waveform visualization */}
      <div className="flex-1">
        <div className="h-8 flex items-center gap-[2px]">
          {waveform.map((height, i) => {
            const isPlayed = i < playedBars
            return (
              <div 
                key={i}
                className={`w-[3px] rounded-full transition-all duration-150 ${
                  isPlayed 
                    ? "bg-[var(--accent)]" 
                    : isOwn 
                      ? "bg-[var(--text)]/30" 
                      : "bg-[var(--text)]/20"
                }`}
                style={{ 
                  height: `${height * 100}%`,
                  transform: isPlaying && i === playedBars ? "scaleY(1.2)" : "scaleY(1)"
                }}
              />
            )
          })}
        </div>
        
        {/* Time display */}
        <div className="flex justify-between mt-0.5">
          <span className="text-[11px] text-[var(--text-sub)] tabular-nums">
            {formatTime(currentTime)}
          </span>
          <span className="text-[11px] text-[var(--text-sub)] tabular-nums">
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  )
}

// Full voice message recorder panel for input area
interface VoiceRecorderPanelProps {
  onSend: (duration: number) => void
  onCancel: () => void
}

export function VoiceRecorderPanel({ onSend, onCancel }: VoiceRecorderPanelProps) {
  const [recordingTime, setRecordingTime] = useState(0)
  const [amplitude, setAmplitude] = useState<number[]>([])
  const maxAmplitudes = 60

  useEffect(() => {
    const timeInterval = setInterval(() => {
      setRecordingTime((prev) => prev + 1)
    }, 1000)

    const amplitudeInterval = setInterval(() => {
      setAmplitude((prev) => {
        const newAmplitude = Math.random() * 0.8 + 0.2
        const updated = [...prev, newAmplitude]
        if (updated.length > maxAmplitudes) {
          return updated.slice(-maxAmplitudes)
        }
        return updated
      })
    }, 100)

    return () => {
      clearInterval(timeInterval)
      clearInterval(amplitudeInterval)
    }
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="flex items-center gap-3 py-2">
      {/* Delete/Cancel button */}
      <button 
        onClick={onCancel}
        className="interactive-glow p-2 rounded-lg hover:bg-[var(--error)]/10 transition-colors"
      >
        <Trash2 size={20} className="text-[var(--error)]" />
      </button>

      {/* Recording visualization */}
      <div className="flex-1 flex items-center gap-3">
        {/* Pulsing recording dot */}
        <div className="relative shrink-0">
          <div className="w-3 h-3 rounded-full bg-[var(--error)]" />
          <div className="absolute inset-0 w-3 h-3 rounded-full bg-[var(--error)] animate-ping opacity-50" />
        </div>

        {/* Timer */}
        <span className="text-sm font-medium text-[var(--text)] tabular-nums w-12">
          {formatTime(recordingTime)}
        </span>

        {/* Live waveform */}
        <div className="flex-1 h-10 flex items-center gap-[2px] overflow-hidden">
          {Array(maxAmplitudes).fill(0).map((_, i) => {
            const amp = amplitude[i] ?? 0.15
            return (
              <div 
                key={i}
                className="w-1 rounded-full bg-[var(--accent)] transition-all duration-75"
                style={{ 
                  height: `${amp * 100}%`,
                  opacity: amplitude[i] ? 0.4 + amp * 0.6 : 0.2
                }}
              />
            )
          })}
        </div>
      </div>

      {/* Send button */}
      <button 
        onClick={() => onSend(recordingTime)}
        className="interactive-glow p-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] hover:scale-105 transition-all"
      >
        <Send size={20} className="text-[var(--bg)]" />
      </button>
    </div>
  )
}
