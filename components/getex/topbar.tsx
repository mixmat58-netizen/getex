"use client"

import { useState } from "react"
import { Plus, Check } from "lucide-react"
import Image from "next/image"

type Tab = "chats" | "groups" | "channels"

interface TopbarProps {
  currentUser: {
    name: string
    avatar: string
    verified: boolean
  }
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  onCreateNew: () => void
  onOpenSettings: () => void
}

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "chats", label: "Чаты" },
  { id: "groups", label: "Группы" },
  { id: "channels", label: "Каналы" },
]

export function Topbar({
  currentUser,
  activeTab,
  onTabChange,
  onCreateNew,
  onOpenSettings,
}: TopbarProps) {
  const [tabIndicatorStyle, setTabIndicatorStyle] = useState({ left: 0, width: 0 })

  const handleTabClick = (tab: Tab, e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget
    const rect = button.getBoundingClientRect()
    const parentRect = button.parentElement?.getBoundingClientRect()
    if (parentRect) {
      setTabIndicatorStyle({
        left: rect.left - parentRect.left,
        width: rect.width,
      })
    }
    onTabChange(tab)
  }

  return (
    <header className="h-16 px-6 flex items-center justify-between glass-card rounded-none border-x-0 border-t-0">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-fraunces), serif", color: "var(--accent)" }}>
          getex
        </h1>
      </div>

      <nav className="relative flex items-center gap-1 px-1 py-1 rounded-xl bg-[var(--glass)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={(e) => handleTabClick(tab.id, e)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id ? "text-[var(--text)]" : "text-[var(--text-sub)] hover:text-[var(--text)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div
          className="tab-indicator absolute bottom-1 h-0.5 bg-[var(--accent)] rounded-full transition-all duration-300"
          style={{
            left: tabIndicatorStyle.left || 4,
            width: tabIndicatorStyle.width || 60,
          }}
        />
      </nav>

      <div className="flex items-center gap-3">
        <button
          onClick={onCreateNew}
          className="p-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors"
          aria-label="Создать"
        >
          <Plus size={20} className="text-[var(--bg)]" />
        </button>

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 p-1 pr-3 rounded-full bg-[var(--glass)] hover:bg-[var(--glass-border)] transition-colors"
        >
          <div className="w-8 h-8 rounded-full overflow-hidden">
            <Image src={currentUser.avatar} alt={currentUser.name} width={32} height={32} className="w-full h-full object-cover" />
          </div>
          <span className="text-sm text-[var(--text)] flex items-center gap-1">
            {currentUser.name}
            {currentUser.verified && (
              <span className="verified-badge">
                <Check size={12} />
              </span>
            )}
          </span>
        </button>
      </div>
    </header>
  )
}
