# M3.5 — Shell Tool + Approval System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic tool approval system and a shell_execute tool, so destructive tool calls require explicit user consent before execution.

**Architecture:** Pause/Resume pattern — tools requiring approval return a `requires_approval` result instead of executing. The stream ends, the client shows an approval UI, and a new request carries the user's decision. The API stays stateless.

**Tech Stack:** AI SDK v6 (tool wrappers), child_process (shell), Drizzle ORM (migration), React (ApprovalBlock, TerminalBlock)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `packages/api/src/lib/kill-switch.ts` | Regex-based destructive command blocker |
| Create | `packages/api/src/lib/kill-switch.test.ts` | Kill switch unit tests |
| Create | `packages/web/src/components/chat/terminal-block.tsx` | Terminal output display component |
| Modify | `packages/shared/src/schemas/workspace.ts` | Add ToolMeta type, ToolApprovalRequest schema |
| Modify | `packages/shared/src/index.ts` | Export new types |
| Modify | `packages/api/src/db/schema.ts:85-99` | Add toolMeta column to messages |
| Create | `packages/api/migrations/0003_add_tool_meta.sql` | Migration for toolMeta column |
| Modify | `packages/api/src/routes/chat.ts:33-125` | Add buildShellTool, wrapToolsWithApproval |
| Modify | `packages/api/src/routes/chat.ts:128-491` | Parse toolApproval field, handle resume flow |
| Modify | `packages/api/src/routes/chat.test.ts` | Tests for approval flow and shell tool |
| Modify | `packages/web/src/components/chat/approval-block.tsx` | Adapt for multi-tool (shell, file) with command display |
| Modify | `packages/web/src/components/chat/chat-area.tsx` | Detect requires_approval, manage approval state, resume flow |
| Modify | `packages/web/src/components/chat/message-bubble.tsx` | Render TerminalBlock and resolved ApprovalBlock in history |
| Create | `workspace/skills/hello-world/SKILL.md` | Test skill for validating full flow |

---

### Task 1: Kill Switch — Regex Blocker

**Files:**
- Create: `packages/api/src/lib/kill-switch.ts`
- Create: `packages/api/src/lib/kill-switch.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/api/src/lib/kill-switch.test.ts
import { describe, it, expect } from 'vitest';
import { isDestructiveCommand } from './kill-switch.js';

describe('kill-switch', () => {
  describe('blocks destructive commands', () => {
    const blocked = [
      'rm -rf /',
      'rm -rf /*',
      'rm -f /etc/passwd',
      'rm -rf /var',
      'mkfs.ext4 /dev/sda1',
      'mkfs /dev/sda',
      'dd if=/dev/zero of=/dev/sda',
      'dd if=/dev/random of=/dev/sdb bs=1M',
      ':(){ :|:& };:',
      'chmod 777 /etc',
      'chmod -R 777 /usr',
      'chown -R nobody /etc',
      '> /dev/sda',
      'mv /etc /dev/null',
      'shutdown -h now',
      'reboot',
      'halt',
      'poweroff',
      'init 0',
      'init 6',
      'insmod /tmp/evil.ko',
      'rmmod some_module',
      'modprobe -r critical_module',
      'sysctl -w kernel.panic=0',
      'wipefs -a /dev/sda',
    ];

    for (const cmd of blocked) {
      it(`blocks: ${cmd}`, () => {
        expect(isDestructiveCommand(cmd)).toBe(true);
      });
    }
  });

  describe('allows safe commands', () => {
    const allowed = [
      'ls -la',
      'echo hello',
      'cat file.txt',
      'grep -r "pattern" .',
      'wc -l *.txt',
      'rm workspace/draft.txt',
      'rm -rf workspace/old-folder',
      'mkdir -p output/images',
      'mv file1.txt file2.txt',
      'cp -r src/ backup/',
      'chmod 644 myfile.txt',
      'date',
      'pwd',
      'node script.js',
      'python convert.py',
      'git status',
      'git log --oneline',
    ];

    for (const cmd of allowed) {
      it(`allows: ${cmd}`, () => {
        expect(isDestructiveCommand(cmd)).toBe(false);
      });
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/api && npx vitest run src/lib/kill-switch.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the kill switch**

```typescript
// packages/api/src/lib/kill-switch.ts

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  // rm targeting system paths (not relative/workspace paths)
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/([^w\s]|$)/,
  /\brm\s+-rf\s+\/\*/,
  // Disk format/wipe
  /\bmkfs\b/,
  /\bdd\s+.*of=\/dev\//,
  /\bwipefs\b/,
  // Fork bomb variants
  /:\(\)\s*\{.*\|.*&\s*\}\s*;?\s*:/,
  // System permissions
  /\bchmod\s+(-R\s+)?[0-7]{3,4}\s+\/(etc|usr|bin|sbin|lib|var|boot|sys|proc|dev)\b/,
  /\bchown\s+-R\s+.*\s+\/(etc|usr|bin|sbin|lib|var|boot|sys|proc|dev)\b/,
  // Destructive redirections
  />\s*\/dev\/sd/,
  /\bmv\s+.*\s+\/dev\/null\b/,
  // System shutdown
  /\b(shutdown|reboot|halt|poweroff)\b/,
  /\binit\s+[06]\b/,
  // Kernel module manipulation
  /\binsmod\b/,
  /\brmmod\b/,
  /\bmodprobe\s+-r\b/,
  /\bsysctl\s+-w\b/,
];

