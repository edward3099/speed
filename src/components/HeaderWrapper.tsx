"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import Header from "./Header"

export default function HeaderWrapper() {
  const pathname = usePathname()
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const supabase = createClient()
  
  // Customize title based on route
  const getTitle = () => {
    if (pathname === "/") return "meetchristians.live"
    if (pathname === "/dashboard") return "dashboard"
    if (pathname === "/spin") return "spin"
    if (pathname === "/video-date") return "video date"
    if (pathname === "/onboarding") return "onboarding"
    return "meetchristians.live"
  }

  // Fetch user's profile image
  useEffect(() => {
    const fetchProfileImage = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setProfileImage(null)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('photo')
        .eq('id', user.id)
        .single()

      if (profile?.photo && !profile.photo.includes('pravatar.cc')) {
        setProfileImage(profile.photo)
      } else {
        setProfileImage(null)
      }
    }

    fetchProfileImage()

    // Subscribe to profile changes
    const channel = supabase
      .channel('profile-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        async (payload) => {
          const { data: { user } } = await supabase.auth.getUser()
          if (user && payload.new.id === user.id) {
            const photo = (payload.new as any).photo
            if (photo && !photo.includes('pravatar.cc')) {
              setProfileImage(photo)
            } else {
              setProfileImage(null)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return (
    <Header 
      title={getTitle()}
      showProfile={true}
      profileImage={profileImage}
    />
  )
}

