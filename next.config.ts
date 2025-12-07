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
  // Allow cloudflare tunnel domains in development
  allowedDevOrigins: [
    '*.trycloudflare.com',
  ],
  // Enable instrumentation hook for cron jobs
  experimental: {
    instrumentationHook: true,
  } as any, // TypeScript doesn't recognize this yet
  reactStrictMode: true,
};

export default nextConfig;
