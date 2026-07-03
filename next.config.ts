import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mastra must stay external to the server bundle — it loads at runtime
  // in route handlers and ships its own dynamic requires that bundlers choke on.
  serverExternalPackages: ["@mastra/core"],
};

export default nextConfig;
