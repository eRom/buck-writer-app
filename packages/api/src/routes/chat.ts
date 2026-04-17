import { Hono } from 'hono';
import { eq, and, isNull, gte, lt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { streamText, generateText, tool } from 'ai';
import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai';
import * as fsp from 'node:fs/promises';
import * as pathModule from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { newId, costOf, getBillingPeriod } from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import type { Prompts } from '../services/prompts.js';
import type { Skill } from '../services/skills.js';
import { chatSessions, messages, usageEvents, userSettings, alertTriggers, attachments } from '../db/schema.js';
import { assertSafePath } from '../utils/path-safe.js';
import { isImage, isExtractable, extractText } from '../services/extractor.js';
import { isDestructiveCommand } from '../lib/kill-switch.js';

const execFileAsync = promisify(execFile);

const SHELL_TIMEOUT_MS = 30_000;
const SHELL_MAX_BUFFER = 100 * 1024; // 100KB
const SAFE_PATH = '/usr/local/bin:/usr/bin:/bin';

export interface ChatRouteDeps {
  db: DbHandles;
  prompts: Prompts;
  openaiApiKey: string;
  workspaceDir?: string;
  skills?: Map<string, Skill>;
  nowMs?: () => number;
}

export function createChatRoute(
  deps: ChatRouteDeps,
): Hono<{ Variables: { userId: string } }> {
  const now = deps.nowMs ?? Date.now;
  const app = new Hono<{ Variables: { userId: string } }>();
  const openai = createOpenAI({ apiKey: deps.openaiApiKey });

  function buildFileTools(workspaceDir: string) {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      read_file: tool({
        description: 'Read the content of a file in the workspace',
        parameters: z.object({ path: z.string() }),
        execute: async ({ path: filePath }: { path: string }) => {
          try {
            const absPath = await assertSafePath(workspaceDir, filePath);
            const stat = await fsp.stat(absPath);
            if (stat.isDirectory()) return { error: 'path is a directory, use list_directory instead' };
            if (stat.size > 1024 * 1024) return { error: 'file too large (max 1MB for context)' };
            const content = await fsp.readFile(absPath, 'utf8');
            return { content, path: filePath };
          } catch (err) {
            if (err instanceof Error && 'status' in err) return { error: 'path outside workspace' };
            return { error: `file not found: ${filePath}` };
          }
        },
      } as any),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      list_directory: tool({
        description: 'List files and directories at a given path in the workspace',
        parameters: z.object({ path: z.string().optional().describe('Relative path, defaults to workspace root') }),
        execute: async ({ path: dirPath }: { path?: string }) => {
          try {
            const absPath = dirPath
              ? await assertSafePath(workspaceDir, dirPath)
              : workspaceDir;
            const entries = await fsp.readdir(absPath, { withFileTypes: true });
            return {
              entries: entries
                .filter((e) => e.name !== '.attachments')
                .map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })),
            };
          } catch {
            return { error: `directory not found: ${dirPath ?? '/'}` };
          }
        },
      } as any),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create_file: tool({
        description: 'Create or overwrite a file in the workspace',
        parameters: z.object({ path: z.string(), content: z.string() }),
        execute: async ({ path: filePath, content }: { path: string; content: string }) => {
          if (filePath.startsWith('prompts/') || filePath === 'prompts') {
            return { error: 'cannot write to prompts/ directory (reserved)' };
          }
          try {
            const absPath = await assertSafePath(workspaceDir, filePath);
            await fsp.mkdir(pathModule.dirname(absPath), { recursive: true });
            await fsp.writeFile(absPath, content, 'utf8');
            return { ok: true, path: filePath };
          } catch {
            return { error: `failed to create file: ${filePath}` };
          }
        },
      } as any),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete_file: tool({
        description: 'Delete a file in the workspace. The user will be asked for confirmation in the chat UI before this executes.',
        parameters: z.object({ path: z.string() }),
        execute: async ({ path: filePath }: { path: string }) => {
          try {
            const absPath = await assertSafePath(workspaceDir, filePath);
            await fsp.rm(absPath, { recursive: true });
            return { ok: true, deleted: filePath };
          } catch {
            return { error: `failed to delete: ${filePath}` };
          }
        },
      } as any),
    };
  }

  function buildSkillTools(skills: Map<string, Skill>) {
    const skillsList = [...skills.values()]
      .map((s) => `${s.name}: ${s.description}`)
      .join('; ');

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activate_skill: tool({
        description: `Activate a skill to get its full instructions. Available skills: ${skillsList}`,
        parameters: z.object({ name: z.string() }),
        execute: async ({ name }: { name: string }) => {
          const skill = skills.get(name);
          if (!skill) return { error: `skill not found: ${name}` };
          return { name: skill.name, instructions: skill.body };
        },
      } as any),
    };
  }

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
          // Kill switch — block destructive commands
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

  const TOOLS_REQUIRING_APPROVAL = ['create_file', 'delete_file', 'shell_execute'];

  function wrapToolsWithApproval(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: Record<string, any>,
    approvedTool?: { toolName: string; approved: boolean } | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // POST / — streaming chat
  app.post('/', async (c) => {
    const userId = c.get('userId');
    const raw = await c.req.json().catch(() => ({}));

    // AI SDK v6 sends messages as { parts: [{ type: 'text', text }] }
    // Convert to { role, content } format
    const rawMessages = (raw as { messages?: unknown[] }).messages;
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return c.json(
        { error: { code: 'invalid_input', message: 'messages required' } },
        422,
      );
    }

    const userMessages = rawMessages.map((m: unknown) => {
      const msg = m as { role: string; content?: string; parts?: Array<{ type: string; text?: string }> };
      const content = msg.content
        ?? msg.parts
            ?.filter((p) => p.type === 'text')
            .map((p) => p.text ?? '')
            .join('') ?? '';
      return { role: msg.role, content };
    });

    // Parse sessionId + model from body (ignore unknown fields from AI SDK)
    const body = {
      sessionId: typeof (raw as Record<string, unknown>).sessionId === 'string'
        ? (raw as Record<string, unknown>).sessionId as string
        : undefined,
      model: typeof (raw as Record<string, unknown>).model === 'string'
        ? (raw as Record<string, unknown>).model as string
        : undefined,
    };

    // Parse @references
    const references = Array.isArray((raw as Record<string, unknown>).references)
      ? ((raw as Record<string, unknown>).references as Array<{ path: string; content: string }>)
      : [];

    // Parse attachment IDs
    const attachmentIds = Array.isArray((raw as Record<string, unknown>).attachmentIds)
      ? ((raw as Record<string, unknown>).attachmentIds as string[])
      : [];

    // Parse tool approval (resume after user decision)
    const toolApproval = (raw as Record<string, unknown>).toolApproval
      ? {
          toolCallId: String(((raw as Record<string, unknown>).toolApproval as Record<string, unknown>).toolCallId ?? ''),
          toolName: String(((raw as Record<string, unknown>).toolApproval as Record<string, unknown>).toolName ?? ''),
          args: ((raw as Record<string, unknown>).toolApproval as Record<string, unknown>).args as Record<string, unknown> ?? {},
          approved: Boolean(((raw as Record<string, unknown>).toolApproval as Record<string, unknown>).approved),
        }
      : null;

    const ts = now();
    let sessionId = body.sessionId;
    let isNewSession = false;
    let sessionModel: string | undefined;

    if (sessionId) {
      // Verify ownership
      const session = deps.db.db
        .select()
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.id, sessionId),
            eq(chatSessions.userId, userId),
            isNull(chatSessions.deletedAt),
          ),
        )
        .get();

      if (!session) {
        return c.json(
          { error: { code: 'not_found', message: 'session not found' } },
          404,
        );
      }
      sessionModel = session.model;
    } else {
      // Create implicit session
      const newSessionId = newId();
      deps.db.db
        .insert(chatSessions)
        .values({
          id: newSessionId,
          userId,
          title: 'Nouvelle conversation',
          model: body.model ?? 'gpt-5.4-mini',
          reasoningEffort: 'low',
          archived: 0,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      sessionId = newSessionId;
      isNewSession = true;
    }

    // Resolve model: body.model > session.model > userSettings.defaultModel > 'gpt-5.4-mini'
    let resolvedModel: string = 'gpt-5.4-mini';
    if (body.model) {
      resolvedModel = body.model;
    } else if (sessionModel) {
      resolvedModel = sessionModel;
    } else {
      const settings = deps.db.db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .get();
      if (settings?.defaultModel) {
        resolvedModel = settings.defaultModel;
      }
    }

    // Build system messages
    const systemMessages: Array<{ role: 'system'; content: string }> = [];
    systemMessages.push({ role: 'system', content: deps.prompts.system });
    if (deps.prompts.rules.length > 0) {
      systemMessages.push({ role: 'system', content: deps.prompts.rules });
    }

    // Add skills summary to system messages
    if (deps.skills && deps.skills.size > 0) {
      const skillsList = [...deps.skills.values()]
        .map((s) => `- **${s.name}**: ${s.description}`)
        .join('\n');
      systemMessages.push({
        role: 'system',
        content: `Available workspace skills (use activate_skill tool to load full instructions):\n${skillsList}`,
      });
    }

    // Validate and type cast user messages
    const typedUserMessages = userMessages as Array<{
      role: string;
      content: string;
    }>;

    // Inject @references into the last user message
    if (references.length > 0) {
      const refContent = references
        .map((r) => `--- File: ${r.path} ---\n${r.content}\n--- End ---`)
        .join('\n\n');
      const lastUserIdx = typedUserMessages.reduce((acc, m, i) => (m.role === 'user' ? i : acc), -1);
      if (lastUserIdx >= 0) {
        typedUserMessages[lastUserIdx]!.content += `\n\n[Referenced files]\n${refContent}`;
      }
    }

    // Load attachments and inject into context
    if (attachmentIds.length > 0 && deps.workspaceDir) {
      for (const attId of attachmentIds) {
        const att = deps.db.db.select().from(attachments)
          .where(and(eq(attachments.id, attId), eq(attachments.userId, userId)))
          .get();
        if (!att) continue;

        const absPath = pathModule.join(deps.workspaceDir, att.path);

        if (isImage(att.mimeType)) {
          // For images, add as a note that an image was attached (vision requires special handling)
          const lastUserIdx = typedUserMessages.reduce((acc, m, i) => (m.role === 'user' ? i : acc), -1);
          if (lastUserIdx >= 0) {
            typedUserMessages[lastUserIdx]!.content += `\n\n[Attached image: ${att.filename}]`;
          }
        } else if (isExtractable(att.mimeType)) {
          try {
            const text = await extractText(absPath, att.mimeType);
            const lastUserIdx = typedUserMessages.reduce((acc, m, i) => (m.role === 'user' ? i : acc), -1);
            if (lastUserIdx >= 0) {
              typedUserMessages[lastUserIdx]!.content += `\n\n--- Attached: ${att.filename} ---\n${text}\n--- End ---`;
            }
          } catch {
            // Extraction failed — skip silently
          }
        }
      }
    }

    // Build the full messages array — cast to any to avoid version-specific type gymnastics
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allMessages: any[] = [...systemMessages, ...typedUserMessages];

    // Build tools conditionally
    const fileTools = deps.workspaceDir ? buildFileTools(deps.workspaceDir) : {};
    const skillTools = deps.skills && deps.skills.size > 0 ? buildSkillTools(deps.skills) : {};
    const shellTools = deps.workspaceDir ? buildShellTool(deps.workspaceDir) : {};
    const rawTools = { ...fileTools, ...skillTools, ...shellTools };
    const tools = wrapToolsWithApproval(rawTools, toolApproval);
    const hasTools = Object.keys(tools).length > 0;

    // Stream the response
    try {
    const result = streamText({
      model: openai(resolvedModel),
      messages: allMessages,
      ...(hasTools ? { tools, maxSteps: 5 } : {}),
      onFinish: async ({ text, usage, response }) => {
        const finishTs = now();
        const finalModel = response?.modelId ?? resolvedModel;

        // Find the last user message
        const lastUserMessage = [...typedUserMessages]
          .reverse()
          .find((m) => m.role === 'user');

        // Persist user message
        if (lastUserMessage) {
          deps.db.db
            .insert(messages)
            .values({
              id: newId(),
              sessionId: sessionId!,
              role: 'user',
              contentJson: JSON.stringify({ text: lastUserMessage.content }),
              model: null,
              createdAt: finishTs - 1,
            })
            .run();
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
            createdAt: finishTs,
          })
          .run();

        // Persist usage event
        const inputTokens = usage?.inputTokens ?? 0;
        const outputTokens = usage?.outputTokens ?? 0;
        const costUsd = costOf(finalModel, inputTokens, outputTokens);

        deps.db.db
          .insert(usageEvents)
          .values({
            id: newId(),
            userId,
            sessionId: sessionId!,
            createdAt: finishTs,
            model: finalModel,
            inputTokens,
            outputTokens,
            reasoningTokens: 0,
            audioInputSeconds: 0,
            audioOutputSeconds: 0,
            costUsd,
          })
          .run();

        // Update session lastMessageAt
        deps.db.db
          .update(chatSessions)
          .set({ lastMessageAt: finishTs, updatedAt: finishTs })
          .where(eq(chatSessions.id, sessionId!))
          .run();

        // Check and insert alert triggers
        const userSettingsRow = deps.db.db
          .select()
          .from(userSettings)
          .where(eq(userSettings.userId, userId))
          .get();

        if (userSettingsRow) {
          const period = getBillingPeriod(userSettingsRow.billingResetDay, finishTs);
          const totalResult = deps.db.db
            .select({ total: sql<number>`COALESCE(SUM(${usageEvents.costUsd}), 0)` })
            .from(usageEvents)
            .where(
              and(
                eq(usageEvents.userId, userId),
                gte(usageEvents.createdAt, period.periodStart),
                lt(usageEvents.createdAt, period.periodEnd),
              ),
            )
            .get();

          const currentTotal = totalResult?.total ?? 0;
          const limitUsd = userSettingsRow.monthlyCostLimitUsd;
          const currentPercent = limitUsd > 0 ? (currentTotal / limitUsd) * 100 : 0;
          const thresholds: number[] = JSON.parse(userSettingsRow.alertThresholdsJson);
          const yearMonth = new Date(period.periodStart).toISOString().slice(0, 7);

          for (const threshold of thresholds) {
            if (currentPercent >= threshold) {
              const existing = deps.db.db
                .select()
                .from(alertTriggers)
                .where(
                  and(
                    eq(alertTriggers.userId, userId),
                    eq(alertTriggers.yearMonth, yearMonth),
                    eq(alertTriggers.thresholdPercent, threshold),
                  ),
                )
                .get();

              if (!existing) {
                deps.db.db
                  .insert(alertTriggers)
                  .values({
                    id: newId(),
                    userId,
                    yearMonth,
                    thresholdPercent: threshold,
                    triggeredAt: finishTs,
                  })
                  .run();
              }
            }
          }
        }

        // Auto-generate title for new sessions (fire-and-forget)
        if (isNewSession && lastUserMessage) {
          const firstMessage = lastUserMessage.content;
          generateText({
            model: openai('gpt-5.4-nano'),
            messages: [
              {
                role: 'system',
                content:
                  'Generate a short title (5-6 words max, in the language of the user message) for a chat. Return ONLY the title.',
              },
              { role: 'user', content: firstMessage },
            ],
            maxOutputTokens: 30,
          })
            .then(({ text: titleText }) => {
              deps.db.db
                .update(chatSessions)
                .set({ title: titleText.trim(), updatedAt: now() })
                .where(eq(chatSessions.id, sessionId!))
                .run();
            })
            .catch((err: unknown) => {
              console.warn('[api] title generation failed', err);
            });
        }
      },
    });

    const response = result.toTextStreamResponse();
    if (isNewSession) {
      const headers = new Headers(response.headers);
      headers.set('x-session-id', sessionId!);
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('429') || errMsg.includes('rate limit')) {
        return c.json(
          {
            error: {
              code: 'provider_rate_limit',
              message: 'OpenAI rate limit reached',
              link: 'https://platform.openai.com/settings/organization/limits',
            },
          },
          502,
        );
      }
      throw err;
    }
  });

  return app;
}
