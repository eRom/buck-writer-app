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

beforeAll(async () => {
  process.env.OPENAI_API_KEY = "sk-test";
  dbFile = path.join(os.tmpdir(), `bible-test-${Date.now()}.db`);
  const dbInstance = getDb(dbFile);
  const mcp = createServer(dbInstance, dbFile);
  const app = createHttpApp(mcp);
  server = app.listen(0) as Server;
  await new Promise<void>((r) => server.once("listening", r));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  server.close();
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
});

describe("bible-mcp HTTP server", () => {
  it("tools/list returns the expected tool set", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.length).toBeGreaterThan(30);
    const names = body.result.tools.map((t) => t.name);
    expect(names).toContain("search_fulltext");
    expect(names).toContain("create_character");
  });

  it("tools/call search_fulltext on empty DB returns a valid result", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "search_fulltext", arguments: { query: "bob" } },
      }),
    });
    const body = (await res.json()) as { result: unknown };
    expect(body.result).toBeDefined();
  });

  it("ping method returns empty result", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: unknown };
    expect(body.result).toBeDefined();
  });

  it("initialize returns server info and capabilities", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "initialize",
        params: { protocolVersion: "2024-11-05" },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { serverInfo: { name: string }; capabilities: unknown };
    };
    expect(body.result.serverInfo.name).toBe("barda-ecrivain-bible");
    expect(body.result.capabilities).toBeDefined();
  });
});