export function isDestructiveCommand(command: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/api && npx vitest run src/lib/kill-switch.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/kill-switch.ts packages/api/src/lib/kill-switch.test.ts
git commit -m "feat(api): add kill-switch for destructive shell commands"
```

---

### Task 2: Shared Types — ToolMeta + ToolApprovalRequest

**Files:**
- Modify: `packages/shared/src/schemas/workspace.ts:76-90`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add ToolMeta and ToolApprovalRequest schemas**

In `packages/shared/src/schemas/workspace.ts`, after the existing `ToolApprovalDecision` block (line 90), add:

```typescript
// ---------- Tool meta (persisted on messages) ----------

export const ToolMeta = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.unknown()),
  status: z.enum(['approved', 'denied', 'auto', 'blocked']),
  result: z.object({
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    exitCode: z.number().optional(),
    killed: z.boolean().optional(),
    truncated: z.boolean().optional(),
    content: z.string().optional(),
    error: z.string().optional(),
    ok: z.boolean().optional(),
  }).optional(),
});
export type ToolMeta = z.infer<typeof ToolMeta>;

// ---------- Tool approval request (in POST /api/chat body) ----------

export const ToolApprovalRequest = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.unknown()),
  approved: z.boolean(),
});
export type ToolApprovalRequest = z.infer<typeof ToolApprovalRequest>;
```

- [ ] **Step 2: Export new types from shared index**

Verify `packages/shared/src/index.ts` re-exports from `./schemas/workspace.js`. If `ToolMeta` and `ToolApprovalRequest` are not in the export list, add them. The file uses barrel exports so they should be picked up automatically if it does `export * from './schemas/workspace.js'`.

- [ ] **Step 3: Build shared to verify**

Run: `cd packages/shared && npx tsup`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schemas/workspace.ts packages/shared/src/index.ts
git commit -m "feat(shared): add ToolMeta and ToolApprovalRequest schemas"
```

---

### Task 3: DB Migration — toolMeta column on messages

**Files:**
- Modify: `packages/api/src/db/schema.ts:85-99`
- Create: `packages/api/migrations/0003_add_tool_meta.sql`

- [ ] **Step 1: Add toolMeta column to schema**

In `packages/api/src/db/schema.ts`, add `toolMeta` to the `messages` table definition (after `model` column, before `createdAt`):

```typescript
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    contentJson: text('content_json').notNull(),
    model: text('model'),
    toolMeta: text('tool_meta'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    sessionIdx: index('messages_session_idx').on(t.sessionId),
  }),
);
```

