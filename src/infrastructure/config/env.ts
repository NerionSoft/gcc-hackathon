function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

function optionalEnv(key: string): string | undefined {
  return process.env[key] || undefined;
}

function buildEnv() {
  const raw = {
    DATABASE_URL: requireEnv("DATABASE_URL"),
    BETTER_AUTH_SECRET: requireEnv("BETTER_AUTH_SECRET"),
    NEXT_PUBLIC_APP_URL: optionalEnv("NEXT_PUBLIC_APP_URL"),
    VERCEL_URL: optionalEnv("VERCEL_URL"),
    NODE_ENV: process.env.NODE_ENV ?? "development",
    LOG_LEVEL: optionalEnv("LOG_LEVEL"),
  };

  const baseUrls = [
    raw.NEXT_PUBLIC_APP_URL?.replace(/\/$/, ""),
    raw.VERCEL_URL ? `https://${raw.VERCEL_URL}` : undefined,
    "http://localhost:3000",
  ].filter((u): u is string => !!u);

  return {
    ...raw,
    baseUrl: baseUrls[0],
    baseUrls: [...new Set(baseUrls)],
    isProduction: raw.NODE_ENV === "production",
    isDev: raw.NODE_ENV !== "production",
  } as const;
}

type Env = ReturnType<typeof buildEnv>;

let _env: Env | undefined;

/** Lazy-validated env — crashes on first access if vars are missing, not at import time. */
export const env: Env = new Proxy({} as Env, {
  get(_, prop: string) {
    if (!_env) _env = buildEnv();
    return _env[prop as keyof Env];
  },
});
