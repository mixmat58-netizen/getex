"use client"

import { useMemo } from "react"
import { X, Phone, AtSign, UserRound, QrCode } from "lucide-react"
import Image from "next/image"

interface ProfileUser {
  id: string
  name: string
  username: string
  phone: string
  avatar: string
  bio?: string
}

interface UserProfileModalProps {
  isOpen: boolean
  user: ProfileUser | null
  onClose: () => void
}

function hashString(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

function buildPseudoQr(username: string) {
  const size = 21
  const seed = hashString(username || "getex")
  const grid: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false))

  const placeFinder = (x: number, y: number) => {
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        const edge = row === 0 || row === 6 || col === 0 || col === 6
        const center = row >= 2 && row <= 4 && col >= 2 && col <= 4
        grid[y + row][x + col] = edge || center
      }
    }
  }

  placeFinder(0, 0)
  placeFinder(size - 7, 0)
  placeFinder(0, size - 7)

  let bitSeed = seed
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inFinder =
        (x < 7 && y < 7) ||
        (x >= size - 7 && y < 7) ||
        (x < 7 && y >= size - 7)
      if (inFinder) continue

      bitSeed = (bitSeed * 1664525 + 1013904223) >>> 0
      grid[y][x] = (bitSeed & 1) === 1
    }
  }

  return grid
}

export function UserProfileModal({ isOpen, user, onClose }: UserProfileModalProps) {
  const qr = useMemo(() => buildPseudoQr(user?.username || ""), [user?.username])

  if (!isOpen || !user) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative w-full max-w-md glass-card p-5 border border-[var(--glass-border)]">
        <button onClick={onClose} className="absolute top-3 right-3 p-2 rounded-lg hover:bg-[var(--glass)] transition-colors">
          <X size={18} className="text-[var(--text-sub)]" />
        </button>

        <div className="flex items-center gap-4 mb-5">
          <div className="w-20 h-20 rounded-full overflow-hidden border border-[var(--glass-border)]">
            <Image src={user.avatar} alt={user.name} width={80} height={80} className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-[var(--text)] truncate">{user.name}</p>
            <p className="text-sm text-[var(--text-sub)] truncate">@{user.username}</p>
          </div>
        </div>

        <div className="space-y-3 mb-5">
          <div className="rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] p-3 flex items-start gap-3">
            <UserRound size={16} className="text-[var(--accent)] mt-0.5" />
            <div>
              <p className="text-xs text-[var(--text-sub)]">Имя</p>
              <p className="text-sm text-[var(--text)]">{user.name}</p>
            </div>
          </div>

          <div className="rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] p-3 flex items-start gap-3">
            <AtSign size={16} className="text-[var(--accent)] mt-0.5" />
            <div>
              <p className="text-xs text-[var(--text-sub)]">Username</p>
              <p className="text-sm text-[var(--text)]">@{user.username}</p>
            </div>
          </div>

          <div className="rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] p-3 flex items-start gap-3">
            <Phone size={16} className="text-[var(--accent)] mt-0.5" />
            <div>
              <p className="text-xs text-[var(--text-sub)]">Телефон</p>
              <p className="text-sm text-[var(--text)]">{user.phone || "Не указан"}</p>
            </div>
          </div>

          <div className="rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] p-3">
            <p className="text-xs text-[var(--text-sub)] mb-1">Описание</p>
            <p className="text-sm text-[var(--text)] whitespace-pre-wrap">{user.bio?.trim() || "Описание не заполнено"}</p>
          </div>
        </div>

        <div className="rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <QrCode size={16} className="text-[var(--accent)]" />
            <p className="text-sm text-[var(--text)]">QR username</p>
          </div>

          <div className="mx-auto w-44 h-44 bg-white rounded-xl p-2 grid grid-cols-[repeat(21,minmax(0,1fr))] gap-px">
            {qr.flat().map((bit, index) => (
              <div key={index} className={bit ? "bg-black" : "bg-white"} />
            ))}
          </div>

          <p className="mt-2 text-center text-xs text-[var(--text-sub)]">@{user.username}</p>
        </div>
      </div>
    </div>
  )
}