- [ ] **Step 2: Write the SQL migration**

```sql
-- packages/api/migrations/0003_add_tool_meta.sql
ALTER TABLE messages ADD COLUMN tool_meta TEXT;
```

- [ ] **Step 3: Run migrations to verify**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: Migration applies successfully

- [ ] **Step 4: Run existing tests to verify no regression**

Run: `cd packages/api && npx vitest run`
Expected: All existing tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/db/schema.ts packages/api/migrations/0003_add_tool_meta.sql
git commit -m "feat(api): add tool_meta column to messages table"
```

---

### Task 4: API — Shell Tool + Approval Wrapper

**Files:**
- Modify: `packages/api/src/routes/chat.ts:33-125` (tool builders)
- Modify: `packages/api/src/routes/chat.ts:128-170` (body parsing)

This is the core task. We modify `chat.ts` to:
1. Add `buildShellTool(workspaceDir)` — new tool definition
2. Add `wrapToolsWithApproval(tools)` — wraps destructive tools to return `requires_approval`
3. Parse `toolApproval` from request body for the resume flow

- [ ] **Step 1: Write failing tests for shell tool and approval**

Add to `packages/api/src/routes/chat.test.ts` — new describe blocks after the existing ones:

```typescript
describe('POST /api/chat — tool approval flow', () => {
  it('passes toolApproval field through without error', async () => {
    ctx = await makeCtx();
    const sessionId = newId();
    ctx.db.db.insert(chatSessions).values({
      id: sessionId, userId: ctx.userId, title: 'Test',
      model: 'gpt-5.4-mini', reasoningEffort: 'low', archived: 0,
      createdAt: Date.now(), updatedAt: Date.now(),
    }).run();

    const res = await ctx.app.request('/api/chat', {
      method: 'POST',
      headers: authMutHeaders(ctx.sessionJwt),
      body: JSON.stringify({
        sessionId,
        messages: [{ role: 'user', content: 'Run ls' }],
        toolApproval: {
          toolCallId: 'call_123',
          toolName: 'shell_execute',
          args: { command: 'ls -la' },
          approved: true,
        },
      }),
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify new test fails**

Run: `cd packages/api && npx vitest run src/routes/chat.test.ts`
Expected: New test should pass already (the field is just ignored). This is a smoke test to ensure body parsing doesn't break.

- [ ] **Step 3: Add shell tool builder and imports**

At the top of `packages/api/src/routes/chat.ts`, add the import:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isDestructiveCommand } from '../lib/kill-switch.js';

const execFileAsync = promisify(execFile);

const SHELL_TIMEOUT_MS = 30_000;
const SHELL_MAX_BUFFER = 100 * 1024; // 100KB
const SAFE_PATH = '/usr/local/bin:/usr/bin:/bin';
```

After `buildSkillTools` (line 125), add `buildShellTool`:

```typescript
function buildShellTool(workspaceDir: string) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    shell_execute: tool({
      description: 'Execute a shell command. The user will be asked for confirmation before execution.',
      parameters: z.object({
        command: z.string().describe('The shell command to execute'),
        cwd: z.string().optional().describe('Working directory (relative to workspace, defaults to workspace root)'),
      }),
      execute: async ({ command, cwd }: { command: string; cwd?: string }) => {
        // Kill switch — block before any approval
        if (isDestructiveCommand(command)) {
          return { error: 'Commande bloquée : opération destructive détectée', status: 'blocked' as const };
        }

        // Resolve cwd
        let resolvedCwd = workspaceDir;
        if (cwd) {
          try {
            resolvedCwd = await assertSafePath(workspaceDir, cwd);
          } catch {
            return { error: `invalid cwd: ${cwd}` };
          }
        }

        try {
          const { stdout, stderr } = await execFileAsync('/bin/sh', ['-c', command], {
            cwd: resolvedCwd,
            timeout: SHELL_TIMEOUT_MS,
            maxBuffer: SHELL_MAX_BUFFER,
            env: { ...process.env, PATH: SAFE_PATH },
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
      },
    } as any),
  };
}
```

- [ ] **Step 4: Add approval wrapper**

After `buildShellTool`, add the tool approval wrapper:

```typescript
const TOOLS_REQUIRING_APPROVAL = ['create_file', 'delete_file', 'shell_execute'];

function wrapToolsWithApproval(
  tools: Record<string, any>,
  approvedTool?: { toolName: string; approved: boolean } | null,
): Record<string, any> {
  const wrapped: Record<string, any> = {};
  for (const [name, t] of Object.entries(tools)) {
    if (!TOOLS_REQUIRING_APPROVAL.includes(name)) {
      wrapped[name] = t;
      continue;
    }

    // If this tool was just approved, use the original (will execute)
    if (approvedTool?.toolName === name && approvedTool.approved) {
      wrapped[name] = t;
      continue;
    }

    // If this tool was denied, return a denial message
    if (approvedTool?.toolName === name && !approvedTool.approved) {
      wrapped[name] = tool({
        description: t.description,
        parameters: t.parameters,
        execute: async (args: Record<string, unknown>) => ({
          status: 'denied' as const,
          message: "L'utilisateur a refusé l'exécution de cette commande.",
          toolName: name,
          args,
        }),
      } as any);
      continue;
    }

    // Default: return requires_approval
    wrapped[name] = tool({
      description: t.description,
      parameters: t.parameters,
      execute: async (args: Record<string, unknown>) => {
        // For shell_execute, run kill switch first
        if (name === 'shell_execute' && typeof args.command === 'string' && isDestructiveCommand(args.command)) {
          return { error: 'Commande bloquée : opération destructive détectée', status: 'blocked' as const };
        }
        return { status: 'requires_approval' as const, toolName: name, args };
      },
    } as any);
  }
  return wrapped;
}
```

- [ ] **Step 5: Parse toolApproval from request body and wire everything**

In the POST handler (around line 153-170), after parsing `attachmentIds`, add:

```typescript
// Parse tool approval (resume after user decision)
const toolApproval = (raw as Record<string, unknown>).toolApproval
  ? {
      toolCallId: String(((raw as Record<string, unknown>).toolApproval as Record<string, unknown>).toolCallId ?? ''),
      toolName: String(((raw as Record<string, unknown>).toolApproval as Record<string, unknown>).toolName ?? ''),
      args: ((raw as Record<string, unknown>).toolApproval as Record<string, unknown>).args as Record<string, unknown> ?? {},
      approved: Boolean(((raw as Record<string, unknown>).toolApproval as Record<string, unknown>).approved),
    }
  : null;
```

Then modify the tools wiring section (around line 304-308):

```typescript
// Build tools conditionally
const fileTools = deps.workspaceDir ? buildFileTools(deps.workspaceDir) : {};
const skillTools = deps.skills && deps.skills.size > 0 ? buildSkillTools(deps.skills) : {};
const shellTools = deps.workspaceDir ? buildShellTool(deps.workspaceDir) : {};
const rawTools = { ...fileTools, ...skillTools, ...shellTools };
const tools = wrapToolsWithApproval(rawTools, toolApproval);
const hasTools = Object.keys(tools).length > 0;
```

- [ ] **Step 6: Run all tests**

Run: `cd packages/api && npx vitest run`
Expected: All tests pass (existing + new)

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routes/chat.ts packages/api/src/routes/chat.test.ts
git commit -m "feat(api): add shell_execute tool and approval wrapper"
```

---

### Task 5: API — Persist toolMeta in messages

**Files:**
- Modify: `packages/api/src/routes/chat.ts` (onFinish callback, lines 316-465)

- [ ] **Step 1: Update onFinish to persist tool metadata**

In the `onFinish` callback, the `response` object from AI SDK contains the full step data including tool calls and results. Update the assistant message persistence to include `toolMeta` when tool calls were made.

After the line that persists the assistant message (around line 340-351), replace it with:

```typescript
// Extract tool metadata from response steps
const toolMetas: Array<Record<string, unknown>> = [];
if (response?.messages) {
  for (const msg of response.messages) {
    const m = msg as Record<string, unknown>;
    if (m.role === 'assistant' && Array.isArray((m as any).toolInvocations)) {
      for (const inv of (m as any).toolInvocations) {
        toolMetas.push({
          toolCallId: inv.toolCallId,
          toolName: inv.toolName,
          args: inv.args,
          status: inv.result?.status ?? 'auto',
          result: inv.result,
        });
      }
    }
  }
}

// Persist assistant message
deps.db.db
  .insert(messages)
  .values({
    id: newId(),
    sessionId: sessionId!,
    role: 'assistant',
    contentJson: JSON.stringify({ text }),
    model: finalModel,
    toolMeta: toolMetas.length > 0 ? JSON.stringify(toolMetas) : null,
    createdAt: finishTs,
  })
  .run();
```

- [ ] **Step 2: Run tests to verify no regression**

Run: `cd packages/api && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/routes/chat.ts
git commit -m "feat(api): persist toolMeta in assistant messages"
```

---

### Task 6: Frontend — TerminalBlock Component

**Files:**
- Create: `packages/web/src/components/chat/terminal-block.tsx`

- [ ] **Step 1: Create TerminalBlock component**

```tsx
// packages/web/src/components/chat/terminal-block.tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface TerminalBlockProps {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  killed?: boolean;
  truncated?: boolean;
}

// Strip ANSI escape codes
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

const COLLAPSED_LINES = 5;

export function TerminalBlock({
  command,
  stdout,
  stderr,
  exitCode,
  killed,
  truncated,
}: TerminalBlockProps) {
  const cleanStdout = stripAnsi(stdout);
  const cleanStderr = stripAnsi(stderr);
  const outputLines = cleanStdout.split('\n').filter(Boolean);
  const isLong = outputLines.length > 10;
  const [expanded, setExpanded] = useState(!isLong);

  const displayLines = expanded ? outputLines : outputLines.slice(0, COLLAPSED_LINES);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-zinc-900 font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-700 bg-zinc-800 px-3 py-1.5">
        <span className="text-zinc-300">$ {command}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            exitCode === 0
              ? 'bg-emerald-900/50 text-emerald-400'
              : 'bg-red-900/50 text-red-400'
          }`}
        >
          {killed ? 'TIMEOUT' : exitCode === 0 ? 'OK' : `EXIT ${exitCode}`}
        </span>
      </div>

      {/* Output */}
      <div className="px-3 py-2">
        {displayLines.length > 0 && (
          <pre className="whitespace-pre-wrap text-zinc-200">
            {displayLines.join('\n')}
          </pre>
        )}
        {cleanStderr && (
          <pre className="mt-1 whitespace-pre-wrap text-orange-400">
            {stripAnsi(cleanStderr)}
          </pre>
        )}
        {truncated && (
          <p className="mt-1 text-zinc-500">(output tronqué à 100KB)</p>
        )}
        {killed && (
          <p className="mt-1 text-zinc-500">(commande interrompue après 30s)</p>
        )}
      </div>

      {/* Expand/collapse toggle */}
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-center gap-1 border-t border-zinc-700 bg-zinc-800 py-1 text-[10px] text-zinc-400 hover:text-zinc-200"
        >
          {expanded ? (
            <>
              <ChevronDown className="h-3 w-3" /> Réduire
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3" /> Voir tout ({outputLines.length} lignes)
            </>
          )}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/chat/terminal-block.tsx
git commit -m "feat(web): add TerminalBlock component for shell output"
```

---

### Task 7: Frontend — Adapt ApprovalBlock for Multi-Tool

**Files:**
- Modify: `packages/web/src/components/chat/approval-block.tsx`

- [ ] **Step 1: Rewrite ApprovalBlock with tool-specific display**

Replace the entire content of `packages/web/src/components/chat/approval-block.tsx`:

```tsx
import { Shield, Terminal, FilePlus, Trash2 } from 'lucide-react';

interface ApprovalBlockProps {
  toolName: string;
  args: Record<string, unknown>;
  onApprove: () => void;
  onDeny: () => void;
  status?: 'pending' | 'approved' | 'denied';
}

function toolIcon(name: string) {
  switch (name) {
    case 'shell_execute': return <Terminal className="h-4 w-4" />;
    case 'create_file': return <FilePlus className="h-4 w-4" />;
    case 'delete_file': return <Trash2 className="h-4 w-4" />;
    default: return <Shield className="h-4 w-4" />;
  }
}

function toolDescription(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'shell_execute':
      return String(args.command ?? '');
    case 'create_file':
      return `Créer fichier ${String(args.path ?? '')}`;
    case 'delete_file':
      return `Supprimer ${String(args.path ?? '')}`;
    default:
      return JSON.stringify(args);
  }
}

export function ApprovalBlock({
  toolName,
  args,
  onApprove,
  onDeny,
  status = 'pending',
}: ApprovalBlockProps) {
  const isShell = toolName === 'shell_execute';
  const description = toolDescription(toolName, args);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-primary/30 bg-primary/5">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
        {toolIcon(toolName)}
        <span>{toolName}</span>
      </div>

      {/* Command/action display */}
      <div className="px-3 py-2">
        {isShell ? (
          <div className="rounded bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200">
            $ {description}
          </div>
        ) : (
          <p className="text-sm">
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{description}</code>
          </p>
        )}
      </div>

      {/* Actions / Status */}
      <div className="flex items-center gap-2 px-3 py-2">
        {status === 'pending' && (
          <>
            <button
              onClick={onApprove}
              className="rounded-md bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Autoriser
            </button>
            <button
              onClick={onDeny}
              className="rounded-md bg-muted px-4 py-1 text-xs text-foreground hover:bg-muted/80"
            >
              Refuser
            </button>
          </>
        )}
        {status === 'approved' && (
          <span className="rounded-full bg-emerald-900/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            Autorisé
          </span>
        )}
        {status === 'denied' && (
          <span className="rounded-full bg-red-900/30 px-2 py-0.5 text-[10px] font-semibold text-red-400">
            Refusé
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors. Note: if other files import `ApprovalBlock` with the old props, update those imports.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/chat/approval-block.tsx
git commit -m "feat(web): adapt ApprovalBlock for multi-tool approval"
```

---

### Task 8: Frontend — ChatArea Approval Flow + Resume

**Files:**
- Modify: `packages/web/src/components/chat/chat-area.tsx`

This is the most complex frontend task. We modify ChatArea to:
1. Detect `requires_approval` in the streamed response
2. Show ApprovalBlock when detected
3. Send a resume request with the user's decision
4. Show TerminalBlock for shell results in history

- [ ] **Step 1: Add approval state and types**

Add new state and imports at the top of `ChatArea`:

```typescript
import { ApprovalBlock } from './approval-block';
import { TerminalBlock } from './terminal-block';

// Inside the component, after existing state declarations:
interface PendingApproval {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  messageHistory: Array<{ role: string; content: string }>;
}

// Add state:
const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
```

- [ ] **Step 2: Add approval detection in stream reader**

After the streaming `while` loop (around line 229), add detection logic. The AI SDK text stream may contain a JSON block at the end when a tool returns `requires_approval`. We need to detect it from the accumulated text:

```typescript
// After the while loop:
// Check if the response contains a tool requiring approval
// The model's response will mention "requires_approval" when a tool was paused
try {
  // Look for requires_approval pattern in the accumulated response
  const approvalMatch = accumulated.match(/"status"\s*:\s*"requires_approval".*?"toolName"\s*:\s*"([^"]+)".*?"args"\s*:\s*(\{[^}]+\})/s);
  if (approvalMatch) {
    const toolName = approvalMatch[1]!;
    const args = JSON.parse(approvalMatch[2]!);
    setPendingApproval({
      toolCallId: `call_${Date.now()}`,
      toolName,
      args,
      messageHistory: allMessages,
    });
  }
} catch {
  // Parsing error — not an approval response, continue normally
}
```

Note: This is a heuristic approach. The exact detection will depend on how AI SDK formats the tool result in the text stream. During implementation, test with a real tool call and adjust the regex pattern to match the actual output format. The key insight: when a tool returns `requires_approval`, the model typically echoes this in its response text because it can't proceed.

- [ ] **Step 3: Add approval handler functions**

Add these callbacks in the component:

```typescript
const handleApproval = useCallback(async (approved: boolean) => {
  if (!pendingApproval) return;
  const { toolName, args, messageHistory } = pendingApproval;
  setPendingApproval(null);
  setIsLoading(true);

  const assistantId = localId();
  setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

  try {
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CSRF_HEADER]: readCsrfCookie(),
      },
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        model,
        messages: messageHistory,
        toolApproval: {
          toolCallId: pendingApproval.toolCallId,
          toolName,
          args,
          approved,
        },
      }),
    });

    if (!res.ok) throw new Error(`API error ${res.status}`);

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let accumulated = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      const current = accumulated;
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: current } : m)),
      );
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    console.error('[chat] approval resume error:', err);
  } finally {
    setIsLoading(false);
    abortRef.current = null;
  }
}, [pendingApproval, model]);
```

- [ ] **Step 4: Render ApprovalBlock in the chat**

In the JSX, after the messages list and before the `ChatInput`, add the approval UI:

```tsx
{pendingApproval && (
  <div className="mx-auto max-w-3xl px-4">
    <ApprovalBlock
      toolName={pendingApproval.toolName}
      args={pendingApproval.args}
      onApprove={() => handleApproval(true)}
      onDeny={() => handleApproval(false)}
      status="pending"
    />
  </div>
)}
```

- [ ] **Step 5: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/chat/chat-area.tsx
git commit -m "feat(web): add approval flow and resume in ChatArea"
```

