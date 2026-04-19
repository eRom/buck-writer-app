import * as fsp from 'node:fs/promises';
import * as pathModule from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Skill } from '../services/skills.js';
import { assertSafePath } from '../utils/path-safe.js';
import { validateShellCommand, listAllowedBins } from '../lib/kill-switch.js';
import type { ToolDefinition } from '../lib/openai.js';
import type { McpClient } from '../services/mcp-client.js';

const execFileAsync = promisify(execFile);

const SHELL_TIMEOUT_MS = 30_000;
const SHELL_MAX_BUFFER = 100 * 1024; // 100KB
const SAFE_PATH = '/usr/local/bin:/usr/bin:/bin';

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export function buildToolDefinitions(
  workspaceDir: string | undefined,
  skills: Map<string, Skill> | undefined,
  mcpClient: McpClient | undefined,
): ToolDefinition[] {
  const defs: ToolDefinition[] = [];

  if (workspaceDir) {
    defs.push(
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read the content of a file in the workspace',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_directory',
          description: 'List files and directories at a given path in the workspace',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative path, defaults to workspace root' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_file',
          description: 'Create or overwrite a file in the workspace. The user will be asked for confirmation before execution.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['path', 'content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_file',
          description: 'Delete a file in the workspace. The user will be asked for confirmation before execution.',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'shell_execute',
          description: `Execute a single command in the workspace. Strict whitelist: only ${listAllowedBins().join(', ')} are allowed. Shell metacharacters (|, &, ;, $, \`, >, <, \\) are forbidden — no pipes, no redirections, no chaining. For file deletion use delete_file.`,
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'The shell command to execute' },
              cwd: { type: 'string', description: 'Working directory (relative to workspace)' },
            },
            required: ['command'],
          },
        },
      },
    );
  }

  if (skills && skills.size > 0) {
    const list = [...skills.values()].map((s) => `${s.name}: ${s.description}`).join('; ');
    defs.push({
      type: 'function',
      function: {
        name: 'activate_skill',
        description: `Activate a skill to get its full instructions. Available skills: ${list}`,
        parameters: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      },
    });
  }

  if (mcpClient && mcpClient.isHealthy()) {
    for (const tool of mcpClient.cachedTools()) {
      defs.push({
        type: 'function',
        function: {
          name: `bible_${tool.name}`,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      });
    }
  }

  return defs;
}

export function buildToolHandlers(
  workspaceDir: string | undefined,
  skills: Map<string, Skill> | undefined,
  mcpClient: McpClient | undefined,
): Record<string, ToolHandler> {
  const handlers: Record<string, ToolHandler> = {};

  if (workspaceDir) {
    const wd = workspaceDir;

    handlers.read_file = async ({ path: filePath }) => {
      try {
        const absPath = await assertSafePath(wd, String(filePath));
        const stat = await fsp.stat(absPath);
        if (stat.isDirectory()) return { error: 'path is a directory, use list_directory instead' };
        if (stat.size > 1024 * 1024) return { error: 'file too large (max 1MB for context)' };
        const content = await fsp.readFile(absPath, 'utf8');
        return { content, path: filePath };
      } catch (err) {
        if (err instanceof Error && 'status' in err) return { error: 'path outside workspace' };
        return { error: `file not found: ${filePath}` };
      }
    };

    handlers.list_directory = async ({ path: dirPath }) => {
      try {
        const absPath = dirPath
          ? await assertSafePath(wd, String(dirPath))
          : wd;
        const entries = await fsp.readdir(absPath, { withFileTypes: true });
        return {
          entries: entries
            .filter((e) => e.name !== '.attachments')
            .map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })),
        };
      } catch {
        return { error: `directory not found: ${dirPath ?? '/'}` };
      }
    };

    handlers.create_file = async ({ path: filePath, content }) => {
      const fp = String(filePath);
      if (fp.startsWith('prompts/') || fp === 'prompts') {
        return { error: 'cannot write to prompts/ directory (reserved)' };
      }
      try {
        const absPath = await assertSafePath(wd, fp);
        await fsp.mkdir(pathModule.dirname(absPath), { recursive: true });
        await fsp.writeFile(absPath, String(content ?? ''), 'utf8');
        return { ok: true, path: filePath };
      } catch {
        return { error: `failed to create file: ${filePath}` };
      }
    };

    handlers.delete_file = async ({ path: filePath }) => {
      try {
        const absPath = await assertSafePath(wd, String(filePath));
        await fsp.rm(absPath, { recursive: true });
        return { ok: true, deleted: filePath };
      } catch {
        return { error: `failed to delete: ${filePath}` };
      }
    };

    handlers.shell_execute = async ({ command, cwd }) => {
      const cmd = String(command);
      const validation = validateShellCommand(cmd);
      if (!validation.ok) {
        return { error: validation.error, status: 'blocked' as const };
      }
      let resolvedCwd = wd;
      if (cwd) {
        try {
          resolvedCwd = await assertSafePath(wd, String(cwd));
        } catch {
          return { error: `invalid cwd: ${cwd}` };
        }
      }
      const [bin, ...rest] = validation.argv;
      try {
        const { stdout, stderr } = await execFileAsync(bin, rest, {
          cwd: resolvedCwd,
          timeout: SHELL_TIMEOUT_MS,
          maxBuffer: SHELL_MAX_BUFFER,
          env: { PATH: SAFE_PATH, HOME: '/tmp', TERM: 'dumb' },
        });
        return {
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: 0,
          killed: false,
          truncated: false,
        };
      } catch (err: unknown) {
        const e = err as { killed?: boolean; code?: number; stdout?: string; stderr?: string; message?: string };
        const truncated = e.message?.includes('maxBuffer') ?? false;
        return {
          stdout: e.stdout ?? '',
          stderr: e.stderr ?? '',
          exitCode: e.code ?? 1,
          killed: e.killed ?? false,
          truncated,
        };
      }
    };
  }

  if (skills) {
    handlers.activate_skill = async ({ name }) => {
      const skill = skills.get(String(name));
      if (!skill) return { error: `skill not found: ${name}` };
      return { name: skill.name, instructions: skill.body };
    };
  }

  if (mcpClient) {
    for (const tool of mcpClient.cachedTools()) {
      const toolName = tool.name;
      handlers[`bible_${toolName}`] = async (args) => {
        try {
          return await mcpClient.callTool(toolName, args as unknown);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          return { error: `bible-mcp call failed: ${msg}` };
        }
      };
    }
  }

  return handlers;
}
