import path from "node:path";
import fs from "node:fs";
import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

/**
 * Factory that produces a fresh `McpServer` instance. The Streamable HTTP
 * transport requires one `McpServer` per active transport (per session),
 * hence the factory pattern.
 */
export type McpServerFactory = () => McpServer;

function bearerAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expected = process.env.MCP_SHARED_SECRET;
  if (!expected) {
    next();
    return;
  }
  const header = req.header("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || token !== expected) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  // `url` is built from an env-derived host + a fixed path inside this
  // module — never from request input. Static analysis (eslint-plugin-
  // security/detect-child-process) cannot prove this, so the rule is
  // disabled for this single call.
  // eslint-disable-next-line security/detect-child-process
  exec(`${cmd} ${url}`, (err) => {
    if (err) console.error(`[http] Impossible d'ouvrir le navigateur : ${err.message}`);
  });
}

export interface HttpServerOptions {
  port: number;
  uiDir?: string;
}

/**
 * Express app wrapping bible-mcp with the MCP Streamable HTTP transport on
 * /mcp. Spec-compliant — same endpoint talks to OpenAI's Responses MCP
 * connector, MCP Inspector, and our own SDK-based clients.
 *
 * Stateful sessions : one `{transport, server}` pair per session_id. The
 * first POST with an `initialize` JSON-RPC message mints a session_id and
 * keeps the pair alive until the transport closes (HTTP disconnect or
 * DELETE /mcp).
 *
 * Stateless fallback : clients that POST non-initialize requests without a
 * session_id get a one-shot pair torn down at response end. Works for the
 * legacy bible-ui plain-JSON-RPC client which doesn't negotiate sessions.
 */
export function createHttpApp(
  serverFactory: McpServerFactory,
  uiDir?: string,
): express.Express {
  const app = express();
  app.use(express.json());

  // CORS for the Bible UI hosted on another origin in dev.
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
    );
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  async function createStatefulPair(): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId: string) => {
        transports[sessionId] = transport;
      },
    });
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid && transports[sid]) delete transports[sid];
    };
    const server = serverFactory();
    await server.connect(transport);
    return transport;
  }

  async function createStatelessPair(): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = serverFactory();
    await server.connect(transport);
    return transport;
  }

  app.post("/mcp", bearerAuth, async (req, res) => {
    try {
      const sessionId = req.header("mcp-session-id");
      let transport: StreamableHTTPServerTransport | undefined;
      let stateless = false;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = await createStatefulPair();
      } else {
        transport = await createStatelessPair();
        stateless = true;
      }

      await transport.handleRequest(req, res, req.body);

      if (stateless) {
        res.on("close", () => {
          transport?.close().catch(() => {});
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[http] POST /mcp error:", message);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32603, message },
        });
      }
    }
  });

  app.get("/mcp", bearerAuth, async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Missing or unknown Mcp-Session-Id");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.delete("/mcp", bearerAuth, async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Missing or unknown Mcp-Session-Id");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  if (uiDir && fs.existsSync(uiDir) && fs.readdirSync(uiDir).length > 0) {
    app.use(express.static(uiDir));
    app.get("/{*path}", (_req, res) => {
      // SPA fallback: uiDir is a hardcoded build-time path and "index.html" is a literal.
      // No user input reaches sendFile — path traversal is not possible here.
      // nosemgrep: javascript.express.security.audit.express-res-sendfile.express-res-sendfile
      res.sendFile(path.join(uiDir, "index.html"));
    });
    console.error(`[http] UI statique servie depuis ${uiDir}`);
  }

  return app;
}

export function startHttpServer(
  serverFactory: McpServerFactory,
  _dbPath: string,
  options: HttpServerOptions,
): void {
  const { port, uiDir } = options;
  const app = createHttpApp(serverFactory, uiDir);
  app.listen(port, "127.0.0.1", () => {
    const url = `http://localhost:${port}`;
    console.error(`[http] Bible UI disponible sur ${url}`);
    openBrowser(url);
  });
}
