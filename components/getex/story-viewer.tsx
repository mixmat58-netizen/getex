"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
import Image from "next/image"

interface Story {
  id: string
  type: "image" | "video"
  mediaUrl: string
  createdAt: string
  viewed: boolean
}

interface StoryUser {
  id: string
  name: string
  avatar: string
  stories: Story[]
}

interface StoryViewerProps {
  isOpen: boolean
  users: StoryUser[]
  initialUserId?: string | null
  onClose: () => void
  onViewStory?: (storyId: string) => void
}

export function StoryViewer({ isOpen, users, initialUserId = null, onClose, onViewStory }: StoryViewerProps) {
  const [currentUserIndex, setCurrentUserIndex] = useState(0)
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const lastViewedStoryIdRef = useRef<string>("")

  const currentUser = users[currentUserIndex]
  const currentStory = currentUser?.stories[currentStoryIndex]

  const goToNextStory = useCallback(() => {
    if (!currentUser) return

    if (currentStoryIndex < currentUser.stories.length - 1) {
      setCurrentStoryIndex((prev) => prev + 1)
      setProgress(0)
      return
    }

    if (currentUserIndex < users.length - 1) {
      setCurrentUserIndex((prev) => prev + 1)
      setCurrentStoryIndex(0)
      setProgress(0)
      return
    }

    onClose()
  }, [currentStoryIndex, currentUser, currentUserIndex, onClose, users.length])

  const goToPrevStory = useCallback(() => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex((prev) => prev - 1)
      setProgress(0)
      return
    }

    if (currentUserIndex > 0) {
      const prevUserStories = users[currentUserIndex - 1]?.stories || []
      setCurrentUserIndex((prev) => prev - 1)
      setCurrentStoryIndex(Math.max(0, prevUserStories.length - 1))
      setProgress(0)
    }
  }, [currentStoryIndex, currentUserIndex, users])

  useEffect(() => {
    if (!isOpen) return

    const index = initialUserId ? users.findIndex((item) => item.id === initialUserId) : 0
    const resolvedUser = users[index >= 0 ? index : 0]
    const firstUnviewedIndex = resolvedUser?.stories.findIndex((story) => !story.viewed) ?? -1

    setCurrentUserIndex(index >= 0 ? index : 0)
    setCurrentStoryIndex(firstUnviewedIndex >= 0 ? firstUnviewedIndex : 0)
    setProgress(0)
  }, [initialUserId, isOpen, users])

  useEffect(() => {
    if (!currentStory || !isOpen || !onViewStory) return
    if (lastViewedStoryIdRef.current === currentStory.id) return
    lastViewedStoryIdRef.current = currentStory.id
    onViewStory(currentStory.id)
  }, [currentStory?.id, isOpen, onViewStory])

  useEffect(() => {
    if (!isOpen || isPaused || !currentStory) return

    const duration = currentStory.type === "video" ? 9000 : 5000
    const tick = 100

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 100 / (duration / tick)
        if (next >= 100) {
          goToNextStory()
          return 0
        }
        return next
      })
    }, tick)

    return () => clearInterval(interval)
  }, [currentStory, goToNextStory, isOpen, isPaused])

  if (!isOpen || !currentUser || !currentStory) return null

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="absolute top-0 left-0 right-0 z-10 p-2 flex gap-1">
        {currentUser.stories.map((_, index) => (
          <div key={`${currentUser.id}-${index}`} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-100"
              style={{ width: index < currentStoryIndex ? "100%" : index === currentStoryIndex ? `${progress}%` : "0%" }}
            />
          </div>
        ))}
      </div>

      <div className="absolute top-4 left-0 right-0 z-10 px-4 pt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white">
            <Image src={currentUser.avatar} alt={currentUser.name} width={40} height={40} className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">{currentUser.name}</p>
            <p className="text-xs text-white/60">
              {new Date(currentStory.createdAt).toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <X size={24} className="text-white" />
        </button>
      </div>

      <div
        className="absolute inset-0 flex items-center justify-center"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {currentStory.type === "image" ? (
          <Image src={currentStory.mediaUrl} alt="Story" fill className="object-contain" />
        ) : (
          <video src={currentStory.mediaUrl} className="max-w-full max-h-full object-contain" autoPlay muted playsInline loop />
        )}
      </div>

      <button onClick={goToPrevStory} className="absolute left-0 top-20 bottom-16 w-1/3 z-10" aria-label="Previous story" />
      <button onClick={goToNextStory} className="absolute right-0 top-20 bottom-16 w-1/3 z-10" aria-label="Next story" />

      <div className="absolute inset-y-0 left-4 flex items-center z-10 pointer-events-none">
        <button onClick={goToPrevStory} className="p-2 rounded-full bg-black/50 text-white pointer-events-auto">
          <ChevronLeft size={24} />
        </button>
      </div>
      <div className="absolute inset-y-0 right-4 flex items-center z-10 pointer-events-none">
        <button onClick={goToNextStory} className="p-2 rounded-full bg-black/50 text-white pointer-events-auto">
          <ChevronRight size={24} />
        </button>
      </div>
    </div>
  )
}
