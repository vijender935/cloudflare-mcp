# Cloudflare MCP – ai-images-pilot

Remote **Model Context Protocol (MCP)** server that exposes your existing **ai-images-pilot** Cloudflare Worker as a set of tools any MCP client (Claude, Cursor, Windsurf, Workers AI Playground, etc.) can call.

## What this connects to

Your account already has:

| Resource | Name / ID |
|----------|-----------|
| Worker   | `ai-images-pilot` |
| D1       | `ai-images-catalog` |
| R2       | `ai-images` |
| Vectorize| `ai-images-index` |
| Bindings | `AI`, `DB`, `IMAGES`, `VECTORIZE` |

Worker endpoints wrapped by this MCP server:

| MCP Tool | Upstream | Description |
|----------|----------|-------------|
| `health` | `GET /` or `/health` | Worker status + binding checks |
| `list_images` | `GET /images` | Paginated D1 catalog (filter by status) |
| `search_images` | `GET /search?q=` | Semantic search (Vectorize + D1) |
| `process_image` | `POST /process` | Vision describe → embed → store |
| `list_r2_objects` | `GET /r2` | Raw R2 listing helper |

## Quick start

```bash
# 1. Install
npm install

# 2. (Optional) set the upstream Worker URL
#    Default is already set in wrangler.toml
#    AI_IMAGES_WORKER_URL = "https://ai-images-pilot.vijender935.workers.dev"

# 3. Local development
npm run dev

# 4. Deploy
npm run deploy
```

After deploy the MCP endpoint will be:

```
https://cloudflare-mcp.<your-subdomain>.workers.dev/mcp
```

## Connect an MCP client

### Claude Desktop / Cursor / Windsurf (remote)

```json
{
  "mcpServers": {
    "cloudflare-mcp": {
      "url": "https://cloudflare-mcp.vijender935.workers.dev/mcp"
    }
  }
}
```

### Workers AI Playground

1. Open https://playground.ai.cloudflare.com/
2. Under **MCP Servers** paste the `/mcp` URL
3. Click **Connect**

### Local proxy (if client only supports stdio)

```bash
npx -y mcp-remote@latest https://cloudflare-mcp.vijender935.workers.dev/mcp
```

## Example prompts you can give the agent

- “Check the health of the ai-images worker”
- “List the 10 most recent ready images”
- “Search for images that look like summer street style”
- “Process the next pending image”
- “Show me what is currently in the R2 bucket”

## Architecture

```
MCP Client  →  /mcp  →  this Worker (cloudflare-mcp)
                              │
                              ▼  HTTP
                     ai-images-pilot Worker
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
           Workers AI      D1 catalog     R2 + Vectorize
```

## Customisation

- Change the upstream URL via the `AI_IMAGES_WORKER_URL` var in `wrangler.toml` or the Cloudflare dashboard.
- Add more tools by editing `src/index.ts` (follow the existing `server.tool(...)` pattern).
- For production, consider switching from public HTTP to a **service binding** to the `ai-images-pilot` Worker (zero latency, no public exposure).

## License

MIT