---

### Task 9: Frontend — MessageBubble Tool Rendering

**Files:**
- Modify: `packages/web/src/components/chat/message-bubble.tsx`

- [ ] **Step 1: Add TerminalBlock and ApprovalBlock rendering for history**

The `MessageBubble` needs to render tool results when loading historical messages that contain `toolMeta`. This requires the message to carry optional `toolMeta` data.

Update `MessageBubble`:

```tsx
import type { AttachmentResponse } from '@buck/shared';
import { MarkdownRenderer } from './markdown-renderer';
import { AttachmentDisplay } from './attachment-display';
import { TerminalBlock } from './terminal-block';
import { ApprovalBlock } from './approval-block';

interface ToolMetaDisplay {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'approved' | 'denied' | 'auto' | 'blocked';
  result?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    killed?: boolean;
    truncated?: boolean;
    error?: string;
  };
}

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  model?: string | null;
  attachments?: AttachmentResponse[];
  toolMetas?: ToolMetaDisplay[];
}

export function MessageBubble({ role, content, model, attachments, toolMetas }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        {attachments && attachments.length > 0 && (
          <AttachmentDisplay attachments={attachments} />
        )}

        {/* Tool results from history */}
        {toolMetas?.map((tm) => {
          if (tm.toolName === 'shell_execute' && tm.status === 'approved' && tm.result) {
            return (
              <TerminalBlock
                key={tm.toolCallId}
                command={String(tm.args.command ?? '')}
                stdout={tm.result.stdout ?? ''}
                stderr={tm.result.stderr ?? ''}
                exitCode={tm.result.exitCode ?? 1}
                killed={tm.result.killed}
                truncated={tm.result.truncated}
              />
            );
          }
          if (tm.status === 'approved' || tm.status === 'denied') {
            return (
              <ApprovalBlock
                key={tm.toolCallId}
                toolName={tm.toolName}
                args={tm.args}
                onApprove={() => {}}
                onDeny={() => {}}
                status={tm.status}
              />
            );
          }
          if (tm.status === 'blocked') {
            return (
              <div key={tm.toolCallId} className="my-2 rounded border border-red-500/30 bg-red-900/10 px-3 py-2 text-xs text-red-400">
                Commande bloquée : {String(tm.args.command ?? tm.args.path ?? '')}
              </div>
            );
          }
          return null;
        })}

        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        ) : (
          <MarkdownRenderer content={content} />
        )}
        {!isUser && model && (
          <p className="mt-1 text-xs text-muted-foreground">{model}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update ChatArea message loading to parse toolMeta**

In `chat-area.tsx`, update the `fetchMessages` result mapping (around line 86-98) to include toolMeta:

```typescript
const loaded: ChatMessage[] = res.messages.map((m) => ({
  id: m.id,
  role: m.role as 'user' | 'assistant',
  content: (() => {
    try {
      const parsed = JSON.parse(m.contentJson);
      return typeof parsed === 'string' ? parsed : (parsed.text ?? '');
    } catch {
      return m.contentJson;
    }
  })(),
  toolMetas: m.toolMeta ? JSON.parse(m.toolMeta) : undefined,
}));
```

Update the `ChatMessage` interface to include `toolMetas`:

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolMetas?: Array<{
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    status: 'approved' | 'denied' | 'auto' | 'blocked';
    result?: Record<string, unknown>;
  }>;
}
```

