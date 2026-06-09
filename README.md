# photos-mcp-server

Per-app MCP server for macOS Photos. Exposes Photos library operations to LLM clients via the Model Context Protocol, using hardcoded AppleScript only — no shell script access.

## Tools

| Tool | Description |
|------|-------------|
| `photos_list_albums` | List all albums with item counts |
| `photos_get_album_photos` | List photos/videos in an album (id, filename, date) |
| `photos_search_photos` | Search library by keyword |
| `photos_get_photo_info` | Get metadata for a single photo (filename, date, title, description, keywords, location) |
| `photos_export_photo` | Export a photo to a folder on disk |
| `photos_open_photo` | Open and spotlight a photo in Photos app |

## Requirements

- macOS (Photos app)
- Node.js ≥ 18
- Photos library access granted to Terminal / your MCP client

## Setup

```bash
git clone https://github.com/liheng-personal/photos-mcp-server
cd photos-mcp-server
npm install
npm run build
```

## Claude Desktop config

```json
{
  "mcpServers": {
    "photos": {
      "command": "node",
      "args": ["/path/to/photos-mcp-server/dist/index.js"]
    }
  }
}
```

## Security

All AppleScript is hardcoded in the source. No user-supplied content is passed to `osascript`. `do shell script` is never used.
