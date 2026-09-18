/**
 * Cloudflare MCP Server
 * Exposes the ai-images-pilot Worker API as MCP tools.
 *
 * Tools:
 *  - health          → GET /
 *  - list_images     → GET /images
 *  - search_images   → GET /search?q=
 *  - process_image   → POST /process
 *  - list_r2_objects → GET /r2
 *
 * Deploy: npm run deploy
 * Connect clients to: https://cloudflare-mcp.<your-subdomain>.workers.dev/mcp
 */

import { createLegacyMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface Env {
  /** Cloudflare Service Binding to the ai-images-pilot Worker. */
  AI_IMAGES: Fetcher;
}

/**
 * Helper: call the upstream ai-images-pilot Worker through a Cloudflare
 * Service Binding. This removes the dependency on a public Worker URL.
 */
async function callWorker(
  worker: Fetcher,
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const request = new Request(
    `https://ai-images-pilot.internal${normalizedPath}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    }
  );

  const res = await worker.fetch(request);

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(
      `Worker responded ${res.status}: ${data?.error || text || res.statusText}`
    );
  }
  return data;
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "cloudflare-mcp",
    version: "1.0.0",
  });

  const worker = env.AI_IMAGES;

  server.tool(
    "health",
    "Check health / status of the ai-images-pilot Worker and its bindings (AI, DB, R2, Vectorize).",
    {},
    async () => {
      const data = await callWorker(worker, "/health");
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "list_images",
    "List images from the D1 catalog. Supports limit, offset and optional status filter (pending|processing|ready|error).",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max number of images to return (default 20, max 100)"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Offset for pagination (default 0)"),
      status: z
        .enum(["pending", "processing", "ready", "error"])
        .optional()
        .describe("Filter by processing status"),
    },
    async ({ limit, offset, status }) => {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set("limit", String(limit));
      if (offset !== undefined) params.set("offset", String(offset));
      if (status) params.set("status", status);

      const qs = params.toString() ? `?${params.toString()}` : "";
      const data = await callWorker(worker, `/images${qs}`);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "search_images",
    "Semantic search over the image catalog using Vectorize + D1 enrichment. Provide a natural language query.",
    {
      q: z.string().min(1).describe("Natural language search query"),
      topK: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Number of nearest neighbors to return (default 5, max 20)"),
    },
    async ({ q, topK }) => {
      const params = new URLSearchParams({ q });
      if (topK !== undefined) params.set("topK", String(topK));

      const data = await callWorker(worker, `/search?${params.toString()}`);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "process_image",
    "Process an image: describe it with Llama 3.2 Vision, embed the description, store in Vectorize + D1. Pass an R2 key or leave empty to auto-pick a pending image.",
    {
      r2_key: z
        .string()
        .optional()
        .describe(
          "R2 object key to process. If omitted, the worker picks a pending image."
        ),
      id: z.string().optional().describe("Existing D1 image id (optional)"),
    },
    async ({ r2_key, id }) => {
      const body: Record<string, string> = {};
      if (r2_key) body.r2_key = r2_key;
      if (id) body.id = id;

      const data = await callWorker(worker, "/process", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "list_r2_objects",
    "List raw objects currently stored in the ai-images R2 bucket (helper for discovering unprocessed images).",
    {},
    async () => {
      const data = await callWorker(worker, "/r2");
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Create a fresh server instance per request so tools close over the correct env
    const server = createServer(env);
    const handler = createLegacyMcpHandler(server);
    return handler(request, env, ctx);
  },
};
