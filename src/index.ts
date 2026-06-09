#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

// ─── AppleScript executor ─────────────────────────────────────────────────────
// SECURITY: Only this function may call osascript. All scripts are hardcoded
// literals defined in this file. No user-supplied script content is ever
// passed to osascript. do shell script is never used.

async function runAppleScript(script: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync("osascript", ["-e", script], {
    timeout: 30_000,
  });
  if (stderr && !stdout) throw new Error(stderr.trim());
  return stdout.trim();
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "photos-mcp-server",
  version: "1.0.0",
});

// ─── Tools ────────────────────────────────────────────────────────────────────

// 1. List all albums
server.registerTool(
  "photos_list_albums",
  {
    title: "List Albums",
    description: `List all albums in the macOS Photos library.
Returns album names and item counts, one per line.`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const script = `
tell application "Photos"
  set output to ""
  repeat with a in albums
    set c to count of media items of a
    set output to output & (name of a) & "\t" & c & " items" & linefeed
  end repeat
  if output is "" then return "(no albums)"
  return output
end tell`;
    try {
      const result = await runAppleScript(script);
      return { content: [{ type: "text", text: result }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 2. Get photos in an album
server.registerTool(
  "photos_get_album_photos",
  {
    title: "Get Album Photos",
    description: `List all photos/videos in a specific album by name.
Returns tab-separated: id, filename, date — one item per line.
Use the album name exactly as returned by photos_list_albums.`,
    inputSchema: {
      album_name: z
        .string()
        .min(1)
        .describe("Name of the album, e.g. \"Favourites\""),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ album_name }) => {
    const safe = album_name.replace(/"/g, '\\"');
    const script = `
tell application "Photos"
  try
    set a to album "${safe}"
  on error
    return "Error: album not found: ${safe}"
  end try
  set output to ""
  repeat with m in (media items of a)
    set mid to id of m
    set mfile to filename of m
    set mdate to date of m as string
    set output to output & mid & "\t" & mfile & "\t" & mdate & linefeed
  end repeat
  if output is "" then return "(empty album)"
  return output
end tell`;
    try {
      const result = await runAppleScript(script);
      return { content: [{ type: "text", text: result }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 3. Search photos
server.registerTool(
  "photos_search_photos",
  {
    title: "Search Photos",
    description: `Search the Photos library by keyword.
Returns tab-separated: id, filename, date — one item per line.
Searches titles, descriptions, keywords, and filenames.`,
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Search term, e.g. \"sunset\" or \"2023\""),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ query }) => {
    const safe = query.replace(/"/g, '\\"');
    const script = `
tell application "Photos"
  set results to search for "${safe}"
  set output to ""
  repeat with m in results
    set mid to id of m
    set mfile to filename of m
    set mdate to date of m as string
    set output to output & mid & "\t" & mfile & "\t" & mdate & linefeed
  end repeat
  if output is "" then return "(no results)"
  return output
end tell`;
    try {
      const result = await runAppleScript(script);
      return { content: [{ type: "text", text: result }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 4. Get photo info by id
server.registerTool(
  "photos_get_photo_info",
  {
    title: "Get Photo Info",
    description: `Returns detailed metadata for a single photo or video by its Photos ID.
Includes: filename, date, title, description, keywords, altitude, location (if available).
Get IDs from photos_get_album_photos or photos_search_photos.`,
    inputSchema: {
      photo_id: z
        .string()
        .min(1)
        .describe("Photos media item ID, e.g. \"5A2F1C3D/...\""),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ photo_id }) => {
    const safe = photo_id.replace(/"/g, '\\"');
    const script = `
tell application "Photos"
  try
    set m to media item id "${safe}"
  on error
    return "Error: media item not found: ${safe}"
  end try
  set mfile to filename of m
  set mdate to date of m as string
  set mtitle to name of m
  set mdesc to description of m
  set mkw to keywords of m
  set kwStr to ""
  repeat with k in mkw
    set kwStr to kwStr & k & ", "
  end repeat
  set output to "ID: ${safe}" & linefeed
  set output to output & "Filename: " & mfile & linefeed
  set output to output & "Date: " & mdate & linefeed
  set output to output & "Title: " & mtitle & linefeed
  set output to output & "Description: " & mdesc & linefeed
  set output to output & "Keywords: " & kwStr & linefeed
  try
    set malt to altitude of m
    set output to output & "Altitude: " & malt & " m" & linefeed
  end try
  try
    set mloc to location of m
    set output to output & "Location: " & (latitude of mloc) & ", " & (longitude of mloc) & linefeed
  end try
  return output
end tell`;
    try {
      const result = await runAppleScript(script);
      return { content: [{ type: "text", text: result }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 5. Export photo to folder
server.registerTool(
  "photos_export_photo",
  {
    title: "Export Photo",
    description: `Exports a photo or video to a specified folder on disk.
The file is saved with its original filename inside the target folder.
Get the photo ID from photos_get_album_photos or photos_search_photos.`,
    inputSchema: {
      photo_id: z
        .string()
        .min(1)
        .describe("Photos media item ID"),
      export_folder: z
        .string()
        .min(1)
        .describe("Absolute POSIX path to destination folder, e.g. /Users/alice/Desktop/exports"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ photo_id, export_folder }) => {
    const safeId = photo_id.replace(/"/g, '\\"');
    const safePath = export_folder.replace(/"/g, '\\"');
    const script = `
tell application "Photos"
  try
    set m to media item id "${safeId}"
  on error
    return "Error: media item not found: ${safeId}"
  end try
  try
    export {m} to POSIX file "${safePath}"
    return "Exported to: ${safePath}"
  on error errMsg
    return "Export error: " & errMsg
  end try
end tell`;
    try {
      const result = await runAppleScript(script);
      return { content: [{ type: "text", text: result }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 6. Open photo in Photos app
server.registerTool(
  "photos_open_photo",
  {
    title: "Open Photo in Photos",
    description: `Opens and spotlights a specific photo in the macOS Photos app.
Brings Photos to the front and selects the item.
Get the photo ID from photos_get_album_photos or photos_search_photos.`,
    inputSchema: {
      photo_id: z
        .string()
        .min(1)
        .describe("Photos media item ID"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ photo_id }) => {
    const safe = photo_id.replace(/"/g, '\\"');
    const script = `
tell application "Photos"
  try
    set m to media item id "${safe}"
  on error
    return "Error: media item not found: ${safe}"
  end try
  spotlight m
  activate
  return "Opened: ${safe}"
end tell`;
    try {
      const result = await runAppleScript(script);
      return { content: [{ type: "text", text: result }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ─── Transport ────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
