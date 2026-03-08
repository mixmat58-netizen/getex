"use client"

import { useState } from "react"
import { Search, Plus, Check } from "lucide-react"
import Image from "next/image"

interface Chat {
  id: string
  name: string
  avatar: string
  lastMessage: string
  time: string
  unread: number
  online: boolean
  verified?: boolean
  typing?: boolean
}

interface Story {
  id: string
  name: string
  avatar: string
  viewed: boolean
  isOwn?: boolean
}

interface SearchUser {
  id: string
  username: string
  name: string
  avatar: string
  online?: boolean
}

interface ChatSidebarProps {
  chats: Chat[]
  stories: Story[]
  showStories?: boolean
  searchResults: SearchUser[]
  activeChat: string | null
  onChatSelect: (chatId: string) => void
  onStoryClick: (storyId: string) => void
  onAddStory: () => void
  onSearch: (query: string) => void
}

export function ChatSidebar({
  chats,
  stories,
  showStories = true,
  searchResults,
  activeChat,
  onChatSelect,
  onStoryClick,
  onAddStory,
  onSearch,
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)
    onSearch(value)
  }

  const hasSearch = searchQuery.trim().length > 0

  return (
    <div className="w-72 h-full glass-card flex flex-col overflow-hidden">
      <div className="p-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Поиск по username или телефону..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--glass)] border border-[var(--glass-border)] text-[var(--text)] placeholder:text-[var(--text-muted)] text-sm input-focus"
          />
        </div>
      </div>

      {showStories && (
        <div className="px-4 pb-3">
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            <button onClick={onAddStory} className="flex flex-col items-center gap-1 shrink-0">
              <div className="w-14 h-14 rounded-full bg-[var(--glass)] border-2 border-dashed border-[var(--glass-border)] flex items-center justify-center hover:border-[var(--accent)] transition-colors">
                <Plus size={24} className="text-[var(--text-sub)]" />
              </div>
              <span className="text-[10px] text-[var(--text-sub)]">Новый</span>
            </button>

            {stories.map((story) => (
              <button key={story.id} onClick={() => onStoryClick(story.id)} className="flex flex-col items-center gap-1 shrink-0">
                <div className={`p-0.5 rounded-full ${story.viewed ? "bg-[var(--glass-border)]" : "story-ring"}`}>
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-[var(--glass)] border-2 border-[var(--bg)]">
                    <Image src={story.avatar} alt={story.name} width={56} height={56} className="w-full h-full object-cover" />
                  </div>
                </div>
                <span className="text-[10px] text-[var(--text-sub)] max-w-14 truncate">{story.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="h-px bg-[var(--glass-border)] mx-4" />

      <div className="flex-1 overflow-y-auto">
        {hasSearch && (
          <div className="p-3 border-b border-[var(--glass-border)]">
            <p className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mb-2">Результаты поиска</p>
            <div className="space-y-1">
              {searchResults.length === 0 && <p className="text-xs text-[var(--text-sub)]">Ничего не найдено</p>}
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => onChatSelect(user.id)}
                  className="w-full p-2 flex items-center gap-2 rounded-lg hover:bg-[var(--glass)] transition-colors"
                >
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-[var(--glass)] shrink-0">
                    <Image src={user.avatar} alt={user.name} width={36} height={36} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 text-left flex-1">
                    <p className="text-sm text-[var(--text)] truncate">{user.name}</p>
                    <p className="text-xs text-[var(--text-sub)] truncate">@{user.username}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {chats.map((chat) => (
          <button
            key={chat.id}
            onClick={() => onChatSelect(chat.id)}
            className={`relative w-full p-3 flex items-center gap-3 hover:bg-[var(--glass)] transition-colors ${
              activeChat === chat.id ? "bg-[var(--glass)]" : ""
            }`}
          >
            {activeChat === chat.id && <div className="active-chat-indicator" />}

            <div className="relative shrink-0">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-[var(--glass)]">
                <Image src={chat.avatar} alt={chat.name} width={48} height={48} className="w-full h-full object-cover" />
              </div>
              {chat.online && <div className="absolute bottom-0 right-0 online-dot" />}
            </div>

            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-sm font-medium text-[var(--text)] truncate">{chat.name}</span>
                {chat.verified && (
                  <span className="verified-badge">
                    <Check size={14} />
                  </span>
                )}
              </div>
              <p className={`text-xs truncate ${chat.typing ? "text-[var(--accent)]" : "text-[var(--text-sub)]"}`}>
                {chat.typing ? (
                  <span className="flex items-center gap-1">
                    печатает
                    <span className="flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-[var(--accent)] typing-dot" />
                      <span className="w-1 h-1 rounded-full bg-[var(--accent)] typing-dot" />
                      <span className="w-1 h-1 rounded-full bg-[var(--accent)] typing-dot" />
                    </span>
                  </span>
                ) : (
                  chat.lastMessage
                )}
              </p>
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[10px] text-[var(--text-muted)]">{chat.time}</span>
              {chat.unread > 0 && <span className="unread-counter">{chat.unread > 99 ? "99+" : chat.unread}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

