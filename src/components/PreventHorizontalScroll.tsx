"use client"

import { useEffect } from "react"

/**
 * Prevents all scrolling (horizontal and vertical) like in mobile apps
 * Uses touch event handling to block all scroll gestures
 */
export function PreventHorizontalScroll() {
  useEffect(() => {
    // Prevent all touch scrolling
    const handleTouchMove = (e: TouchEvent) => {
      const target = e.target as Element | null
      // Allow scrolling in specific scrollable containers
      if (target && target instanceof Element) {
        if (target.closest('[data-allow-scroll]')) {
          return
        }
      }
      // Prevent all touch scrolling
      e.preventDefault()
    }

    // Prevent all wheel scrolling
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as Element | null
      // Allow scrolling in specific scrollable containers
      if (target && target instanceof Element) {
        if (target.closest('[data-allow-scroll]')) {
          return
        }
      }
      // Prevent all wheel scrolling
      e.preventDefault()
    }

    // Add event listeners
    document.addEventListener("touchmove", handleTouchMove, { passive: false })
    document.addEventListener("wheel", handleWheel, { passive: false })

    // Prevent all scrolling on document
    const preventScroll = (e: Event) => {
      const target = e.target
      // Allow scrolling in specific scrollable containers
      if (target && target instanceof Element) {
        if (target.closest('[data-allow-scroll]')) {
          return
        }
      }
      // Prevent all scrolling
      e.preventDefault()
    }

    document.addEventListener("scroll", preventScroll, { passive: false })

    return () => {
      document.removeEventListener("touchmove", handleTouchMove)
      document.removeEventListener("wheel", handleWheel)
      document.removeEventListener("scroll", preventScroll)
    }
  }, [])

  return null
}

