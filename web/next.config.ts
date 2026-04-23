import type { NextConfig } from "next";

// `turbopack.root` pin deferred — it was resolving Tailwind's CSS entry from
// the wrong directory under Turbopack in Next.js 16.2.4 (resolution context
// ended up at the repo root rather than `web/`). The workspace-root warning
// in dev is cosmetic; we'll revisit once Turbopack + Tailwind v4 interop
// stabilises.
const nextConfig: NextConfig = {};

export default nextConfig;
