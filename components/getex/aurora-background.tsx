"use client"

import { useEffect, useRef, useState } from "react"

const CURSOR_GLOW_THEMES = [
  "spotlight",
  "amethyst", 
  "ocean",
  "ember",
  "rosegold",
  "northern",
  "electric"
]

export function AuroraBackground() {
  const containerRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const cursorSecondaryRef = useRef<HTMLDivElement>(null)
  const [hasCursorGlow, setHasCursorGlow] = useState(false)

  useEffect(() => {
    const checkTheme = () => {
      const theme = document.documentElement.getAttribute("data-theme") || ""
      setHasCursorGlow(CURSOR_GLOW_THEMES.includes(theme))
    }
    
    checkTheme()
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "data-theme") {
          checkTheme()
        }
      })
    })
    
    observer.observe(document.documentElement, { attributes: true })
    
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let animationId: number
    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0
    let secondaryX = 0
    let secondaryY = 0

    const handleMouseMove = (e: MouseEvent) => {
      targetX = e.clientX
      targetY = e.clientY
      
      if (cursorRef.current && hasCursorGlow) {
        cursorRef.current.classList.add("active")
      }
      if (cursorSecondaryRef.current && hasCursorGlow) {
        cursorSecondaryRef.current.classList.add("active")
      }
    }

    const handleMouseLeave = () => {
      if (cursorRef.current) {
        cursorRef.current.classList.remove("active")
      }
      if (cursorSecondaryRef.current) {
        cursorSecondaryRef.current.classList.remove("active")
      }
    }

    const animate = () => {
      // Smooth interpolation for primary cursor
      currentX += (targetX - currentX) * 0.15
      currentY += (targetY - currentY) * 0.15
      
      // Even smoother for secondary (trailing effect)
      secondaryX += (targetX - secondaryX) * 0.08
      secondaryY += (targetY - secondaryY) * 0.08

      if (cursorRef.current && hasCursorGlow) {
        cursorRef.current.style.left = `${currentX}px`
        cursorRef.current.style.top = `${currentY}px`
      }
      
      if (cursorSecondaryRef.current && hasCursorGlow) {
        cursorSecondaryRef.current.style.left = `${secondaryX}px`
        cursorSecondaryRef.current.style.top = `${secondaryY}px`
      }

      animationId = requestAnimationFrame(animate)
    }

    if (hasCursorGlow) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseleave", handleMouseLeave)
      animationId = requestAnimationFrame(animate)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseleave", handleMouseLeave)
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  }, [hasCursorGlow])

  return (
    <>
      <div ref={containerRef} className="aurora-bg">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="blob blob-4" />
        <div className="blob blob-5" />
      </div>
      
      {/* Cursor glow elements */}
      <div 
        ref={cursorRef} 
        className="cursor-glow"
        aria-hidden="true"
      />
      <div 
        ref={cursorSecondaryRef} 
        className="cursor-glow-secondary"
        aria-hidden="true"
      />
    </>
  )
}
