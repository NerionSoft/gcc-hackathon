import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Every test run gets its own throw-away disk cache directory so tests never
// read stale cached responses from a previous run, and never write into the
// repo's real data/cache/.
process.env.DATA_CACHE_DIR = mkdtempSync(path.join(tmpdir(), "terravista-cache-"));
