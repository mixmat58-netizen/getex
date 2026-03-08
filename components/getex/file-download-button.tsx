"use client"

import { useState, useEffect, useRef } from "react"
import { Check, FileText, X } from "lucide-react"

interface FileDownloadButtonProps {
  fileName: string
  fileSize: string
  fileUrl?: string
  onDownload?: () => void
}

export function FileDownloadButton({ 
  fileName, 
  fileSize, 
  fileUrl = "#",
  onDownload 
}: FileDownloadButtonProps) {
  const [status, setStatus] = useState<"idle" | "downloading" | "complete" | "fading" | "error">("idle")
  const [progress, setProgress] = useState(0)
  const fadeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (status === "downloading") {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval)
            setStatus("complete")
            return 100
          }
          // Simulate variable download speed
          const increment = Math.random() * 15 + 5
          return Math.min(prev + increment, 100)
        })
      }, 150)

      return () => clearInterval(interval)
    }
  }, [status])

  // Auto-fade the checkmark after download completes
  useEffect(() => {
    if (status === "complete") {
      fadeTimeoutRef.current = setTimeout(() => {
        setStatus("fading")
        // After fade animation, reset to idle
        setTimeout(() => {
          setStatus("idle")
          setProgress(0)
        }, 500) // Match the CSS transition duration
      }, 2000) // Show checkmark for 2 seconds
    }

    return () => {
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current)
      }
    }
  }, [status])

  const handleClick = () => {
    if (status === "idle") {
      setStatus("downloading")
      setProgress(0)
      onDownload?.()
    } else if (status === "error") {
      setStatus("idle")
      setProgress(0)
    }
    // Don't allow clicking during download, complete, or fading states
  }

  const getFileExtension = (name: string) => {
    const ext = name.split(".").pop()?.toUpperCase() || "FILE"
    return ext.length > 4 ? ext.slice(0, 4) : ext
  }

  const isClickable = status === "idle" || status === "error"

  return (
    <button
      onClick={handleClick}
      disabled={!isClickable}
      className={`interactive-glow group relative flex items-center gap-2 p-2 rounded-lg bg-[var(--glass)] border border-[var(--glass-border)] transition-all w-full max-w-[240px] overflow-hidden ${
        isClickable ? "hover:border-[var(--accent)]/30 cursor-pointer" : "cursor-default"
      }`}
    >
      {/* Progress background fill */}
      <div 
        className="absolute inset-0 bg-[var(--accent)]/10 origin-left transition-transform duration-150 ease-out"
        style={{ 
          transform: `scaleX(${progress / 100})`,
          opacity: status === "downloading" ? 1 : 0
        }}
      />

      {/* File icon with animated states */}
      <div className={`relative w-9 h-9 rounded-md flex items-center justify-center shrink-0 transition-all duration-300 ${
        status === "complete" || status === "fading"
          ? "bg-[var(--success)]/20" 
          : status === "error"
            ? "bg-[var(--error)]/20"
            : "bg-[var(--accent)]/20"
      }`}>
        {/* Idle state - file icon */}
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${
          status === "idle" ? "opacity-100 scale-100" : "opacity-0 scale-75"
        }`}>
          <FileText size={18} className="text-[var(--accent)]" />
        </div>
        
        {/* Downloading state - circular progress */}
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
          status === "downloading" ? "opacity-100 scale-100" : "opacity-0 scale-75"
        }`}>
          <div className="relative">
            <svg className="w-6 h-6 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="var(--glass-border)"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="3"
                strokeDasharray={`${progress * 0.88} 88`}
                strokeLinecap="round"
                className="transition-all duration-150 ease-out"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-[var(--accent)]">
              {Math.round(progress)}
            </span>
          </div>
        </div>

        {/* Complete/fading state - checkmark with fade animation */}
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${
          status === "complete" ? "opacity-100 scale-100" : status === "fading" ? "opacity-0 scale-110" : "opacity-0 scale-75"
        }`}>
          <Check size={18} className="text-[var(--success)]" />
        </div>

        {/* Error state */}
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
          status === "error" ? "opacity-100 scale-100" : "opacity-0 scale-75"
        }`}>
          <X size={18} className="text-[var(--error)]" />
        </div>
      </div>

      {/* File info */}
      <div className="relative flex-1 min-w-0 text-left">
        <p className="text-xs font-medium text-[var(--text)] truncate">
          {fileName}
        </p>
        <p className={`text-[10px] transition-all duration-300 ${
          status === "complete" || status === "fading" ? "text-[var(--success)]" : "text-[var(--text-sub)]"
        }`}>
          {status === "downloading" 
            ? `${Math.round(progress)}%`
            : status === "complete" || status === "fading"
              ? "Загружено"
              : status === "error"
                ? "Ошибка"
                : fileSize
          }
        </p>
      </div>

      {/* File extension badge */}
      <div className="px-1 py-0.5 rounded text-[8px] font-bold bg-[var(--accent)]/20 text-[var(--accent)] shrink-0">
        {getFileExtension(fileName)}
      </div>

      {/* Click hint for idle state */}
      {status === "idle" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg)]/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg">
          <span className="text-[10px] font-medium text-[var(--text)]">Скачать</span>
        </div>
      )}
    </button>
  )
}
