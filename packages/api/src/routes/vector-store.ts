import { Hono } from 'hono';
import type { DbHandles } from '../db/client.js';
import {
  syncKnowledgeToVectorStore,
  getVectorStoreStatus,
} from '../services/vectorStore.js';

export interface VectorStoreRouteDeps {
  db: DbHandles;
  workspaceDir: string;
  openaiApiKey: string;
  nowMs?: () => number;
  fetchImpl?: typeof fetch;
}

export function createVectorStoreRoutes(
  deps: VectorStoreRouteDeps,
): Hono<{ Variables: { userId: string } }> {
  const app = new Hono<{ Variables: { userId: string } }>();

  app.get('/', (c) => {
    const userId = c.get('userId');
    return c.json(getVectorStoreStatus(deps.db, userId));
  });

  app.post('/sync', async (c) => {
    const userId = c.get('userId');
    try {
      const summary = await syncKnowledgeToVectorStore(
        deps.db,
        userId,
        deps.workspaceDir,
        deps.openaiApiKey,
        deps.nowMs,
        deps.fetchImpl,
      );
      return c.json(summary);
    } catch (err) {
      return c.json(
        {
          error: {
            code: 'vector_store_sync_failed',
            message: (err as Error).message,
          },
        },
        502,
      );
    }
  });

  return app;
}
