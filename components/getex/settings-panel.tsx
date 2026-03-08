"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  X,
  Camera,
  Palette,
  Monitor,
  Smartphone,
  Tablet,
  Laptop,
  Globe,
  LogOut,
  Check,
  Loader2,
  QrCode,
  ScanLine,
} from "lucide-react"
import Image from "next/image"
import QRCode from "qrcode"

interface Session {
  id: string
  device: "desktop" | "mobile" | "tablet"
  browser: string
  os: string
  ip: string
  country: string
  lastActive: string
  isCurrent: boolean
}

interface Theme {
  id: string
  name: string
  preview: string
  animated?: boolean
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  user: {
    name: string
    username: string
    avatar: string
    bio: string
    phone: string
    verified?: boolean
  }
  sessions: Session[]
  onUpdateProfile: (data: { name?: string; username?: string; bio?: string; avatar?: string }) => Promise<void>
  onChangePassword: (data: { currentPassword: string; newPassword: string }) => Promise<void>
  onEndSession: (sessionId: string) => Promise<void>
  onEndAllSessions: () => Promise<void>
  onApproveQrLogin: (code: string) => Promise<void>
  onChangeTheme: (themeId: string) => void
  onLogout: () => Promise<void>
  onCheckUsername: (username: string) => Promise<boolean>
  currentTheme: string
  preferredSection?: "profile" | "devices" | "themes" | "qr"
}

const themes: Theme[] = [
  { id: "aurora", name: "Aurora", preview: "linear-gradient(135deg, #5B21B6, #0891B2, #BE185D)" },
  { id: "midnight", name: "Midnight", preview: "linear-gradient(135deg, #000000, #1a1a1a)" },
  { id: "sakura", name: "Sakura", preview: "linear-gradient(135deg, #fff0f3, #f9a8d4)" },
  { id: "neon", name: "Neon City", preview: "linear-gradient(135deg, #050510, #00ff88, #0088ff)", animated: true },
  { id: "forest", name: "Forest", preview: "linear-gradient(135deg, #0a1a0f, #166534, #4ade80)" },
  { id: "spotlight", name: "Spotlight", preview: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2), #0a0a0a)", animated: true },
  { id: "amethyst", name: "Amethyst", preview: "radial-gradient(circle at 70% 40%, rgba(192,132,252,0.3), #08060d)", animated: true },
  { id: "ocean", name: "Ocean Depth", preview: "radial-gradient(circle at 40% 60%, rgba(34,211,238,0.3), #030712)", animated: true },
  { id: "ember", name: "Ember", preview: "radial-gradient(circle at 60% 40%, rgba(251,146,60,0.3), #0c0a09)", animated: true },
  { id: "rosegold", name: "Rose Gold", preview: "radial-gradient(circle at 50% 50%, rgba(251,113,133,0.3), #0d0709)", animated: true },
  { id: "northern", name: "Northern Lights", preview: "radial-gradient(circle at 30% 70%, rgba(52,211,153,0.2), rgba(167,139,250,0.15), #020617)", animated: true },
  { id: "electric", name: "Electric Blue", preview: "radial-gradient(circle at 50% 30%, rgba(59,130,246,0.3), #020617)", animated: true },
]

const DeviceIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "mobile":
      return <Smartphone size={20} />
    case "tablet":
      return <Tablet size={20} />
    case "desktop":
      return <Laptop size={20} />
    default:
      return <Monitor size={20} />
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"))
    reader.readAsDataURL(file)
  })
}

