import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Removed pravatar.cc - placeholder images are not allowed
      // Add your actual image domains here (e.g., Supabase storage)
      {
        protocol: 'https',
        hostname: '**.supabase.co', // Allow Supabase storage images
      },
    ],
  },
};

export default nextConfig;
