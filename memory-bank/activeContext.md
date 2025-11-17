## Active Context

- **Current focus**: Keep the dev server + Cloudflare Tunnel running for remote review, and validate that all feature routes behave correctly through the tunnel URL.
- **State**:
  - Dependencies installed with `npm install`.
  - Dev server running via `PORT=3000 npm run dev` (Next.js 16, Turbopack) from `/workspace`.
  - Cloudflare quick tunnel active at `https://circle-choose-decades-joins.trycloudflare.com`, started with `./cloudflared tunnel --no-autoupdate --url http://localhost:3000`.
- **Next steps**:
  1. Smoke-test primary routes through the tunnel (`/`, `/dashboard`, `/onboarding`, `/spin`, `/video-date`).
  2. Share the tunnel URL + instructions with stakeholders.
  3. Document how to stop/restart the dev server and tunnel when needed.
- **Considerations**:
  - Environment variable `PORT` defaults to 26053; override with `PORT=3000` whenever starting the dev server.
  - Keep tunnel logs handy in `/home/ubuntu/.cursor/projects/workspace/terminals/20959.txt` for troubleshooting.
  - Cloudflare quick tunnels are ephemeral; expect URL changes on restart.
