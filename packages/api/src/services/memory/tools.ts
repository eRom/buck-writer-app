// packages/api/src/services/memory/tools.ts
// Function-tool wrappers (Responses API shape) around the memory services.
import type { FunctionToolDef } from '../../lib/openai.js';
import type { ToolHandler } from '../../routes/chat-tools.js';
import type { createRecallService } from './recall.js';
import type { createRememberService } from './remember.js';

export interface ToolPair {
  definition: FunctionToolDef;
  handler: ToolHandler;
}

export function recallTool(recall: ReturnType<typeof createRecallService>): ToolPair {
  return {
    definition: {
      type: 'function',
      name: 'recall',
      description:
        'Retrieve relevant memories by semantic similarity from long-term memory.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural-language query to match memories against.',
          },
          type: {
            type: 'string',
            enum: ['episodic', 'semantic'],
            description: 'Optional filter on memory type.',
          },
          count: { type: 'integer', minimum: 1, maximum: 20 },
        },
        required: ['query'],
      },
      strict: false,
    },
    handler: async (args) => {
      const query = typeof args.query === 'string' ? args.query : '';
      if (!query) return { error: 'query required' };
      const type =
        args.type === 'episodic' || args.type === 'semantic' ? args.type : undefined;
      const count = typeof args.count === 'number' ? args.count : 5;
      return recall.recall({ query, type, count });
    },
  };
}

export function rememberTool(
  remember: ReturnType<typeof createRememberService>,
): ToolPair {
  return {
    definition: {
      type: 'function',
      name: 'remember',
      description: 'Persist a durable fact or episode into long-term memory.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', maxLength: 2000 },
          type: { type: 'string', enum: ['episodic', 'semantic'] },
          importance: { type: 'number', minimum: 0, maximum: 1 },
          metadata: { type: 'object', additionalProperties: true },
        },
        required: ['content', 'type'],
      },
      strict: false,
    },
    handler: async (args) => {
      const content = typeof args.content === 'string' ? args.content : '';
      const type =
        args.type === 'episodic' || args.type === 'semantic' ? args.type : undefined;
      if (!content || !type) return { error: 'content and type required' };
      const importance =
        typeof args.importance === 'number' ? args.importance : 0.5;
      const metadata =
        args.metadata && typeof args.metadata === 'object'
          ? (args.metadata as Record<string, unknown>)
          : undefined;
      return remember.remember({ content, type, importance, metadata });
    },
  };
}
