import type { NextConfig } from "next";
import http from 'http';
import https from 'https';

// Increase HTTP agent max sockets for high concurrency
// This allows more concurrent connections to external APIs
if (typeof http !== 'undefined' && http.globalAgent) {
  http.globalAgent.maxSockets = Infinity;
  http.globalAgent.maxFreeSockets = 256;
  (http.globalAgent as any).keepAlive = true;
  (http.globalAgent as any).keepAliveMsecs = 30000;
}

if (typeof https !== 'undefined' && https.globalAgent) {
  https.globalAgent.maxSockets = Infinity;
  https.globalAgent.maxFreeSockets = 256;
  (https.globalAgent as any).keepAlive = true;
  (https.globalAgent as any).keepAliveMsecs = 30000;
}

const nextConfig: NextConfig = {
  images: {
    // Use both domains (for compatibility) and remotePatterns (for Webpack)
    domains: [
      'jzautphzcbtqplltsfse.supabase.co', // Your Supabase project hostname
      'supabase.co', // Base Supabase domain
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'jzautphzcbtqplltsfse.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co', // Double asterisk for all subdomains
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co', // Single asterisk as backup
      },
      {
        protocol: 'https',
        hostname: 'supabase.co',
      },
    ],
  },
  // Allow cloudflare tunnel domains in development
  allowedDevOrigins: [
    '*.trycloudflare.com',
    'teams-sought-incident-kent.trycloudflare.com', // Current tunnel domain
  ],
  reactStrictMode: true,
};

export default nextConfig;
