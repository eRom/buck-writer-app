import { Hono } from 'hono';
import { eq, and, isNull, gte, lt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import * as pathModule from 'node:path';
import { newId, costOf, getBillingPeriod } from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import type { PromptsRef } from '../services/prompts.js';
import type { Skill } from '../services/skills.js';
import { chatSessions, messages, usageEvents, userSettings, alertTriggers, attachments } from '../db/schema.js';
import { isImage, isExtractable, extractText } from '../services/extractor.js';
import { isDestructiveCommand } from '../lib/kill-switch.js';
import {
  streamChat,
  chat,
  parseSSEChunks,
  accumulateToolCalls,
  OpenAIError,
} from '../lib/openai.js';
import type { ChatMessage, ToolCall } from '../lib/openai.js';
import type { McpClient } from '../services/mcp-client.js';
import { buildToolDefinitions, buildToolHandlers } from './chat-tools.js';
import type { ToolHandler } from './chat-tools.js';

const TOOLS_REQUIRING_APPROVAL = ['create_file', 'delete_file', 'shell_execute'];

export interface ChatRouteDeps {
  db: DbHandles;
  prompts: PromptsRef;
  openaiApiKey: string;
  workspaceDir?: string;
  skills?: Map<string, Skill>;
  mcpClient?: McpClient;
  nowMs?: () => number;
}


export function createChatRoute(
  deps: ChatRouteDeps,
): Hono<{ Variables: { userId: string } }> {
  const now = deps.nowMs ?? Date.now;
  const app = new Hono<{ Variables: { userId: string } }>();

  // POST / — streaming chat
  app.post('/', async (c) => {
    const userId = c.get('userId');
    const raw = await c.req.json().catch(() => ({}));

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

    const body = {
      sessionId: typeof (raw as Record<string, unknown>).sessionId === 'string'
        ? (raw as Record<string, unknown>).sessionId as string
        : undefined,
      model: typeof (raw as Record<string, unknown>).model === 'string'
        ? (raw as Record<string, unknown>).model as string
        : undefined,
    };

    const references = Array.isArray((raw as Record<string, unknown>).references)
      ? ((raw as Record<string, unknown>).references as Array<{ path: string; content: string }>)
      : [];

    const attachmentIds = Array.isArray((raw as Record<string, unknown>).attachmentIds)
      ? ((raw as Record<string, unknown>).attachmentIds as string[])
      : [];

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
    const systemMessages: ChatMessage[] = [];
    systemMessages.push({ role: 'system', content: deps.prompts.current.system });
    if (deps.prompts.current.rules.length > 0) {
      systemMessages.push({ role: 'system', content: deps.prompts.current.rules });
    }

    if (deps.skills && deps.skills.size > 0) {
      const skillsList = [...deps.skills.values()]
        .map((s) => `- **${s.name}**: ${s.description}`)
        .join('\n');
      systemMessages.push({
        role: 'system',
        content: `Available workspace skills (use activate_skill tool to load full instructions):\n${skillsList}`,
      });
    }

    const typedUserMessages = userMessages as Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }>;

    // Inject @references into last user message
    if (references.length > 0) {
      const refContent = references
        .map((r) => `--- File: ${r.path} ---\n${r.content}\n--- End ---`)
        .join('\n\n');
      const lastUserIdx = typedUserMessages.reduce((acc, m, i) => (m.role === 'user' ? i : acc), -1);
      if (lastUserIdx >= 0) {
        typedUserMessages[lastUserIdx]!.content += `\n\n[Referenced files]\n${refContent}`;
      }
    }

    // Load attachments
    if (attachmentIds.length > 0 && deps.workspaceDir) {
      for (const attId of attachmentIds) {
        const att = deps.db.db.select().from(attachments)
          .where(and(eq(attachments.id, attId), eq(attachments.userId, userId)))
          .get();
        if (!att) continue;

        const absPath = pathModule.join(deps.workspaceDir, att.path);

        if (isImage(att.mimeType)) {
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
            // skip silently
          }
        }
      }
    }

    // Full messages array
    const llmMessages: ChatMessage[] = [
      ...systemMessages,
      ...typedUserMessages.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
    ];

    const toolDefs = buildToolDefinitions(deps.workspaceDir, deps.skills, deps.mcpClient);
    const toolHandlers: Record<string, ToolHandler> = buildToolHandlers(deps.workspaceDir, deps.skills, deps.mcpClient);

    // Resume after approval: replay the tool_call + inject result/denial
    if (toolApproval) {
      const tc: ToolCall = {
        id: toolApproval.toolCallId,
        type: 'function',
        function: {
          name: toolApproval.toolName,
          arguments: JSON.stringify(toolApproval.args),
        },
      };
      llmMessages.push({ role: 'assistant', content: null, tool_calls: [tc] });

      if (toolApproval.approved) {
        const handler = toolHandlers[toolApproval.toolName];
        const result = handler
          ? await handler(toolApproval.args)
          : { error: `unknown tool: ${toolApproval.toolName}` };
        llmMessages.push({
          role: 'tool',
          tool_call_id: toolApproval.toolCallId,
          content: JSON.stringify(result),
        });
      } else {
        llmMessages.push({
          role: 'tool',
          tool_call_id: toolApproval.toolCallId,
          content: JSON.stringify({
            status: 'denied',
            message: "L'utilisateur a refusé l'exécution.",
            toolName: toolApproval.toolName,
            args: toolApproval.args,
          }),
        });
      }
    }

    // Stream loop
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    function sendEvent(type: string, data: unknown) {
      void writer.write(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
    }

    const finalSessionId = sessionId;
    const runLoop = async () => {
      let step = 0;
      const maxSteps = 5;
      let accumulatedText = '';
      let totalUsage = { prompt_tokens: 0, completion_tokens: 0 };
      const collectedToolMetas: Array<Record<string, unknown>> = [];
      let pendingApproval = false;

      try {
        while (step < maxSteps) {
          step++;
          const res = await streamChat({
            apiKey: deps.openaiApiKey,
            model: resolvedModel,
            messages: llmMessages,
            tools: toolDefs.length > 0 ? toolDefs : undefined,
          });

          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let finishReason: string = '';
          const toolAcc = accumulateToolCalls();
          let stepText = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop()!;

            for (const line of lines) {
              const events = parseSSEChunks(line);
              for (const event of events) {
                if (event.type === 'content') {
                  stepText += event.text;
                  accumulatedText += event.text;
                  sendEvent('content', { text: event.text });
                } else if (event.type === 'tool_call_delta') {
                  toolAcc.push(event);
                } else if (event.type === 'done') {
                  finishReason = event.finishReason;
                  if (event.usage) {
                    totalUsage.prompt_tokens += event.usage.prompt_tokens ?? 0;
                    totalUsage.completion_tokens += event.usage.completion_tokens ?? 0;
                  }
                }
              }
            }
          }

          if (finishReason === 'tool_calls') {
            const toolCalls = toolAcc.finish();
            toolAcc.clear();

            llmMessages.push({
              role: 'assistant',
              content: stepText || null,
              tool_calls: toolCalls,
            });

            let hitApproval = false;
            for (const tc of toolCalls) {
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(tc.function.arguments || '{}');
              } catch {
                // ignore
              }
              const name = tc.function.name;

              if (TOOLS_REQUIRING_APPROVAL.includes(name)) {
                // Kill switch for shell_execute even in approval path
                if (name === 'shell_execute' && typeof args.command === 'string' && isDestructiveCommand(args.command)) {
                  const blocked = { error: 'Commande bloquée : opération destructive détectée', status: 'blocked' as const };
                  llmMessages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: JSON.stringify(blocked),
                  });
                  collectedToolMetas.push({
                    toolCallId: tc.id,
                    toolName: name,
                    args,
                    status: 'blocked',
                    result: blocked,
                  });
                  sendEvent('tool_result', { toolCallId: tc.id, toolName: name, result: blocked });
                  continue;
                }

                sendEvent('tool_approval', {
                  toolCallId: tc.id,
                  toolName: name,
                  args,
                });
                collectedToolMetas.push({
                  toolCallId: tc.id,
                  toolName: name,
                  args,
                  status: 'requires_approval',
                  result: { status: 'requires_approval', toolName: name, args },
                });
                hitApproval = true;
                pendingApproval = true;
                break;
              }

              const handler = toolHandlers[name];
              const result = handler
                ? await handler(args)
                : { error: `unknown tool: ${name}` };
              llmMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(result),
              });
              collectedToolMetas.push({
                toolCallId: tc.id,
                toolName: name,
                args,
                status: 'auto',
                result,
              });
              sendEvent('tool_result', { toolCallId: tc.id, toolName: name, result });
            }

            if (hitApproval) break;
            continue;
          }

          // stop or other terminal reason
          break;
        }

        sendEvent('done', { usage: totalUsage, pendingApproval });
      } catch (err) {
        if (err instanceof OpenAIError && err.status === 429) {
          sendEvent('error', {
            code: 'provider_rate_limit',
            message: 'OpenAI rate limit reached',
            link: 'https://platform.openai.com/settings/organization/limits',
          });
        } else {
          sendEvent('error', { message: err instanceof Error ? err.message : 'Unknown error' });
        }
      } finally {
        // Persist messages + usage
        try {
          const finishTs = now();
          const lastUserMessage = [...typedUserMessages]
            .reverse()
            .find((m) => m.role === 'user');

          if (lastUserMessage) {
            deps.db.db
              .insert(messages)
              .values({
                id: newId(),
                sessionId: finalSessionId,
                role: 'user',
                contentJson: JSON.stringify({ text: lastUserMessage.content }),
                model: null,
                createdAt: finishTs - 1,
              })
              .run();
          }

          deps.db.db
            .insert(messages)
            .values({
              id: newId(),
              sessionId: finalSessionId,
              role: 'assistant',
              contentJson: JSON.stringify({ text: accumulatedText }),
              model: resolvedModel,
              toolMeta: collectedToolMetas.length > 0 ? JSON.stringify(collectedToolMetas) : null,
              createdAt: finishTs,
            })
            .run();

          const inputTokens = totalUsage.prompt_tokens;
          const outputTokens = totalUsage.completion_tokens;
          const costUsd = costOf(resolvedModel, inputTokens, outputTokens);

          deps.db.db
            .insert(usageEvents)
            .values({
              id: newId(),
              userId,
              sessionId: finalSessionId,
              createdAt: finishTs,
              model: resolvedModel,
              inputTokens,
              outputTokens,
              reasoningTokens: 0,
              audioInputSeconds: 0,
              audioOutputSeconds: 0,
              costUsd,
            })
            .run();

          deps.db.db
            .update(chatSessions)
            .set({ lastMessageAt: finishTs, updatedAt: finishTs })
            .where(eq(chatSessions.id, finalSessionId))
            .run();

          // Alerts
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

          // Auto-title for new sessions
          if (isNewSession && lastUserMessage) {
            const firstMessage = lastUserMessage.content;
            chat({
              apiKey: deps.openaiApiKey,
              model: 'gpt-5.4-nano',
              messages: [
                {
                  role: 'system',
                  content:
                    'Generate a short title (5-6 words max, in the language of the user message) for a chat. Return ONLY the title.',
                },
                { role: 'user', content: firstMessage },
              ],
              maxTokens: 30,
            })
              .then(({ text: titleText }) => {
                deps.db.db
                  .update(chatSessions)
                  .set({ title: titleText.trim(), updatedAt: now() })
                  .where(eq(chatSessions.id, finalSessionId))
                  .run();
              })
              .catch((err: unknown) => {
                console.warn('[api] title generation failed', err);
              });
          }
        } catch (persistErr) {
          console.warn('[api] persistence error', persistErr);
        }

        await writer.close();
      }
    };

    void runLoop();

    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    });
    if (isNewSession) headers.set('x-session-id', sessionId);
    return new Response(readable, { headers });
  });

  return app;
}
