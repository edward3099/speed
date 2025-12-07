## System Patterns

- **Architecture**: Next.js App Router using `/src/app` for routes, layouts, and styling with global CSS plus Tailwind utilities.
- **State/Styling**:
  - Chakra UI provider wraps the app for consistent theming.
  - Tailwind CSS + utility helpers (`clsx`, `class-variance-authority`, `tailwind-merge`) drive component styling.
- **UI composition**: Reusable components live under `src/components`, organized into feature folders (`magicui`, `ui`). Pages import these building blocks to assemble experiences.
- **Animation/interaction**: Framer Motion, custom shader-like components (sparkles, shimmer) supply motion cues.
- **Access pattern**: Intended to run locally (`npm run dev`) while Cloudflare `cloudflared` binary exposes the dev server for remote reviewers.
