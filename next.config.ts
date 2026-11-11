import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Type-checking the whole program during `next build` costs real memory
  // (~200MB measured locally) for no benefit, since CI runs `pnpm typecheck`
  // before the Heroku push anyway. See deploy-heroku.yml.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
