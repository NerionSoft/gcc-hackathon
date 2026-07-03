function optionalEnv(key: string): string | undefined {
  return process.env[key] || undefined;
}

function buildEnv() {
  const raw = {
    // LLM access for the Mastra agents (later phases). Optional so the app
    // boots and the data pipeline runs without it.
    OPENAI_API_KEY: optionalEnv("OPENAI_API_KEY"),
    // Free API keys for keyed open-data sources. When absent, the matching
    // connector returns a typed "data gap / key missing" result — never fake data.
    EPC_API_KEY: optionalEnv("EPC_API_KEY"),
    COMPANIES_HOUSE_API_KEY: optionalEnv("COMPANIES_HOUSE_API_KEY"),
    LR_DATA_API_KEY: optionalEnv("LR_DATA_API_KEY"),
    // Local SQLite database for the business model (no external services).
    SQLITE_PATH: optionalEnv("SQLITE_PATH") ?? "data/cpi.db",
    NEXT_PUBLIC_APP_URL: optionalEnv("NEXT_PUBLIC_APP_URL"),
    NODE_ENV: process.env.NODE_ENV ?? "development",
    LOG_LEVEL: optionalEnv("LOG_LEVEL"),
  };

  return {
    ...raw,
    baseUrl: raw.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000",
    isProduction: raw.NODE_ENV === "production",
    isDev: raw.NODE_ENV !== "production",
  } as const;
}

type Env = ReturnType<typeof buildEnv>;

let _env: Env | undefined;

/** Lazy-resolved env — evaluated on first access, not at import time. */
export const env: Env = new Proxy({} as Env, {
  get(_, prop: string) {
    if (!_env) _env = buildEnv();
    return _env[prop as keyof Env];
  },
});
