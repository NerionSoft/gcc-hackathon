#!/usr/bin/env node

/**
 * Starter setup script.
 *
 * Prompts for project identity and first domain/entity names,
 * then performs mechanical renames across the codebase.
 *
 * Run: node scripts/setup.mjs
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readFile, writeFile, rename, readdir, rm, mkdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ============================================
// Prompts
// ============================================

const rl = createInterface({ input: stdin, output: stdout });
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

async function prompt(question, placeholder) {
  // Start the readline question (writes the prompt text, then waits for input)
  const promise = rl.question(`${question}: `);

  if (placeholder) {
    // Write dim placeholder text in the input area, then move cursor back
    stdout.write(`${DIM}${placeholder}${RESET}`);
    stdout.write(`\x1b[${placeholder.length}D`);

    // Clear the dim text on first keypress (any key, including Enter)
    const clear = () => {
      stdout.write("\x1b[K");
      stdin.removeListener("keypress", clear);
    };
    stdin.on("keypress", clear);
  }

  const answer = await promise;
  return answer.trim() || placeholder || "";
}

async function confirm(question, defaultYes = false) {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = await rl.question(`${question} (${hint}): `);
  const val = answer.trim().toLowerCase();
  if (val === "") return defaultYes;
  return val === "y";
}

// ============================================
// String utilities
// ============================================

/** "order" → "Order" */
function pascal(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** "order" → "orders" (naive plural) */
function plural(str) {
  if (str.endsWith("s") || str.endsWith("x") || str.endsWith("z")) return str + "es";
  if (str.endsWith("y") && !["a", "e", "i", "o", "u"].includes(str.at(-2))) {
    return str.slice(0, -1) + "ies";
  }
  return str + "s";
}

// ============================================
// File system helpers
// ============================================

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function replaceInFile(filePath, replacements) {
  let content = await readFile(filePath, "utf-8");
  let changed = false;
  for (const [from, to] of replacements) {
    const regex = new RegExp(from, "g");
    const newContent = content.replace(regex, to);
    if (newContent !== content) {
      content = newContent;
      changed = true;
    }
  }
  if (changed) {
    await writeFile(filePath, content);
  }
  return changed;
}

async function moveFile(from, to) {
  const dir = dirname(to);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await rename(from, to);
}

// ============================================
// Main
// ============================================

async function main() {
  console.log("\n🔧 Platform Starter — Setup\n");

  const projectName = await prompt('Project name (package.json "name")', "my-app");
  const projectDescription = await prompt("Project description");
  const domain = await prompt("First domain (hexagone) name", "billing");
  const entity = await prompt("First entity name", "invoice");

  if (!domain || !entity) {
    console.error("\n✗ Domain and entity names are required.");
    rl.close();
    process.exit(1);
  }

  const Entity = pascal(entity);
  const entities = plural(entity);
  const ENTITY = entity.toUpperCase();

  console.log(`\nWill apply:`);
  console.log(`  package.json name    → "${projectName}"`);
  if (projectDescription) console.log(`  package.json desc    → "${projectDescription}"`);
  console.log(`  example-hexagone/    → src/${domain}/`);
  console.log(`  example / Example    → ${entity} / ${Entity}`);
  console.log(`  api/example-hexagone/ → api/${domain}/v1/${entities}/`);
  console.log(`  example.module.ts    → ${domain}.module.ts`);
  console.log("");

  if (!(await confirm("Proceed?", true))) {
    console.log("Aborted.");
    rl.close();
    return;
  }

  // --- 1. Package.json ---
  console.log("\n→ Updating package.json...");
  const pkgPath = join(ROOT, "package.json");
  let pkgContent = await readFile(pkgPath, "utf-8");

  // Replace name in place
  pkgContent = pkgContent.replace(/"name": ".*?"/, `"name": "${projectName}"`);

  // Insert or replace description right after the name line
  if (projectDescription) {
    const descLine = `  "description": "${projectDescription}",`;
    if (pkgContent.includes('"description"')) {
      pkgContent = pkgContent.replace(
        /"description": ".*?"/,
        `"description": "${projectDescription}"`,
      );
    } else {
      pkgContent = pkgContent.replace(/("name": ".*?",?\n)/, `$1${descLine}\n`);
    }
  }

  await writeFile(pkgPath, pkgContent);

  // --- 2. Rename directory ---
  console.log("→ Renaming example-hexagone/ to " + domain + "/...");
  const oldDomainDir = join(ROOT, "src", "example-hexagone");
  const newDomainDir = join(ROOT, "src", domain);
  if (existsSync(newDomainDir)) {
    console.error(`\n✗ Directory src/${domain}/ already exists. Aborting.`);
    rl.close();
    process.exit(1);
  }
  await rename(oldDomainDir, newDomainDir);

  // --- 3. Rename files within the domain directory ---
  console.log("→ Renaming files...");
  const domainFiles = await walk(newDomainDir);
  for (const filePath of domainFiles) {
    const name = basename(filePath);
    let newName = name
      .replace(/^example\.module/, `${domain}.module`)
      .replace(/Example/g, Entity)
      .replace(/example/g, entity);
    if (newName !== name) {
      await moveFile(filePath, join(dirname(filePath), newName));
    }
  }

  // --- 4. Rename API route directory ---
  console.log("→ Moving API route...");
  const oldApiDir = join(ROOT, "src", "app", "api", "example-hexagone");
  const newApiDir = join(ROOT, "src", "app", "api", domain);
  if (existsSync(oldApiDir)) {
    // Rename the top-level hexagone dir; inner structure (v1/examples/) is
    // handled by the content sed pass which rewrites "examples" → entities.
    await rename(oldApiDir, newApiDir);
    // Rename the entity sub-directory inside v1/
    const oldEntityDir = join(newApiDir, "v1", "examples");
    const newEntityDir = join(newApiDir, "v1", entities);
    if (existsSync(oldEntityDir) && oldEntityDir !== newEntityDir) {
      await rename(oldEntityDir, newEntityDir);
    }
  }

  // --- 5. Content replacements ---
  console.log("→ Replacing content in files...");

  // Order matters: longer/more specific patterns first
  const replacements = [
    // Imports & path references
    ["example-hexagone", domain],
    // Module file reference
    ["example\\.module", `${domain}.module`],
    // PascalCase (class names, types, Prisma model)
    ["ExampleStatus", `${Entity}Status`],
    ["ExampleMapper", `${Entity}Mapper`],
    ["CreateExampleDto", `Create${Entity}Dto`],
    ["CreateExampleDtoSchema", `Create${Entity}DtoSchema`],
    ["Example", Entity],
    // Error code constants (UPPER_SNAKE)
    ["EXAMPLE_NOT_FOUND", `${ENTITY}_NOT_FOUND`],
    ["EXAMPLE_INVALID_STATE_TRANSITION", `${ENTITY}_INVALID_STATE_TRANSITION`],
    ["EXAMPLE_INVALID", `${ENTITY}_INVALID`],
    // camelCase (variables, file references)
    ["exampleErrorMappings", `${entity}ErrorMappings`],
    ["createExampleUseCase", `create${Entity}UseCase`],
    ["examples", entities],
    ["example", entity],
    // Prisma section comment
    [`${Entity} hexagone`, `${Entity} (${domain})`],
  ];

  // Files to process: domain dir + external files
  const targetFiles = [
    ...(await walk(newDomainDir)),
    join(ROOT, "src", "instrumentation.ts"),
    join(ROOT, "prisma", "schema.prisma"),
    ...(existsSync(newApiDir) ? await walk(newApiDir) : []),
  ];

  let changedCount = 0;
  for (const filePath of targetFiles) {
    if (filePath.endsWith(".ts") || filePath.endsWith(".prisma")) {
      const changed = await replaceInFile(filePath, replacements);
      if (changed) changedCount++;
    }
  }
  console.log(`  ${changedCount} files updated.`);

  // --- 6. Done ---
  console.log("\n✓ Setup complete.\n");
  console.log("Next steps:");
  console.log("  1. Review the generated code in src/" + domain + "/");
  console.log("  2. Review and address each TODO(starter)");
  console.log("  3. Update prisma/schema.prisma fields for your entity");
  console.log("  4. Configure .env from .env.example");
  console.log("  5. Run: pnpm install && pnpm prisma generate");
  console.log("");

  // --- 7. Self-deletion ---
  if (await confirm("Delete this setup script?", true)) {
    const scriptPath = fileURLToPath(import.meta.url);
    await rm(scriptPath);
    console.log("  Deleted scripts/setup.mjs");
  }

  rl.close();
}

main().catch((err) => {
  console.error("\n✗ Setup failed:", err.message);
  process.exit(1);
});
