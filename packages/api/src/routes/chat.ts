import { Hono } from 'hono';
import { eq, and, isNull, gte, lt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  newId,
  costOf,
  getBillingPeriod,
  imageCost,
  GPT_IMAGE_2_MODEL,
  type ImageQuality,
  type ImageEntry,
} from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import type { PromptsRef } from '../services/prompts.js';
import type { Skill } from '../services/skills.js';
import {
  chatSessions,
  messages,
  usageEvents,
  userSettings,
  alertTriggers,
  attachments,
  mcpCallEvents,
} from '../db/schema.js';
import { isImage } from '../services/extractor.js';
import {
  extractAttachment,
  formatAttachmentBlock,
  type AttachmentRow,
} from '../services/attachmentExtractor.js';
import type { MarkitdownClient } from '../services/markitdown.js';
import {
  streamResponses,
  respond,
  createSSEBuffer,
  OpenAIError,
} from '../lib/openai.js';
import type {
  ResponsesInputItem,
  ResponsesRequestBody,
  ToolDef,
  ResponsesUsage,
} from '../lib/openai.js';
import { buildToolDefinitions, buildToolHandlers } from './chat-tools.js';
import type { ToolHandler } from './chat-tools.js';
import type { MemoryServices } from '../services/memory/bootstrap.js';
import { recallTool, rememberTool } from '../services/memory/tools.js';
import { buildSystemPromptWithMemory } from '../lib/prompts.js';
import { buildMcpConnectorTools } from '../services/mcp-registry.js';

// Local tools that require explicit user approval. Shell uses a hard whitelist
// and is allowed to run without friction.
const TOOLS_REQUIRING_APPROVAL = ['create_file', 'delete_file'];

const MAX_STEPS = 8;

export interface ChatRouteDeps {
  db: DbHandles;
  prompts: PromptsRef;
  openaiApiKey: string;
  workspaceDir?: string;
  skills?: Map<string, Skill>;
  nowMs?: () => number;
  memory?: MemoryServices;
  buckUserId?: string;
  /**
   * MarkItDown sidecar client for extracting attachments (PDF, images, DOCX,
   * PPTX, XLSX) to markdown. When absent, those attachments are marked
   * `skipped` and not injected in the prompt.
   */
  markitdown?: MarkitdownClient;
}

interface ToolMeta {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'auto' | 'requires_approval' | 'denied';
  result: unknown;
}

// Accumulator for streaming function_call items (args arrive as deltas).
interface PendingFnCall {
  itemId: string;
  callId: string;
  name: string;
  args: string;
}

