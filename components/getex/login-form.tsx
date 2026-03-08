"use client"

import { useEffect, useRef, useState } from "react"
import { Eye, EyeOff, Check, X, QrCode, ArrowLeft, Loader2, Copy, RefreshCcw } from "lucide-react"
import { getQrLoginStatus, requestQrLoginChallenge } from "@/lib/client/api"
import type { User } from "@/lib/client/types"
import QRCode from "qrcode"

interface LoginFormProps {
  onLogin: (credentials: { usernameOrPhone: string; password: string }) => Promise<void>
  onRegister: (data: { displayName: string; username: string; phone: string; password: string }) => Promise<void>
  onCheckUsername: (username: string) => Promise<boolean>
  onQRLogin: (auth: { token: string; user: User }) => Promise<void>
}

interface QrChallengeState {
  challengeId: string
  secret: string
  code: string
  expiresAt: string
}

export function LoginForm({ onLogin, onRegister, onCheckUsername, onQRLogin }: LoginFormProps) {
  const [mode, setMode] = useState<"login" | "register" | "qr">("login")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [shake, setShake] = useState(false)

  const [loginUsername, setLoginUsername] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle")

  const [qrChallenge, setQrChallenge] = useState<QrChallengeState | null>(null)
  const [qrImageDataUrl, setQrImageDataUrl] = useState("")
  const [qrExpiry, setQrExpiry] = useState(0)
  const [qrStatus, setQrStatus] = useState<"idle" | "waiting" | "approved" | "expired">("idle")
  const [qrBusy, setQrBusy] = useState(false)
  const qrCompletedRef = useRef(false)

  useEffect(() => {
    if (!username || username.length < 3) {
      setUsernameStatus("idle")
      return
    }

    let isCancelled = false
    setUsernameStatus("checking")

    const timer = setTimeout(async () => {
      try {
        const available = await onCheckUsername(username)
        if (isCancelled) return
        setUsernameStatus(available ? "available" : "taken")
      } catch {
        if (isCancelled) return
        setUsernameStatus("idle")
      }
    }, 400)

    return () => {
      isCancelled = true
      clearTimeout(timer)
    }
  }, [username, onCheckUsername])

  useEffect(() => {
    if (mode !== "qr") return

    qrCompletedRef.current = false
    setError("")
    setQrStatus("idle")
    setQrChallenge(null)
    setQrExpiry(0)

    let cancelled = false

    const startChallenge = async () => {
      setQrBusy(true)
      try {
        const data = await requestQrLoginChallenge()
        if (cancelled) return
        setQrChallenge(data)
        setQrStatus("waiting")
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Не удалось создать QR")
        setQrStatus("expired")
      } finally {
        if (!cancelled) setQrBusy(false)
      }
    }

    void startChallenge()

    return () => {
      cancelled = true
    }
  }, [mode])

  useEffect(() => {
    if (mode !== "qr" || !qrChallenge) return

    const updateLeft = () => {
      const left = Math.max(0, Math.ceil((new Date(qrChallenge.expiresAt).getTime() - Date.now()) / 1000))
      setQrExpiry(left)
      if (left <= 0) {
        setQrStatus("expired")
      }
    }

    updateLeft()
    const timer = setInterval(updateLeft, 1000)
    return () => clearInterval(timer)
  }, [mode, qrChallenge])

  useEffect(() => {
    if (mode !== "qr" || !qrChallenge?.code) {
      setQrImageDataUrl("")
      return
    }

    let disposed = false

    void (async () => {
      try {
        const image = await QRCode.toDataURL(qrChallenge.code, {
          margin: 1,
          width: 240,
          errorCorrectionLevel: "M",
        })
        if (!disposed) {
          setQrImageDataUrl(image)
        }
      } catch {
        if (!disposed) {
          setQrImageDataUrl("")
        }
      }
    })()

    return () => {
      disposed = true
    }
  }, [mode, qrChallenge])

  useEffect(() => {
    if (mode !== "qr" || !qrChallenge || qrStatus !== "waiting") return

    let disposed = false

    const poll = async () => {
      try {
        const result = await getQrLoginStatus(qrChallenge.challengeId, qrChallenge.secret)
        if (disposed || qrCompletedRef.current) return

        if (result.status === "approved") {
          qrCompletedRef.current = true
          setQrStatus("approved")
          await onQRLogin({ token: result.token, user: result.user })
          return
        }

        if (result.status === "expired" || result.status === "consumed") {
          setQrStatus("expired")
        }
      } catch {
        if (!disposed) {
          setQrStatus("expired")
        }
      }
    }

    void poll()
    const interval = setInterval(() => {
      void poll()
    }, 1800)

    return () => {
      disposed = true
      clearInterval(interval)
    }
  }, [mode, onQRLogin, qrChallenge, qrStatus])

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "")
    if (numbers.length === 0) return ""
    if (numbers.length <= 1) return `+${numbers}`
    if (numbers.length <= 4) return `+${numbers.slice(0, 1)} (${numbers.slice(1)}`
    if (numbers.length <= 7) return `+${numbers.slice(0, 1)} (${numbers.slice(1, 4)}) ${numbers.slice(4)}`
    if (numbers.length <= 9) return `+${numbers.slice(0, 1)} (${numbers.slice(1, 4)}) ${numbers.slice(4, 7)}-${numbers.slice(7)}`
    return `+${numbers.slice(0, 1)} (${numbers.slice(1, 4)}) ${numbers.slice(4, 7)}-${numbers.slice(7, 9)}-${numbers.slice(9, 11)}`
  }

  const raiseError = (message: string) => {
    setError(message)
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      await onLogin({ usernameOrPhone: loginUsername, password: loginPassword })
    } catch (err) {
      raiseError(err instanceof Error ? err.message : "Ошибка входа")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password !== confirmPassword) {
      raiseError("Пароли не совпадают")
      return
    }

    if (password.length < 8) {
      raiseError("Пароль должен быть не менее 8 символов")
      return
    }

    if (usernameStatus !== "available") {
      raiseError("Username недоступен")
      return
    }

    setIsLoading(true)
    try {
      await onRegister({ displayName, username, phone, password })
    } catch (err) {
      raiseError(err instanceof Error ? err.message : "Ошибка регистрации")
    } finally {
      setIsLoading(false)
    }
  }

  const switchMode = (newMode: "login" | "register" | "qr") => {
    setError("")
    setMode(newMode)
  }

  const refreshQr = () => {
    setMode("login")
    requestAnimationFrame(() => setMode("qr"))
  }

  const copyQrCode = async () => {
    if (!qrChallenge?.code) return
    try {
      await navigator.clipboard.writeText(qrChallenge.code)
    } catch {
      // ignore
    }
  }

  return (
    <div className={`w-full max-w-md glass-card p-8 ${shake ? "shake" : ""}`}>
      <div className="text-center mb-8">
        <h1
          className="text-4xl font-bold mb-2"
          style={{ fontFamily: "var(--font-fraunces), serif", color: "var(--accent)" }}
        >
          getex
        </h1>
        <p className="text-[var(--text-sub)] text-sm">
          {mode === "login" && "Войдите в свой аккаунт"}
          {mode === "register" && "Создайте новый аккаунт"}
          {mode === "qr" && "Вход по QR"}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--error)]/20 border border-[var(--error)]/30 text-[var(--error)] text-sm text-center">
          {error}
        </div>
      )}

      {mode === "login" && (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--text-sub)] mb-2">Username или телефон</label>
            <input
              type="text"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] placeholder:text-[var(--text-muted)] input-focus"
              placeholder="@username или +7 (999) 123-45-67"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-sub)] mb-2">Пароль</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-4 py-3 pr-12 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] placeholder:text-[var(--text-muted)] input-focus"
                placeholder="Введите пароль"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-sub)] hover:text-[var(--text)] transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--bg)] font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Входим...
              </>
            ) : (
              "Войти"
            )}
          </button>

          <button
            type="button"
            onClick={() => switchMode("qr")}
            className="w-full py-3 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] font-medium hover:bg-[var(--glass-border)] transition-colors flex items-center justify-center gap-2"
          >
            <QrCode size={20} />
            Войти по QR
          </button>

          <p className="text-center text-[var(--text-sub)] text-sm">
            Нет аккаунта?{" "}
            <button type="button" onClick={() => switchMode("register")} className="text-[var(--accent)] hover:underline">
              Зарегистрироваться
            </button>
          </p>
        </form>
      )}

      {mode === "register" && (
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--text-sub)] mb-2">Имя</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] placeholder:text-[var(--text-muted)] input-focus"
              placeholder="Как вас называть?"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-sub)] mb-2">Username</label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                className="w-full px-4 py-3 pr-12 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] placeholder:text-[var(--text-muted)] input-focus"
                placeholder="your_username"
                required
                minLength={3}
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                {usernameStatus === "checking" && <Loader2 size={20} className="animate-spin text-[var(--text-sub)]" />}
                {usernameStatus === "available" && <Check size={20} className="text-[var(--success)]" />}
                {usernameStatus === "taken" && <X size={20} className="text-[var(--error)]" />}
              </div>
            </div>
            {usernameStatus === "taken" && <p className="text-[var(--error)] text-xs mt-1">Этот username уже занят</p>}
          </div>

          <div>
            <label className="block text-sm text-[var(--text-sub)] mb-2">Телефон</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              className="w-full px-4 py-3 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] placeholder:text-[var(--text-muted)] input-focus"
              placeholder="+7 (999) 123-45-67"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text-sub)] mb-2">Пароль</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-12 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] placeholder:text-[var(--text-muted)] input-focus"
                placeholder="Минимум 8 символов"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-sub)] hover:text-[var(--text)] transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-[var(--text-sub)] mb-2">Подтвердите пароль</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 pr-12 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] placeholder:text-[var(--text-muted)] input-focus"
                placeholder="Повторите пароль"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-sub)] hover:text-[var(--text)] transition-colors"
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--bg)] font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Создаём аккаунт...
              </>
            ) : (
              "Создать аккаунт"
            )}
          </button>

          <p className="text-center text-[var(--text-sub)] text-sm">
            Уже есть аккаунт?{" "}
            <button type="button" onClick={() => switchMode("login")} className="text-[var(--accent)] hover:underline">
              Войти
            </button>
          </p>
        </form>
      )}

      {mode === "qr" && (
        <div className="text-center">
          <button
            onClick={() => switchMode("login")}
            className="flex items-center gap-2 text-[var(--text-sub)] hover:text-[var(--text)] transition-colors mb-6"
          >
            <ArrowLeft size={20} />
            Назад
          </button>

          <div className="bg-white p-4 rounded-2xl inline-block mb-4">
            <div className="w-48 h-48 bg-[#07080f] rounded-lg flex items-center justify-center">
              {qrBusy ? (
                <Loader2 size={56} className="text-white animate-spin" />
              ) : qrImageDataUrl ? (
                <img src={qrImageDataUrl || "/placeholder.svg"} alt="QR login code" className="w-full h-full rounded-lg" />
              ) : (
                <QrCode size={120} className="text-white" />
              )}
            </div>
          </div>

          <p className="text-[var(--text-sub)] text-sm mb-2">
            Сканируйте код на другом устройстве в разделе Настройки → QR
          </p>

          <p className="text-[var(--text-muted)] text-xs">
            {qrStatus === "approved" && "Вход подтвержден..."}
            {qrStatus === "waiting" && `Код истечет через ${Math.floor(qrExpiry / 60)}:${(qrExpiry % 60).toString().padStart(2, "0")}`}
            {qrStatus === "expired" && "Код истек. Обновите QR."}
          </p>

          <p className="text-[var(--text-muted)] text-xs mt-4 break-all">{qrChallenge?.code || "-"}</p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copyQrCode}
              disabled={!qrChallenge?.code}
              className="py-2 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] font-medium hover:bg-[var(--glass-border)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Copy size={16} />
              Скопировать
            </button>
            <button
              type="button"
              onClick={refreshQr}
              className="py-2 rounded-xl bg-[var(--accent)] text-[var(--bg)] font-medium hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCcw size={16} />
              Обновить
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
