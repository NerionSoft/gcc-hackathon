import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native (better-sqlite3, libsql) and Mastra packages must stay external
  // to the server bundle — they load at runtime in route handlers.
  serverExternalPackages: ["better-sqlite3", "@mastra/core", "@mastra/libsql", "@libsql/client"],
};

export default nextConfig;
