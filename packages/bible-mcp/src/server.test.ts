import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createHttpApp } from "./http.js";
import { createServer } from "./mcp-server.js";
import { getDb } from "./db/index.js";

let server: Server;
let baseUrl: string;
let dbFile: string;

// MCP Streamable HTTP transport requires BOTH content types in Accept.
const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

async function mcpPost(body: object, sessionId?: string): Promise<Response> {
  const headers: Record<string, string> = { ...MCP_HEADERS };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Parses the transport's response — it can be either plain JSON or a
 * single-event SSE block. In both cases we extract the JSON-RPC payload.
 */
async function mcpParse(res: Response): Promise<{ result?: unknown; error?: unknown }> {
  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";
  if (ct.startsWith("application/json")) {
    return JSON.parse(text) as { result?: unknown; error?: unknown };
  }
  // SSE: lines "event: message\n" + "data: {...}\n\n"
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      return JSON.parse(line.slice(6)) as { result?: unknown; error?: unknown };
    }
  }
  throw new Error(`Unexpected body shape: ${text.slice(0, 200)}`);
}

beforeAll(async () => {
  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.MCP_SHARED_SECRET; // disable bearer for tests
  dbFile = path.join(os.tmpdir(), `bible-test-${Date.now()}.db`);
  const dbInstance = getDb(dbFile);
  const app = createHttpApp(() => createServer(dbInstance, dbFile));
  server = app.listen(0) as Server;
  await new Promise<void>((r) => server.once("listening", r));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  server.close();
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
});

describe("bible-mcp HTTP server (Streamable HTTP transport)", () => {
  it("initialize returns server info and capabilities", async () => {
    const res = await mcpPost({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });
    expect(res.status).toBe(200);
    const body = (await mcpParse(res)) as {
      result: { serverInfo: { name: string }; capabilities: unknown };
    };
    expect(body.result.serverInfo.name).toBe("bible-ecrivain");
    expect(body.result.capabilities).toBeDefined();
  });

  it("tools/list returns the expected tool set (stateless flow)", async () => {
    const res = await mcpPost({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(res.status).toBe(200);
    const body = (await mcpParse(res)) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(body.result.tools.length).toBeGreaterThan(30);
    const names = body.result.tools.map((t) => t.name);
    expect(names).toContain("search_fulltext");
    expect(names).toContain("create_character");
  });

  it("tools/call search_fulltext on empty DB returns a valid result", async () => {
    const res = await mcpPost({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "search_fulltext", arguments: { query: "bob" } },
    });
    expect(res.status).toBe(200);
    const body = await mcpParse(res);
    expect(body.result).toBeDefined();
  });

  it("ping method returns empty result", async () => {
    const res = await mcpPost({ jsonrpc: "2.0", id: 4, method: "ping" });
    expect(res.status).toBe(200);
    const body = await mcpParse(res);
    expect(body.result).toBeDefined();
  });

  it("rejects requests missing Accept header (spec-compliant 406)", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "ping" }),
    });
    expect(res.status).toBe(406);
  });
});

describe("bible-mcp HTTP server — Bearer auth", () => {
  let authServer: Server;
  let authBaseUrl: string;
  let authDbFile: string;

  beforeAll(async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.MCP_SHARED_SECRET = "test-secret-xyz";
    authDbFile = path.join(os.tmpdir(), `bible-test-auth-${Date.now()}.db`);
    const dbInstance = getDb(authDbFile);
    const app = createHttpApp(() => createServer(dbInstance, authDbFile));
    authServer = app.listen(0) as Server;
    await new Promise<void>((r) => authServer.once("listening", r));
    const addr = authServer.address() as AddressInfo;
    authBaseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(() => {
    authServer.close();
    delete process.env.MCP_SHARED_SECRET;
    if (fs.existsSync(authDbFile)) fs.unlinkSync(authDbFile);
  });

  it("rejects without Bearer (401)", async () => {
    const res = await fetch(`${authBaseUrl}/mcp`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts with correct Bearer (200)", async () => {
    const res = await fetch(`${authBaseUrl}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: "Bearer test-secret-xyz" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects with wrong Bearer (401)", async () => {
    const res = await fetch(`${authBaseUrl}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: "Bearer WRONG" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" }),
    });
    expect(res.status).toBe(401);
  });
});
