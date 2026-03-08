"use client"

import { useState, useEffect } from "react"
import { X, Phone, Video, Users, BookOpen, Mic, Shield, Bot, Palette, Smile, FileUp, Award, QrCode, ArrowRight } from "lucide-react"

const features = [
  { icon: Phone, text: "Звонки" },
  { icon: Video, text: "Видеозвонки" },
  { icon: Users, text: "Каналы" },
  { icon: BookOpen, text: "Истории" },
  { icon: Mic, text: "Голосовые сообщения" },
  { icon: Shield, text: "E2E шифрование" },
  { icon: Bot, text: "AI-бот" },
  { icon: Palette, text: "Темы" },
  { icon: Smile, text: "Стикеры и GIF" },
  { icon: FileUp, text: "Файлы до 50 ГБ" },
  { icon: Award, text: "Ранги и роли" },
  { icon: QrCode, text: "QR-вход" },
]

export function AnnouncementBanner() {
  const [isVisible, setIsVisible] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    const hasSeenBanner = localStorage.getItem("getex-banner-seen")
    if (!hasSeenBanner) {
      setIsVisible(true)
    }
  }, [])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      setIsVisible(false)
      localStorage.setItem("getex-banner-seen", "true")
    }, 400)
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div 
        className={`relative w-full max-w-lg glass-card p-6 ${isClosing ? "banner-out" : "banner-in"}`}
      >
        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 text-[var(--text-sub)] hover:text-[var(--text)] transition-colors"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-2xl font-medium text-[var(--text-sub)] line-through">okmess</span>
            <ArrowRight className="text-[var(--accent)]" size={24} />
            <span 
              className="text-3xl font-bold"
              style={{ fontFamily: "var(--font-fraunces), serif", color: "var(--accent)" }}
            >
              getex
            </span>
          </div>
          <p className="text-[var(--text-sub)] text-sm">
            Мы стали лучше! Встречайте Getex v2
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="flex items-center gap-2 p-2 rounded-lg bg-[var(--glass)] border border-[var(--glass-border)]"
              style={{ 
                animationDelay: `${index * 50}ms`,
                animation: "message-appear 0.3s ease-out forwards",
                opacity: 0
              }}
            >
              <feature.icon size={16} className="text-[var(--accent)] shrink-0" />
              <span className="text-xs text-[var(--text)]">{feature.text}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handleClose}
          className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--bg)] font-medium hover:bg-[var(--accent-hover)] transition-colors"
        >
          Понятно
        </button>
      </div>
    </div>
  )
}