Pass toolMetas to MessageBubble:

```tsx
<MessageBubble
  key={m.id}
  role={m.role}
  content={m.content}
  toolMetas={m.toolMetas}
/>
```

- [ ] **Step 3: Update sessions lib to include toolMeta in message type**

Check `packages/web/src/lib/sessions.ts` — the `fetchMessages` return type must include `toolMeta`. Add the field to the response type if missing.

- [ ] **Step 4: Verify build**

Run: `cd packages/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/chat/message-bubble.tsx packages/web/src/components/chat/chat-area.tsx packages/web/src/lib/sessions.ts
git commit -m "feat(web): render tool results and approval history in messages"
```

---

### Task 10: Hello-World Skill + Manual Integration Test

**Files:**
- Create: `workspace/skills/hello-world/SKILL.md`

- [ ] **Step 1: Create the test skill**

Ensure the `workspace/skills/hello-world/` directory exists (it lives inside the Docker workspace, not in the repo source). For development, create it in the workspace path configured for the dev environment.

```markdown
# Hello World

Tu es un assistant de test. Quand l'utilisateur te dit "hello" :
1. Réponds "Hello World!"
2. Utilise shell_execute pour afficher la date avec la commande `date`
```

- [ ] **Step 2: Run the full stack locally**

Run: `pnpm dev`

