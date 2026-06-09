#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ─── AppleScript executor ─────────────────────────────────────────────────────
// SECURITY: Only this function may call osascript. All scripts are hardcoded
// literals defined in this file. No user-supplied script content is ever
// passed to osascript. do shell script is never used.
//
// WHY TEMP FILE: osascript -e mangles non-ASCII (CJK, accented chars) when the
// string is passed inline. Writing to a UTF-8 file and running osascript
// against the path is the reliable cross-locale fix.

async function runAppleScript(script: string): Promise<string> {
  const tmpPath = join(
    tmpdir(),
    `photos-mcp-${randomBytes(8).toString("hex")}.applescript`
  );
  try {
    await writeFile(tmpPath, script, "utf8");
    const { stdout, stderr } = await execFileAsync("osascript", [tmpPath], {
      timeout: 30_000,
      env: { ...process.env, LANG: "en_US.UTF-8" },
    });
    if (stderr && !stdout) throw new Error(stderr.trim());
    return stdout.trim();
  } finally {
    await unlink(tmpPath).catch(() => {}); // best-effort cleanup
  }
}

// Escape a string for safe interpolation into an AppleScript double-quoted string.
// Must escape backslashes first, then double-quotes.
function asEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "photos-mcp-server",
  version: "1.0.0",
});

// ─── Tools ────────────────────────────────────────────────────────────────────

// (no tools — rebuild from requirements)

// ─── Transport ────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
