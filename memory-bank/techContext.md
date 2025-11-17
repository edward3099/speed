## Tech Context

- **Framework**: Next.js 16 (App Router) with React 19 + TypeScript 5.
- **UI libraries**: Chakra UI 3, Tailwind CSS 3, Lucide icons, custom magicui components.
- **Tooling**: PostCSS, Autoprefixer, Framer Motion for animations, class utilities for styling.
- **Dev requirements**:
  - Node.js 20+ (to align with `@types/node` ^20 and Next 16 needs).
  - `npm run dev` for local server on port 3000.
  - Cloudflare `cloudflared` binary checked into repo for tunnel access.
- **External services**: Cloudflare Tunnel exposes `localhost:3000` to a public URL for demo/sharing.
