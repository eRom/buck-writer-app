import { Hono } from 'hono';
import { eq, and, isNull } from 'drizzle-orm';
import { streamText, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { newId, ChatRequestInput, MODELS, costOf } from '@buck/shared';
import type { DbHandles } from '../db/client.js';
import type { Prompts } from '../services/prompts.js';
import { chatSessions, messages, usageEvents, userSettings } from '../db/schema.js';

export interface ChatRouteDeps {
  db: DbHandles;
  prompts: Prompts;
  openaiApiKey: string;
  nowMs?: () => number;
}

export function createChatRoute(
  deps: ChatRouteDeps,
): Hono<{ Variables: { userId: string } }> {
  const now = deps.nowMs ?? Date.now;
  const app = new Hono<{ Variables: { userId: string } }>();
  const openai = createOpenAI({ apiKey: deps.openaiApiKey });

  // POST / — streaming chat
  app.post('/', async (c) => {
    const userId = c.get('userId');
    const raw = await c.req.json().catch(() => ({}));

    // Extract messages separately from the ChatRequestInput schema
    const { messages: userMessages, ...rest } = raw as {
      messages?: unknown[];
      [key: string]: unknown;
    };

    // Validate messages
    if (
      !userMessages ||
      !Array.isArray(userMessages) ||
      userMessages.length === 0
    ) {
      return c.json(
        { error: { code: 'invalid_input', message: 'messages required' } },
        422,
      );
    }

    // Parse ChatRequestInput (sessionId + model)
    const parsed = ChatRequestInput.safeParse(rest);
    if (!parsed.success) {
      return c.json(
        { error: { code: 'invalid_input', message: 'invalid body' } },
        422,
      );
    }
    const body = parsed.data;

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

    // Validate and type cast user messages
    const typedUserMessages = userMessages as Array<{
      role: string;
      content: string;
    }>;

    // Build the full messages array — cast to any to avoid version-specific type gymnastics
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allMessages: any[] = [...systemMessages, ...typedUserMessages];

    // Stream the response
    const result = streamText({
      model: openai(resolvedModel),
      messages: allMessages,
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
      // We need to return the response with the x-session-id header
      const headers = new Headers(response.headers);
      headers.set('x-session-id', sessionId!);
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }

    return response;
  });

  return app;
}
