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

  const navItems = [
    { path: "/dashboard", label: "dashboard" },
    { path: "/spin", label: "spin" },
  ]

  return (
    <header className="w-full bg-[#0a0f1f] border-b border-white border-opacity-10">
      <div className="flex items-center justify-between px-6 py-4">
        <button 
          onClick={() => router.push("/")}
          className="text-xl font-bold text-teal-300 hover:opacity-80 transition"
        >
          speed date
        </button>
        
        <div className="flex items-center gap-4">
          {pathname !== "/onboarding" && (
            <nav className="flex items-center gap-3">
              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => router.push(item.path)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                    pathname === item.path
                      ? "bg-teal-300 text-black"
                      : "text-white hover:opacity-80"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          )}
          
          {showProfile && (
            <button 
              onClick={onProfileClick || (() => router.push("/dashboard"))}
              className="w-10 h-10 rounded-full bg-white bg-opacity-10 flex items-center justify-center hover:bg-opacity-20 hover:scale-105 active:scale-95 transition overflow-hidden"
            >
              <Image
                src={profileImage}
                alt="profile"
                width={40}
                height={40}
                className="object-cover rounded-full"
              />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