export function SettingsPanel({
  isOpen,
  onClose,
  user,
  sessions,
  onUpdateProfile,
  onChangePassword,
  onEndSession,
  onEndAllSessions,
  onApproveQrLogin,
  onChangeTheme,
  onLogout,
  onCheckUsername,
  currentTheme,
  preferredSection = "profile",
}: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<"profile" | "devices" | "themes" | "qr">("profile")
  const [editName, setEditName] = useState(user.name)
  const [editUsername, setEditUsername] = useState(user.username)
  const [editBio, setEditBio] = useState(user.bio)
  const [editAvatar, setEditAvatar] = useState(user.avatar)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle")
  const [isSaving, setIsSaving] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [qrCodeToApprove, setQrCodeToApprove] = useState("")
  const [isApprovingQr, setIsApprovingQr] = useState(false)
  const [profileQrDataUrl, setProfileQrDataUrl] = useState("")
  const [scannerSupported, setScannerSupported] = useState(false)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [isScannerBusy, setIsScannerBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const scannerVideoRef = useRef<HTMLVideoElement>(null)
  const scannerStreamRef = useRef<MediaStream | null>(null)
  const scannerIntervalRef = useRef<number | null>(null)

  useEffect(() => {
    setEditName(user.name)
    setEditUsername(user.username)
    setEditBio(user.bio)
    setEditAvatar(user.avatar)
  }, [user])

  useEffect(() => {
    if (isOpen) {
      setActiveSection(preferredSection)
    }
  }, [isOpen, preferredSection])

  useEffect(() => {
    const value = editUsername.toLowerCase().trim().replace(/[^a-z0-9_]/g, "")
    if (!value || value === user.username || value.length < 3) {
      setUsernameStatus("idle")
      return
    }

    let cancelled = false
    setUsernameStatus("checking")

    const timer = setTimeout(async () => {
      try {
        const available = await onCheckUsername(value)
        if (cancelled) return
        setUsernameStatus(available ? "available" : "taken")
      } catch {
        if (cancelled) return
        setUsernameStatus("idle")
      }
    }, 350)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [editUsername, user.username, onCheckUsername])

  useEffect(() => {
    if (typeof window === "undefined") return
    setScannerSupported("BarcodeDetector" in window)
  }, [])

  useEffect(() => {
    let disposed = false
    void (async () => {
      try {
        const payload = `getex://user/${user.username}`
        const image = await QRCode.toDataURL(payload, {
          margin: 1,
          width: 240,
          errorCorrectionLevel: "M",
        })
        if (!disposed) {
          setProfileQrDataUrl(image)
        }
      } catch {
        if (!disposed) {
          setProfileQrDataUrl("")
        }
      }
    })()

    return () => {
      disposed = true
    }
  }, [user.username])

  const stopQrScanner = useCallback(() => {
    if (scannerIntervalRef.current !== null) {
      window.clearInterval(scannerIntervalRef.current)
      scannerIntervalRef.current = null
    }
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop())
      scannerStreamRef.current = null
    }
    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = null
    }
    setIsScannerBusy(false)
    setIsScannerOpen(false)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      stopQrScanner()
    }
  }, [isOpen, stopQrScanner])

  useEffect(() => {
    if (activeSection !== "qr") {
      stopQrScanner()
    }
  }, [activeSection, stopQrScanner])

  if (!isOpen) return null

  const handleSaveProfile = async () => {
    setError("")
    setStatus("")

    if (!editName.trim()) {
      setError("Имя не может быть пустым")
      return
    }

    if (usernameStatus === "taken") {
      setError("Этот username уже занят")
      return
    }

    setIsSaving(true)
    try {
      await onUpdateProfile({
        name: editName.trim(),
        username: editUsername.toLowerCase().trim(),
        bio: editBio,
        avatar: editAvatar.trim(),
      })
      setStatus("Профиль сохранен")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setIsSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    setError("")
    setStatus("")

    if (!currentPassword || !newPassword) {
      setError("Заполните текущий и новый пароль")
      return
    }

    if (newPassword.length < 8) {
      setError("Новый пароль должен быть не менее 8 символов")
      return
    }

    setIsChangingPassword(true)
    try {
      await onChangePassword({ currentPassword, newPassword })
      setCurrentPassword("")
      setNewPassword("")
      setStatus("Пароль обновлен")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка смены пароля")
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleLogout = async () => {
    setError("")
    try {
      await onLogout()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выйти")
    }
  }

  const handleEndSession = async (sessionId: string) => {
    try {
      await onEndSession(sessionId)
      setStatus("Сеанс завершен")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка завершения сеанса")
    }
  }

  const handleEndAllSessions = async () => {
    try {
      await onEndAllSessions()
      setStatus("Все другие сеансы завершены")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка завершения сеансов")
    }
  }

  const handleApproveQrCode = async (providedCode?: string) => {
    setError("")
    setStatus("")

    const code = (providedCode ?? qrCodeToApprove).trim()
    if (!code) {
      setError("Введите QR код для подтверждения входа")
      return
    }

    setIsApprovingQr(true)
    try {
      await onApproveQrLogin(code)
      setQrCodeToApprove("")
      setStatus("QR вход подтвержден")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось подтвердить QR")
    } finally {
      setIsApprovingQr(false)
    }
  }

  const startQrScanner = async () => {
    if (!scannerSupported) {
      setError("Сканер QR не поддерживается в этом браузере")
      return
    }
    if (typeof window === "undefined") return

    setError("")
    setStatus("")
    setIsScannerOpen(true)
    setIsScannerBusy(true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })

      scannerStreamRef.current = stream

      if (!scannerVideoRef.current) {
        throw new Error("Не удалось открыть видео для сканирования")
      }

      scannerVideoRef.current.srcObject = stream
      scannerVideoRef.current.muted = true
      await scannerVideoRef.current.play()

      const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
      if (!Detector) {
        throw new Error("Сканер QR не поддерживается в этом браузере")
      }
      const detector = new Detector({ formats: ["qr_code"] })

      scannerIntervalRef.current = window.setInterval(() => {
        void (async () => {
          if (!scannerVideoRef.current) return
          try {
            const codes = await detector.detect(scannerVideoRef.current)
            const raw = String(codes[0]?.rawValue || "").trim()
            if (!raw) return
            stopQrScanner()
            setQrCodeToApprove(raw)
            await handleApproveQrCode(raw)
          } catch {
            // keep polling
          }
        })()
      }, 350)
    } catch (err) {
      stopQrScanner()
      setError(err instanceof Error ? err.message : "Не удалось запустить сканер")
    } finally {
      setIsScannerBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-md h-full glass-card rounded-l-3xl slide-in-right overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[var(--glass-border)]">
          <h2 className="text-lg font-semibold text-[var(--text)]">Настройки</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--glass)] transition-colors">
            <X size={20} className="text-[var(--text-sub)]" />
          </button>
        </div>

        <div className="flex border-b border-[var(--glass-border)]">
          {[
            { id: "profile", label: "Профиль" },
            { id: "devices", label: "Устройства" },
            { id: "themes", label: "Темы" },
            { id: "qr", label: "QR" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as typeof activeSection)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeSection === tab.id
                  ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
                  : "text-[var(--text-sub)] hover:text-[var(--text)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="h-[calc(100%-130px)] overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-[var(--error)]/15 border border-[var(--error)]/25 text-[var(--error)] text-sm">
              {error}
            </div>
          )}

          {status && (
            <div className="mb-4 p-3 rounded-lg bg-[var(--success)]/15 border border-[var(--success)]/25 text-[var(--success)] text-sm">
              {status}
            </div>
          )}

          {activeSection === "profile" && (
            <div className="space-y-6">
              <div className="flex flex-col items-center">
                <div className="relative">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.currentTarget.value = ""
                      if (!file) return
                      void fileToDataUrl(file)
                        .then((dataUrl) => setEditAvatar(dataUrl))
                        .catch(() => setError("Не удалось загрузить изображение"))
                    }}
                  />
                  <div className="w-24 h-24 rounded-full overflow-hidden">
                    <Image src={editAvatar || "/placeholder-user.jpg"} alt={editName} width={96} height={96} className="w-full h-full object-cover" />
                  </div>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 p-2 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors"
                  >
                    <Camera size={16} className="text-[var(--bg)]" />
                  </button>
                </div>
                {user.verified && (
                  <div className="flex items-center gap-1 mt-2 text-sm text-[var(--accent)]">
                    <Check size={16} />
                    Верифицирован
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[var(--text-sub)] mb-2">Имя</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] input-focus"
                  />
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-sub)] mb-2">Username</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">@</span>
                    <input
                      type="text"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                      className="w-full pl-8 pr-12 py-3 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] input-focus"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      {usernameStatus === "checking" && <Loader2 size={18} className="animate-spin text-[var(--text-sub)]" />}
                      {usernameStatus === "available" && <Check size={18} className="text-[var(--success)]" />}
                      {usernameStatus === "taken" && <X size={18} className="text-[var(--error)]" />}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-sub)] mb-2">Bio</label>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] resize-none input-focus"
                    placeholder="Расскажите о себе..."
                  />
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-sub)] mb-2">Аватар</label>
                  <input
                    type="text"
                    value={editAvatar ? "Файл загружен" : ""}
                    readOnly
                    className="w-full px-4 py-3 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] input-focus"
                    placeholder="Нажмите на иконку камеры для загрузки"
                  />
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-sub)] mb-2">Телефон</label>
                  <input
                    type="text"
                    value={user.phone}
                    disabled
                    className="w-full px-4 py-3 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text-sub)] cursor-not-allowed"
                  />
                </div>

                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--bg)] font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Сохранение...
                    </>
                  ) : (
                    "Сохранить профиль"
                  )}
                </button>

                <div className="pt-2 border-t border-[var(--glass-border)] space-y-3">
                  <label className="block text-sm text-[var(--text-sub)]">Смена пароля</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Текущий пароль"
                    className="w-full px-4 py-3 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] input-focus"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Новый пароль"
                    className="w-full px-4 py-3 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] input-focus"
                  />
                  <button
                    onClick={handlePasswordChange}
                    disabled={isChangingPassword}
                    className="w-full py-3 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] font-medium hover:bg-[var(--glass-border)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isChangingPassword ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Обновление...
                      </>
                    ) : (
                      "Обновить пароль"
                    )}
                  </button>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="w-full py-3 rounded-xl bg-[var(--error)]/10 text-[var(--error)] font-medium hover:bg-[var(--error)]/20 transition-colors flex items-center justify-center gap-2"
              >
                <LogOut size={18} />
                Выйти из аккаунта
              </button>
            </div>
          )}

          {activeSection === "devices" && (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`p-4 rounded-xl ${
                    session.isCurrent
                      ? "bg-[var(--accent)]/10 border border-[var(--accent)]/30"
                      : "bg-[var(--glass)] border border-[var(--glass-border)]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-[var(--glass)]">
                      <DeviceIcon type={session.device} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[var(--text)]">{session.browser} на {session.os}</p>
                        {session.isCurrent && (
                          <span className="px-2 py-0.5 rounded text-xs bg-[var(--accent)]/20 text-[var(--accent)]">Это устройство</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-sub)]">
                        <span>{session.ip}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Globe size={12} />
                          {session.country}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-1">Активен: {session.lastActive}</p>
                    </div>
                    {!session.isCurrent && (
                      <button onClick={() => void handleEndSession(session.id)} className="text-xs text-[var(--error)] hover:underline">
                        Завершить
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <button
                onClick={() => void handleEndAllSessions()}
                className="w-full py-3 rounded-xl bg-[var(--error)]/10 text-[var(--error)] font-medium hover:bg-[var(--error)]/20 transition-colors"
              >
                Завершить все другие сеансы
              </button>
            </div>
          )}

          {activeSection === "themes" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-[var(--text-sub)] mb-3">Стандартные</h3>
                <div className="grid grid-cols-2 gap-3">
                  {themes.filter((t) => !t.animated || t.id === "neon").slice(0, 5).map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => onChangeTheme(theme.id)}
                      className={`relative p-3 rounded-xl border transition-all ${
                        currentTheme === theme.id
                          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
                          : "border-[var(--glass-border)] hover:border-[var(--accent)]/50"
                      }`}
                    >
                      <div className="h-20 rounded-lg mb-2" style={{ background: theme.preview }} />
                      <p className="text-sm text-[var(--text)] flex items-center justify-center gap-1">{theme.name}</p>
                      {currentTheme === theme.id && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center">
                          <Check size={12} className="text-[var(--bg)]" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-[var(--text-sub)] mb-2">Подсветка курсора</h3>
                <p className="text-xs text-[var(--text-muted)] mb-3">Эффект свечения следует за курсором</p>
                <div className="grid grid-cols-2 gap-3">
                  {themes
                    .filter((t) => ["spotlight", "amethyst", "ocean", "ember", "rosegold", "northern", "electric"].includes(t.id))
                    .map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => onChangeTheme(theme.id)}
                        className={`relative p-3 rounded-xl border transition-all ${
                          currentTheme === theme.id
                            ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
                            : "border-[var(--glass-border)] hover:border-[var(--accent)]/50"
                        }`}
                      >
                        <div className="h-20 rounded-lg mb-2 relative overflow-hidden" style={{ background: theme.preview }}>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-3 h-3 rounded-full bg-white/30 blur-[2px]" />
                          </div>
                        </div>
                        <p className="text-sm text-[var(--text)] flex items-center justify-center gap-1">
                          {theme.name}
                          <Palette size={12} className="text-[var(--accent)]" />
                        </p>
                        {currentTheme === theme.id && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center">
                            <Check size={12} className="text-[var(--bg)]" />
                          </div>
                        )}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}

          {activeSection === "qr" && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-[var(--text-sub)] mb-4">Ваш QR-код профиля</p>
                <div className="bg-white p-4 rounded-2xl inline-block mb-4">
                  <div className="w-48 h-48 bg-[#07080f] rounded-lg flex items-center justify-center">
                    {profileQrDataUrl ? (
                      <img src={profileQrDataUrl || "/placeholder.svg"} alt="Profile QR code" className="w-full h-full rounded-lg" />
                    ) : (
                      <QrCode size={120} className="text-white" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-[var(--text-muted)]">@{user.username}</p>
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  Другие пользователи могут сканировать этот код, чтобы открыть ваш профиль
                </p>
              </div>

              <div className="rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] p-4 space-y-3">
                <p className="text-sm text-[var(--text)]">Подтвердить вход по QR</p>
                <p className="text-xs text-[var(--text-sub)]">
                  Вставьте код с экрана входа (формат: challenge.secret), чтобы подтвердить вход на другом устройстве.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (isScannerOpen) {
                        stopQrScanner()
                      } else {
                        void startQrScanner()
                      }
                    }}
                    disabled={isApprovingQr}
                    className="py-2 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] font-medium hover:bg-[var(--glass-border)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <ScanLine size={16} />
                    {isScannerOpen ? "Закрыть сканер" : "Сканировать QR"}
                  </button>
                  <button
                    onClick={() => {
                      void handleApproveQrCode()
                    }}
                    disabled={isApprovingQr}
                    className="py-2 rounded-xl bg-[var(--accent)] text-[var(--bg)] font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isApprovingQr ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Проверка...
                      </>
                    ) : (
                      "Подтвердить"
                    )}
                  </button>
                </div>
                {!scannerSupported && <p className="text-xs text-[var(--text-muted)]">Ваш браузер не поддерживает сканирование QR камерой.</p>}
                {isScannerOpen && (
                  <div className="rounded-xl border border-[var(--glass-border)] overflow-hidden bg-black">
                    <video ref={scannerVideoRef} autoPlay muted playsInline className="w-full h-52 object-cover" />
                    <div className="px-3 py-2 text-xs text-[var(--text-sub)]">
                      {isScannerBusy ? "Запуск камеры..." : "Наведите камеру на QR-код входа"}
                    </div>
                  </div>
                )}
                <input
                  type="text"
                  value={qrCodeToApprove}
                  onChange={(e) => setQrCodeToApprove(e.target.value)}
                  placeholder="challenge.secret"
                  className="w-full px-4 py-3 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] input-focus"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

