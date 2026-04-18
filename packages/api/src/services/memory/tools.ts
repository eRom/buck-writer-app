// packages/api/src/services/memory/tools.ts
// OpenAI function-tool wrappers around the memory services.
// Shape matches packages/api/src/lib/openai.ts `ToolDefinition` + a handler
// compatible with packages/api/src/routes/chat-tools.ts `ToolHandler`.
import type { ToolDefinition } from '../../lib/openai.js';
import type { ToolHandler } from '../../routes/chat-tools.js';
import type { createRecallService } from './recall.js';
import type { createRememberService } from './remember.js';

export interface ToolPair {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export function recallTool(recall: ReturnType<typeof createRecallService>): ToolPair {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'recall',
        description: 'Retrieve relevant memories by semantic similarity from long-term memory.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural-language query to match memories against.' },
            type: { type: 'string', enum: ['episodic', 'semantic'], description: 'Optional filter on memory type.' },
            count: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
          },
          required: ['query'],
        },
      },
    },
    handler: async (args) => {
      const query = typeof args.query === 'string' ? args.query : '';
      if (!query) return { error: 'query required' };
      const type = args.type === 'episodic' || args.type === 'semantic' ? args.type : undefined;
      const count = typeof args.count === 'number' ? args.count : 5;
      return recall.recall({ query, type, count });
    },
  };
}

export function rememberTool(remember: ReturnType<typeof createRememberService>): ToolPair {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'remember',
        description: 'Persist a durable fact or episode into long-term memory.',
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string', maxLength: 2000 },
            type: { type: 'string', enum: ['episodic', 'semantic'] },
            importance: { type: 'number', minimum: 0, maximum: 1, default: 0.5 },
            metadata: { type: 'object', additionalProperties: true },
          },
          required: ['content', 'type'],
        },
      },
    },
    handler: async (args) => {
      const content = typeof args.content === 'string' ? args.content : '';
      const type = args.type === 'episodic' || args.type === 'semantic' ? args.type : undefined;
      if (!content || !type) return { error: 'content and type required' };
      const importance = typeof args.importance === 'number' ? args.importance : 0.5;
      const metadata = (args.metadata && typeof args.metadata === 'object')
        ? (args.metadata as Record<string, unknown>)
        : undefined;
      return remember.remember({ content, type, importance, metadata });
    },
  };
}
