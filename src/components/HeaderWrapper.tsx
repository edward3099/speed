"use client"

import { usePathname } from "next/navigation"
import Header from "./Header"

export default function HeaderWrapper() {
  const pathname = usePathname()
  
  // Customize title based on route
  const getTitle = () => {
    if (pathname === "/") return "speed date"
    if (pathname === "/dashboard") return "dashboard"
    if (pathname === "/spin") return "spin"
    if (pathname === "/video-date") return "video date"
    if (pathname === "/onboarding") return "onboarding"
    return "speed date"
  }

  return (
    <Header 
      title={getTitle()}
      showProfile={true}
    />
  )
}