- [ ] **Step 3: Manual test — full flow**

1. Open the app in browser
2. Type "hello" in the chat
3. Verify: the model activates the hello-world skill (auto-approved)
4. Verify: the model calls `shell_execute("date")` → ApprovalBlock appears
5. Click "Autoriser"
6. Verify: TerminalBlock appears with the date output
7. Verify: the model continues with "Hello World!" text

- [ ] **Step 4: Manual test — denial flow**

1. Type "montre-moi les fichiers du workspace"
2. If the model calls `shell_execute("ls -la")` → click "Refuser"
3. Verify: the model acknowledges the refusal and continues without executing

- [ ] **Step 5: Manual test — kill switch**

1. Via a direct API call or by manipulating prompts, trigger a destructive command
2. Verify: the command is blocked before reaching the approval UI

- [ ] **Step 6: Commit the skill**

```bash
git add workspace/skills/hello-world/SKILL.md
git commit -m "test: add hello-world skill for approval flow validation"
```

---

### Task 11: Full Test Suite + Typecheck

**Files:** All packages

- [ ] **Step 1: Run typecheck across all packages**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 2: Run all unit tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 3: Run linter**

Run: `pnpm lint`
Expected: No errors (warnings acceptable)

- [ ] **Step 4: Fix any issues found**

Address any type errors, failing tests, or lint errors from the previous steps.

- [ ] **Step 5: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: resolve typecheck/lint issues from M3.5"
```
