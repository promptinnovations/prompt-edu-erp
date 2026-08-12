#!/usr/bin/env node
/**
 * PROMPT EDU ERP — build-time check (ARCHITECTURE.md §X.1: "a build-time
 * check fails CI if a secret-looking env var is referenced from client
 * code"). Walks every .ts/.tsx source file; for any file whose FIRST
 * non-comment, non-blank statement is a "use client" directive, flags any
 * `process.env.<NAME>` reference where NAME does not start with
 * `NEXT_PUBLIC_` — that prefix is the one Next.js contract for "safe to
 * ship to the browser" (everything else is either dead code that will
 * evaluate to undefined once bundled, or a real secret-leak bug).
 *
 * Usage: node scripts/check-no-client-secrets.mjs
 * Exit code 1 (and a listing of every offending file:line) if anything is
 * found; exit code 0 otherwise. Wired into `npm run verify` and CI
 * (.github/workflows/ci.yml).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "services", "modules", "types", "i18n"];
const IGNORE_DIR_NAMES = new Set(["node_modules", ".next", "out", "build", ".git"]);
const ENV_REF_PATTERN = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;

function isClientFile(source) {
  // Match the FIRST real statement only (a "use client" that appears deep
  // in a file, e.g. inside a template string or comment, doesn't count —
  // matches how Next.js itself only honors the directive at the top).
  const firstStatement = source
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("/*") && !l.startsWith("*"));
  return firstStatement === '"use client";' || firstStatement === "'use client';" ||
         firstStatement === '"use client"' || firstStatement === "'use client'";
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

let violations = [];
for (const dir of SOURCE_DIRS) {
  const full = join(ROOT, dir);
  try {
    statSync(full);
  } catch {
    continue; // directory doesn't exist — skip rather than error
  }
  for (const file of walk(full)) {
    const source = readFileSync(file, "utf8");
    if (!isClientFile(source)) continue;

    const lines = source.split("\n");
    lines.forEach((line, idx) => {
      let match;
      ENV_REF_PATTERN.lastIndex = 0;
      while ((match = ENV_REF_PATTERN.exec(line))) {
        const varName = match[1];
        if (!varName.startsWith("NEXT_PUBLIC_")) {
          violations.push({ file: relative(ROOT, file), line: idx + 1, varName });
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error("Secret-leak check FAILED — non-NEXT_PUBLIC_ env var(s) referenced from client (\"use client\") code:\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — process.env.${v.varName}`);
  }
  console.error(
    "\nOnly NEXT_PUBLIC_-prefixed env vars are safe to reference from client code (ARCHITECTURE.md §X.1)." +
      " Move this read into a server component/action, or rename with the NEXT_PUBLIC_ prefix if it is genuinely non-sensitive."
  );
  process.exit(1);
}

console.log(`Secret-leak check passed — no non-NEXT_PUBLIC_ env vars referenced from client code.`);
