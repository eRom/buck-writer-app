import { eq } from 'drizzle-orm';
import type { DbHandles } from '../db/client.js';
import { userSettings } from '../db/schema.js';

export function getOrCreateSettings(db: DbHandles, userId: string) {
  let row = db.db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!row) {
    db.db.insert(userSettings).values({ userId }).run();
    row = db.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .get()!;
  }

  return row;
}
