import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Engine tests run against a throwaway SQLite file (never data/cpi.db) and
 * with no LLM configured, so every code path under test is deterministic.
 * Runs before test-file imports (vitest setupFiles), i.e. before the lazy
 * env/config singletons are built.
 */
process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), "cpi-test-")), "test.db");
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_BASE_URL;
delete process.env.OPENAI_MODEL;
