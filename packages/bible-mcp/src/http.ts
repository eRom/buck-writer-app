import path from "node:path";
import fs from "node:fs";
import { exec } from "node:child_process";
import express from "express";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";

const EMPTY_OBJECT_JSON_SCHEMA = { type: "object" as const };

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function getRegisteredTools(mcpServer: McpServer): Record<string, RegisteredTool> {
  // _registeredTools is TypeScript private (not JS #private), accessible at runtime
  return (mcpServer as unknown as { _registeredTools: Record<string, RegisteredTool> })._registeredTools;
}

function schemaToJsonSchema(inputSchema: unknown): Record<string, unknown> {
  if (!inputSchema) return EMPTY_OBJECT_JSON_SCHEMA;

  // inputSchema is already a ZodObject (wrapped by the SDK's objectFromShape)
  try {
    return z.toJSONSchema(inputSchema as z.ZodType) as Record<string, unknown>;
  } catch {
    return EMPTY_OBJECT_JSON_SCHEMA;
  }
}

function buildToolsList(tools: Record<string, RegisteredTool>) {
  return Object.entries(tools)
    .filter(([, tool]) => tool.enabled)
    .map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: schemaToJsonSchema(tool.inputSchema),
    }));
}

async function callTool(
  tools: Record<string, RegisteredTool>,
  name: string,
  args: Record<string, unknown> | undefined,
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const tool = tools[name];
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Tool "${name}" not found` }],
    };
  }
  if (!tool.enabled) {
    return {
      isError: true,
      content: [{ type: "text", text: `Tool "${name}" is disabled` }],
    };
  }

  // Validate input via Zod if schema exists
  // inputSchema is already a ZodObject (wrapped by the SDK's objectFromShape)
  let parsedArgs: unknown = undefined;
  if (tool.inputSchema) {
    const schema = tool.inputSchema as z.ZodType;
    const parseResult = schema.safeParse(args ?? {});
    if (!parseResult.success) {
      return {
        isError: true,
        content: [{ type: "text", text: `Validation error: ${parseResult.error.message}` }],
      };
    }
    parsedArgs = parseResult.data;
  }

  // Call handler
  const handler = tool.handler as Function;
  const extra = {} as Record<string, unknown>;
  const result = tool.inputSchema
    ? await Promise.resolve(handler(parsedArgs, extra))
    : await Promise.resolve(handler(extra));

  return result;
}

function makeJsonRpcError(id: number | string | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${url}`, (err) => {
    if (err) console.error(`[http] Impossible d'ouvrir le navigateur : ${err.message}`);
  });
}

export interface HttpServerOptions {
  port: number;
  uiDir?: string;
}

export function startHttpServer(
  mcpServer: McpServer,
  _dbPath: string,
  options: HttpServerOptions,
): void {
  const { port, uiDir } = options;
  const app = express();

  app.use(express.json());

  // CORS headers for Vite dev server
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (_req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const tools = getRegisteredTools(mcpServer);

  // JSON-RPC endpoint
  app.post("/mcp", async (req, res) => {
    const body = req.body as JsonRpcRequest;

    if (!body || body.jsonrpc !== "2.0" || !body.method) {
      res.status(400).json(makeJsonRpcError(body?.id ?? null, -32600, "Invalid JSON-RPC request"));
      return;
    }

    const { id, method, params } = body;

    try {
      switch (method) {
        case "initialize": {
          const clientProtocol = (params as { protocolVersion?: string })?.protocolVersion;
          res.json({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: clientProtocol ?? "2025-06-18",
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: "barda-ecrivain-bible", version: "0.1.0" },
            },
          });
          return;
        }

        case "notifications/initialized":
        case "notifications/cancelled":
        case "notifications/roots/list_changed": {
          // Notifications JSON-RPC : pas d'id, pas de reponse
          res.status(204).end();
          return;
        }

        case "ping": {
          res.json({ jsonrpc: "2.0", id, result: {} });
          return;
        }

        case "tools/list": {
          const toolsList = buildToolsList(tools);
          res.json({ jsonrpc: "2.0", id, result: { tools: toolsList } });
          return;
        }

        case "tools/call": {
          const toolName = (params as { name?: string })?.name;
          const toolArgs = (params as { arguments?: Record<string, unknown> })?.arguments;

          if (!toolName) {
            res.json(makeJsonRpcError(id, -32602, "Missing 'name' in params"));
            return;
          }

          const result = await callTool(tools, toolName, toolArgs);
          res.json({ jsonrpc: "2.0", id, result });
          return;
        }

        case "resources/list": {
          res.json({ jsonrpc: "2.0", id, result: { resources: [] } });
          return;
        }

        case "prompts/list": {
          res.json({ jsonrpc: "2.0", id, result: { prompts: [] } });
          return;
        }

        default: {
          res.json(makeJsonRpcError(id, -32601, `Method "${method}" not supported`));
          return;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[http] Error handling ${method}:`, message);
      res.json(makeJsonRpcError(id, -32603, message));
    }
  });

  // Serve static UI files (if directory exists and has content)
  if (uiDir && fs.existsSync(uiDir) && fs.readdirSync(uiDir).length > 0) {
    app.use(express.static(uiDir));
    // SPA fallback — serve index.html for any non-API route
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(uiDir, "index.html"));
    });
    console.error(`[http] UI statique servie depuis ${uiDir}`);
  }

  app.listen(port, "127.0.0.1", () => {
    const url = `http://localhost:${port}`;
    console.error(`[http] Bible UI disponible sur ${url}`);
    openBrowser(url);
  });
}