export function createChatRoute(
  deps: ChatRouteDeps,
): Hono<{ Variables: { userId: string } }> {
  const now = deps.nowMs ?? Date.now;
  const app = new Hono<{ Variables: { userId: string } }>();

  app.post('/', async (c) => {
    const userId = c.get('userId');
    const raw = await c.req.json().catch(() => ({}));
    const rawRec = raw as Record<string, unknown>;

    const rawMessages = (raw as { messages?: unknown[] }).messages;
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return c.json(
        { error: { code: 'invalid_input', message: 'messages required' } },
        422,
      );
    }

    const userMessages = rawMessages.map((m: unknown) => {
      const msg = m as {
        role: string;
        content?: string;
        parts?: Array<{ type: string; text?: string }>;
      };
      const content =
        msg.content ??
        msg.parts
          ?.filter((p) => p.type === 'text')
          .map((p) => p.text ?? '')
          .join('') ??
        '';
      return { role: msg.role, content };
    });

    const sessionIdIn = typeof rawRec.sessionId === 'string' ? rawRec.sessionId : undefined;
    const modelIn = typeof rawRec.model === 'string' ? rawRec.model : undefined;
    const references = Array.isArray(rawRec.references)
      ? (rawRec.references as Array<{ path: string; content: string }>)
      : [];
    const attachmentIds = Array.isArray(rawRec.attachmentIds)
      ? (rawRec.attachmentIds as string[])
      : [];

    const toolApproval = rawRec.toolApproval
      ? {
          callId: String(
            ((rawRec.toolApproval as Record<string, unknown>).callId ??
              (rawRec.toolApproval as Record<string, unknown>).toolCallId) ?? '',
          ),
          toolName: String(
            (rawRec.toolApproval as Record<string, unknown>).toolName ?? '',
          ),
          args:
            ((rawRec.toolApproval as Record<string, unknown>).args as Record<
              string,
              unknown
            >) ?? {},
          approved: Boolean(
            (rawRec.toolApproval as Record<string, unknown>).approved,
          ),
        }
      : null;

    const mcpApproval = rawRec.mcpApproval
      ? {
          approvalRequestId: String(
            (rawRec.mcpApproval as Record<string, unknown>).approvalRequestId ?? '',
          ),
          approved: Boolean(
            (rawRec.mcpApproval as Record<string, unknown>).approved,
          ),
        }
      : null;

    const ts = now();
    let sessionId = sessionIdIn;
    let isNewSession = false;
    let sessionRow: typeof chatSessions.$inferSelect | undefined;

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
      sessionRow = session;
    } else {
      const newSessionId = newId();
      const inserted = {
        id: newSessionId,
        userId,
        title: 'Nouvelle conversation',
        model: modelIn ?? 'gpt-5.4-mini',
        reasoningEffort: 'low',
        archived: 0,
        createdAt: ts,
        updatedAt: ts,
      };
      deps.db.db.insert(chatSessions).values(inserted).run();
      sessionId = newSessionId;
      isNewSession = true;
      sessionRow = { ...inserted, isFavorite: 0, deletedAt: null, lastMessageAt: null, lastResponseId: null };
    }

    const settingsRow = deps.db.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .get();

    let resolvedModel: string = 'gpt-5.4-mini';
    if (modelIn) {
      resolvedModel = modelIn;
    } else if (sessionRow?.model) {
      resolvedModel = sessionRow.model;
    } else if (settingsRow?.defaultModel) {
      resolvedModel = settingsRow.defaultModel;
    }

    const chatTools: { webSearch?: boolean; fileSearch?: boolean; imageGen?: boolean } = settingsRow?.chatToolsJson
      ? (JSON.parse(settingsRow.chatToolsJson) as { webSearch?: boolean; fileSearch?: boolean; imageGen?: boolean })
      : {};

    // Memory context — fail-soft.
    const memoryUserId = deps.buckUserId ?? userId;
    const memoryContext = deps.memory
      ? await deps.memory.buildContext(memoryUserId)
      : { preferences: {}, activeContext: {}, degraded: false };

    // Build `instructions` — concat dans l'ordre SYSTEM → TOOLS → RULES → skills.
    // SYSTEM reçoit l'injection dynamique des préférences/contexte via buildSystemPromptWithMemory.
    const instructionsParts: string[] = [];
    instructionsParts.push(
      buildSystemPromptWithMemory({
        base: deps.prompts.current.system,
        preferences: memoryContext.preferences,
        activeContext: memoryContext.activeContext,
      }),
    );
    if (deps.prompts.current.tools.length > 0) {
      instructionsParts.push(deps.prompts.current.tools);
    }
    if (deps.prompts.current.rules.length > 0) {
      instructionsParts.push(deps.prompts.current.rules);
    }
    if (deps.skills && deps.skills.size > 0) {
      const skillsList = [...deps.skills.values()]
        .map((s) => `- **${s.name}**: ${s.description}`)
        .join('\n');
      instructionsParts.push(
        `Available workspace skills (use activate_skill tool to load full instructions):\n${skillsList}`,
      );
    }
    const instructions = instructionsParts.join('\n\n---\n\n');

    // Last user message is the one we just received. Inject refs/attachments.
    const typedUserMessages = userMessages as Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }>;
    const lastUserIdx = typedUserMessages.reduce(
      (acc, m, i) => (m.role === 'user' ? i : acc),
      -1,
    );

    if (references.length > 0 && lastUserIdx >= 0) {
      const refContent = references
        .map((r) => `--- File: ${r.path} ---\n${r.content}\n--- End ---`)
        .join('\n\n');
      typedUserMessages[lastUserIdx]!.content += `\n\n[Referenced files]\n${refContent}`;
    }

    if (attachmentIds.length > 0 && deps.workspaceDir && lastUserIdx >= 0) {
      const extractorDeps = {
        db: deps.db,
        workspaceDir: deps.workspaceDir,
        markitdown: deps.markitdown,
        now,
      };
      for (const attId of attachmentIds) {
        const att = deps.db.db
          .select()
          .from(attachments)
          .where(and(eq(attachments.id, attId), eq(attachments.userId, userId)))
          .get();
        if (!att) continue;

        const result = await extractAttachment(att as AttachmentRow, extractorDeps);
        const block = formatAttachmentBlock(att.filename, att.mimeType, result);
        if (block) {
          typedUserMessages[lastUserIdx]!.content += `\n\n${block}`;
        } else if (isImage(att.mimeType) && result.status !== 'ok') {
          // Image not extractable (no markitdown or failure) — surface as a
          // placeholder so the model at least knows an image was attached.
          typedUserMessages[lastUserIdx]!.content += `\n\n[Image jointe non extraite: ${att.filename}]`;
        }
      }
    }

    // Build tools[] — local function tools + MCP connectors (remote).
    const localFunctionDefs = buildToolDefinitions(deps.workspaceDir, deps.skills);
    const toolHandlers: Record<string, ToolHandler> = buildToolHandlers(
      deps.workspaceDir,
      deps.skills,
      { db: deps.db, userId, nowMs: now },
    );

    if (deps.memory?.enabled) {
      const rc = recallTool(deps.memory.recall);
      const rm = rememberTool(deps.memory.remember);
      localFunctionDefs.push(rc.definition, rm.definition);
      toolHandlers[rc.definition.name] = rc.handler;
      toolHandlers[rm.definition.name] = rm.handler;
    }

    const mcpConnectorDefs = buildMcpConnectorTools(deps.db);
    const toolDefs: ToolDef[] = [...localFunctionDefs, ...mcpConnectorDefs];
    if (chatTools.webSearch) {
      toolDefs.push({ type: 'web_search_preview' });
    }
    if (chatTools.fileSearch && settingsRow?.vectorStoreId) {
      toolDefs.push({
        type: 'file_search',
        vector_store_ids: [settingsRow.vectorStoreId],
        max_num_results: 5,
      });
    }
    const imageQuality = (settingsRow?.imageQuality ?? 'medium') as ImageQuality;
    const imageSize = (settingsRow?.imageSize ?? '1024x1024') as
      | '1024x1024'
      | '1536x1024'
      | '1024x1536'
      | 'auto';
    if (chatTools.imageGen) {
      toolDefs.push({
        type: 'image_generation',
        action: 'auto',
        quality: imageQuality,
        size: imageSize,
        partial_images: 2,
        output_format: 'png',
        moderation: 'low',
        background: 'auto',
      });
    }

    // Decide what goes into `input` for the first request.
    // - Approval resume : just the continuation item + previous_response_id.
    // - Otherwise : full conversation (system is in instructions, not input).
    let inputItems: ResponsesInputItem[] | string;
    let previousResponseId: string | undefined = sessionRow?.lastResponseId ?? undefined;

    if (toolApproval) {
      // Replay the approved/denied function call.
      const resultPayload = toolApproval.approved
        ? await (async () => {
            const handler = toolHandlers[toolApproval.toolName];
            return handler
              ? await handler(toolApproval.args)
              : { error: `unknown tool: ${toolApproval.toolName}` };
          })()
        : {
            status: 'denied',
            message: "L'utilisateur a refuse l'execution.",
            toolName: toolApproval.toolName,
            args: toolApproval.args,
          };
      inputItems = [
        {
          type: 'function_call_output',
          call_id: toolApproval.callId,
          output: JSON.stringify(resultPayload),
        },
      ];
    } else if (mcpApproval) {
      inputItems = [
        {
          type: 'mcp_approval_response',
          approve: mcpApproval.approved,
          approval_request_id: mcpApproval.approvalRequestId,
        },
      ];
    } else if (previousResponseId) {
      // Follow-up turn in an existing session — send only the new user message.
      const newestUser = typedUserMessages[lastUserIdx];
      inputItems = newestUser
        ? [{ role: 'user', content: newestUser.content }]
        : [];
    } else {
      // First turn — send full history.
      inputItems = typedUserMessages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));
    }

    // SSE stream back to browser.
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    function sendEvent(type: string, data: unknown): void {
      void writer.write(
        encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`),
      );
    }

    if (memoryContext.degraded) {
      sendEvent('memory_status', { degraded: true });
    }

    const finalSessionId = sessionId;

    const runLoop = async (): Promise<void> => {
      let accumulatedText = '';
      const totalUsage = {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      };
      const collectedToolMetas: ToolMeta[] = [];
      const finalImages: ImageEntry[] = [];
      const imageUsageRows: Array<{ callId: string; costUsd: number }> = [];
      let pendingApproval = false;
      let lastRespId: string | undefined = previousResponseId;
      let step = 0;

      try {
        while (step < MAX_STEPS) {
          step++;

          const body: ResponsesRequestBody = {
            model: resolvedModel,
            instructions,
            input: inputItems,
            tools: toolDefs.length > 0 ? toolDefs : undefined,
            tool_choice: 'auto',
            store: true,
            ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
          };

          const res = await streamResponses({ apiKey: deps.openaiApiKey, body });
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          const sseBuf = createSSEBuffer();

          const pendingFnCalls = new Map<string, PendingFnCall>();
          const stepFnCallsDone: PendingFnCall[] = [];
          const mcpInFlight = new Map<
            string,
            { serverLabel: string; toolName: string; startedAt: number }
          >();
          const imageInFlight = new Set<string>();
          let stepDone = false;
          let approvalRequestedInStep = false;

          while (!stepDone) {
            const { done, value } = await reader.read();
            const events = done
              ? sseBuf.flush()
              : sseBuf.push(decoder.decode(value, { stream: true }));

            for (const ev of events) {
              switch (ev.type) {
                case 'response.created':
                  lastRespId = ev.response?.id;
                  break;

                case 'response.output_text.delta':
                  accumulatedText += ev.delta;
                  sendEvent('content', { text: ev.delta });
                  break;

                case 'response.output_item.added': {
                  const item = ev.item;
                  if (item.type === 'function_call') {
                    pendingFnCalls.set(item.id, {
                      itemId: item.id,
                      callId: item.call_id ?? '',
                      name: item.name ?? '',
                      args: '',
                    });
                  } else if (item.type === 'mcp_call') {
                    mcpInFlight.set(item.id, {
                      serverLabel: item.server_label ?? 'unknown',
                      toolName: item.name ?? 'unknown',
                      startedAt: now(),
                    });
                  } else if (item.type === 'image_generation_call') {
                    if (!imageInFlight.has(item.id)) {
                      imageInFlight.add(item.id);
                      sendEvent('tool_started', {
                        callId: item.id,
                        toolCallId: item.id,
                        toolName: 'image_generation',
                      });
                    }
                  }
                  break;
                }

                case 'response.function_call_arguments.delta': {
                  const call = pendingFnCalls.get(ev.item_id);
                  if (call) call.args += ev.delta;
                  break;
                }

                case 'response.function_call_arguments.done': {
                  const call = pendingFnCalls.get(ev.item_id);
                  if (call) {
                    call.args = ev.arguments;
                    stepFnCallsDone.push(call);
                  }
                  break;
                }

                case 'response.output_item.done': {
                  const item = ev.item;
                  if (item.type === 'mcp_approval_request') {
                    sendEvent('mcp_approval', {
                      approvalRequestId: item.id,
                      serverLabel: item.server_label,
                      toolName: item.name,
                      arguments: item.arguments,
                    });
                    collectedToolMetas.push({
                      toolCallId: item.id,
                      toolName: `mcp:${item.server_label}:${item.name}`,
                      args: safeJson(item.arguments ?? '{}'),
                      status: 'requires_approval',
                      result: { status: 'requires_approval' },
                    });
                    approvalRequestedInStep = true;
                    pendingApproval = true;
                  } else if (item.type === 'mcp_call') {
                    collectedToolMetas.push({
                      toolCallId: item.id,
                      toolName: `mcp:${item.server_label}:${item.name}`,
                      args: safeJson(item.arguments ?? '{}'),
                      status: 'auto',
                      result: item.error ? { error: item.error } : item.output ?? {},
                    });
                  } else if (item.type === 'image_generation_call') {
                    const b64 = item.result ?? '';
                    const revisedPrompt = item.revised_prompt;
                    const entry: ImageEntry = {
                      callId: item.id,
                      b64,
                      size: imageSize,
                      revisedPrompt,
                      createdAt: now(),
                    };
                    finalImages.push(entry);
                    const costUsd = imageCost(imageQuality, imageSize);
                    imageUsageRows.push({ callId: item.id, costUsd });
                    sendEvent('image_done', {
                      callId: item.id,
                      b64,
                      revisedPrompt,
                      size: imageSize,
                    });
                    collectedToolMetas.push({
                      toolCallId: item.id,
                      toolName: 'image_generation',
                      args: { quality: imageQuality, size: imageSize },
                      status: 'auto',
                      result: { size: imageSize, revisedPrompt: revisedPrompt ?? null },
                    });
                    imageInFlight.delete(item.id);
                  }
                  break;
                }

                case 'response.mcp_call.in_progress': {
                  const info = mcpInFlight.get(ev.item_id);
                  sendEvent('mcp_call_started', {
                    itemId: ev.item_id,
                    serverLabel: info?.serverLabel ?? 'mcp',
                    toolName: info?.toolName ?? '',
                  });
                  break;
                }

                case 'response.mcp_call.completed': {
                  const info = mcpInFlight.get(ev.item_id);
                  sendEvent('mcp_call_done', {
                    itemId: ev.item_id,
                    serverLabel: info?.serverLabel,
                    toolName: info?.toolName,
                  });
                  if (info) {
                    deps.db.db.insert(mcpCallEvents).values({
                      id: newId(),
                      userId,
                      sessionId: finalSessionId,
                      serverLabel: info.serverLabel,
                      toolName: info.toolName,
                      status: 'completed',
                      durationMs: Math.max(0, now() - info.startedAt),
                      errorMessage: null,
                      createdAt: now(),
                    }).run();
                    mcpInFlight.delete(ev.item_id);
                  }
                  break;
                }

                case 'response.image_generation_call.generating':
                case 'response.image_generation_call.in_progress': {
                  if (!imageInFlight.has(ev.item_id)) {
                    imageInFlight.add(ev.item_id);
                    sendEvent('tool_started', {
                      callId: ev.item_id,
                      toolCallId: ev.item_id,
                      toolName: 'image_generation',
                    });
                  }
                  break;
                }

                case 'response.image_generation_call.partial_image': {
                  sendEvent('image_partial', {
                    callId: ev.item_id,
                    index: ev.partial_image_index,
                    b64: ev.partial_image_b64,
                  });
                  break;
                }

                case 'response.image_generation_call.completed': {
                  // Final payload comes via response.output_item.done (below).
                  // This event only marks streaming end.
                  break;
                }

                case 'response.mcp_call.failed': {
                  const info = mcpInFlight.get(ev.item_id);
                  const errMsg =
                    typeof ev.error === 'string'
                      ? ev.error
                      : ev.error
                        ? JSON.stringify(ev.error).slice(0, 500)
                        : null;
                  sendEvent('mcp_call_error', {
                    itemId: ev.item_id,
                    serverLabel: info?.serverLabel,
                    toolName: info?.toolName,
                    error: ev.error,
                  });
                  if (info) {
                    deps.db.db.insert(mcpCallEvents).values({
                      id: newId(),
                      userId,
                      sessionId: finalSessionId,
                      serverLabel: info.serverLabel,
                      toolName: info.toolName,
                      status: 'failed',
                      durationMs: Math.max(0, now() - info.startedAt),
                      errorMessage: errMsg,
                      createdAt: now(),
                    }).run();
                    mcpInFlight.delete(ev.item_id);
                  }
                  break;
                }

                case 'response.completed': {
                  const u = ev.response.usage;
                  totalUsage.inputTokens += u.input_tokens ?? 0;
                  totalUsage.outputTokens += u.output_tokens ?? 0;
                  totalUsage.reasoningTokens +=
                    u.output_tokens_details?.reasoning_tokens ?? 0;
                  totalUsage.cachedInputTokens +=
                    u.input_tokens_details?.cached_tokens ?? 0;
                  lastRespId = ev.response.id;
                  stepDone = true;
                  break;
                }

                case 'response.failed':
                  throw new Error(
                    ev.response.error?.message ?? 'Responses API failed',
                  );
                case 'response.incomplete':
                  stepDone = true;
                  break;
                case 'error':
                  throw new Error(ev.message ?? 'Responses API error');
                default:
                  // ignore other events
                  break;
              }
              if (approvalRequestedInStep) {
                stepDone = true;
                break;
              }
            }

            if (done) break;
          }

          // If step completed with local function calls, execute them and
          // continue the loop with function_call_output items.
          if (!approvalRequestedInStep && stepFnCallsDone.length > 0) {
            const nextItems: ResponsesInputItem[] = [];
            let hitApproval = false;

            for (const fc of stepFnCallsDone) {
              const args = safeJson(fc.args);

              if (TOOLS_REQUIRING_APPROVAL.includes(fc.name)) {
                sendEvent('tool_approval', {
                  callId: fc.callId,
                  toolCallId: fc.callId, // legacy alias for existing web client
                  toolName: fc.name,
                  args,
                });
                collectedToolMetas.push({
                  toolCallId: fc.callId,
                  toolName: fc.name,
                  args,
                  status: 'requires_approval',
                  result: { status: 'requires_approval', toolName: fc.name, args },
                });
                hitApproval = true;
                pendingApproval = true;
                break;
              }

              sendEvent('tool_started', {
                callId: fc.callId,
                toolCallId: fc.callId,
                toolName: fc.name,
              });
              const handler = toolHandlers[fc.name];
              const result = handler
                ? await handler(args)
                : { error: `unknown tool: ${fc.name}` };
              nextItems.push({
                type: 'function_call_output',
                call_id: fc.callId,
                output: JSON.stringify(result),
              });
              collectedToolMetas.push({
                toolCallId: fc.callId,
                toolName: fc.name,
                args,
                status: 'auto',
                result,
              });
              sendEvent('tool_result', {
                callId: fc.callId,
                toolCallId: fc.callId,
                toolName: fc.name,
                result,
              });
            }

            if (hitApproval) break;

            // Continuation: chain with previous_response_id, send only outputs.
            previousResponseId = lastRespId;
            inputItems = nextItems;
            continue;
          }

          // Otherwise: stream ended (text or approval) — exit.
          break;
        }

        sendEvent('done', {
          usage: {
            prompt_tokens: totalUsage.inputTokens,
            completion_tokens: totalUsage.outputTokens,
          },
          pendingApproval,
        });
      } catch (err) {
        if (err instanceof OpenAIError && err.status === 429) {
          sendEvent('error', {
            code: 'provider_rate_limit',
            message: 'OpenAI rate limit reached',
            link: 'https://platform.openai.com/settings/organization/limits',
          });
        } else {
          sendEvent('error', {
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      } finally {
        try {
          const finishTs = now();

          // Persist user message (only on first turn — not on approval resume).
          const lastUserMessage = toolApproval || mcpApproval
            ? undefined
            : [...typedUserMessages].reverse().find((m) => m.role === 'user');

          if (lastUserMessage) {
            const userMsgId = newId();
            deps.db.db
              .insert(messages)
              .values({
                id: userMsgId,
                sessionId: finalSessionId,
                role: 'user',
                contentJson: JSON.stringify({ text: lastUserMessage.content }),
                model: null,
                createdAt: finishTs - 1,
              })
              .run();
            if (attachmentIds.length > 0) {
              for (const attId of attachmentIds) {
                deps.db.db
                  .update(attachments)
                  .set({ messageId: userMsgId })
                  .where(
                    and(
                      eq(attachments.id, attId),
                      eq(attachments.userId, userId),
                    ),
                  )
                  .run();
              }
            }
            sendEvent('user_saved', { id: userMsgId });
          }

          const assistantMsgId = newId();
          deps.db.db
            .insert(messages)
            .values({
              id: assistantMsgId,
              sessionId: finalSessionId,
              role: 'assistant',
              contentJson: JSON.stringify({ text: accumulatedText }),
              model: resolvedModel,
              toolMeta:
                collectedToolMetas.length > 0
                  ? JSON.stringify(collectedToolMetas)
                  : null,
              imagesJson:
                finalImages.length > 0 ? JSON.stringify(finalImages) : null,
              createdAt: finishTs,
            })
            .run();
          sendEvent('assistant_saved', { id: assistantMsgId });

          // Billing: one usage_events row per image_generation_call.
          for (const row of imageUsageRows) {
            deps.db.db
              .insert(usageEvents)
              .values({
                id: newId(),
                userId,
                sessionId: finalSessionId,
                createdAt: finishTs,
                model: GPT_IMAGE_2_MODEL,
                inputTokens: 0,
                outputTokens: 0,
                reasoningTokens: 0,
                cachedInputTokens: 0,
                audioInputSeconds: 0,
                audioOutputSeconds: 0,
                costUsd: row.costUsd,
                kind: 'image',
              })
              .run();
          }

          const costUsd = costOf(
            resolvedModel,
            totalUsage.inputTokens,
            totalUsage.outputTokens,
          );

          deps.db.db
            .insert(usageEvents)
            .values({
              id: newId(),
              userId,
              sessionId: finalSessionId,
              createdAt: finishTs,
              model: resolvedModel,
              inputTokens: totalUsage.inputTokens,
              outputTokens: totalUsage.outputTokens,
              reasoningTokens: totalUsage.reasoningTokens,
              cachedInputTokens: totalUsage.cachedInputTokens,
              audioInputSeconds: 0,
              audioOutputSeconds: 0,
              costUsd,
            })
            .run();

          const sessionUpdate: Partial<typeof chatSessions.$inferInsert> = {
            lastMessageAt: finishTs,
            updatedAt: finishTs,
          };
          if (lastRespId) sessionUpdate.lastResponseId = lastRespId;
          deps.db.db
            .update(chatSessions)
            .set(sessionUpdate)
            .where(eq(chatSessions.id, finalSessionId))
            .run();

          // Alert triggers (budget thresholds).
          const userSettingsRow = deps.db.db
            .select()
            .from(userSettings)
            .where(eq(userSettings.userId, userId))
            .get();

          if (userSettingsRow) {
            const period = getBillingPeriod(
              userSettingsRow.billingResetDay,
              finishTs,
            );
            const totalResult = deps.db.db
              .select({
                total: sql<number>`COALESCE(SUM(${usageEvents.costUsd}), 0)`,
              })
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
            const currentPercent =
              limitUsd > 0 ? (currentTotal / limitUsd) * 100 : 0;
            const thresholds: number[] = JSON.parse(
              userSettingsRow.alertThresholdsJson,
            );
            const yearMonth = new Date(period.periodStart)
              .toISOString()
              .slice(0, 7);

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

          // Auto-title for new sessions.
          if (isNewSession && lastUserMessage) {
            const firstMessage = lastUserMessage.content;
            respond({
              apiKey: deps.openaiApiKey,
              body: {
                model: 'gpt-5.4-nano',
                instructions:
                  'Generate a short title (5-6 words max, in the language of the user message) for a chat. Return ONLY the title.',
                input: firstMessage,
                max_output_tokens: 30,
                store: false,
              },
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

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// Silence unused imports linter warnings: ResponsesUsage is a re-exported type.
export type { ResponsesUsage };
