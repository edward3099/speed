"use client"

import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"

interface HeaderProps {
  title?: string
  showProfile?: boolean
  profileImage?: string
  onProfileClick?: () => void
}

export default function Header({ 
  title = "speed date", 
  showProfile = true,
  profileImage = "https://i.pravatar.cc/150?img=15",
  onProfileClick
}: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <header className="fixed top-0 left-0 right-0 w-full bg-[#000000] border-b border-white/5 z-50">
      <div className="flex items-center justify-between px-6 sm:px-8 lg:px-12 h-14 sm:h-16">
        {/* Home button - "speed date" logo */}
        <button 
          onClick={() => router.push("/")}
          className="text-base sm:text-lg font-semibold text-white hover:text-teal-300 transition-colors duration-200 touch-manipulation"
        >
          speed date
        </button>
        
        {/* Spin button with profile icon */}
        {pathname !== "/onboarding" && (
          <button
            onClick={() => router.push("/spin")}
            className={`flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full transition-all duration-200 touch-manipulation ${
              pathname === "/spin"
                ? "ring-1 ring-teal-300/60 ring-offset-0"
                : "hover:bg-white/5"
            }`}
          >
            <div className="w-full h-full rounded-full overflow-hidden">
              <Image
                src={profileImage}
                alt="profile"
                width={36}
                height={36}
                className="object-cover w-full h-full"
              />
            </div>
          </button>
        )}
      </div>
    </header>
  )
}

