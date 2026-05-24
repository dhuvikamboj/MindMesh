import { open, type DB } from '@op-engineering/op-sqlite';

import { readStoredJson, storagePaths } from '@/lib/storage';
import { ChatSession, UserFact } from '@/types/agent';
import { KnowledgeItem } from '@/types/knowledge';

export const EMBEDDING_DIM = 768;

let db: DB | null = null;
let vecEnabled = false;
let initPromise: Promise<void> | null = null;

export const getDb = (): DB => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

export const isVecEnabled = (): boolean => vecEnabled;

const createSchema = async (database: DB) => {
  await database.execute(
    `CREATE TABLE IF NOT EXISTS knowledge_items (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT
    );`
  );
  await database.execute(
    `CREATE TABLE IF NOT EXISTS user_facts (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at TEXT
    );`
  );
  await database.execute(
    `CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at TEXT,
      updated_at TEXT
    );`
  );
  await database.execute(
    `CREATE TABLE IF NOT EXISTS chat_turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT,
      text TEXT,
      tool_name TEXT,
      created_at TEXT,
      seq INTEGER,
      image_uris TEXT
    );`
  );
  // Legacy DBs may pre-date the image_uris column — add it idempotently.
  try {
    await database.execute(`ALTER TABLE chat_turns ADD COLUMN image_uris TEXT;`);
  } catch {
    // column already exists
  }
  await database.execute(
    `CREATE INDEX IF NOT EXISTS idx_turns_session ON chat_turns(session_id, seq);`
  );
  await database.execute(
    `CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT);`
  );

  // sqlite-vec virtual table — best effort. Falls back to JS cosine if unavailable.
  const vecCandidates = [
    `CREATE VIRTUAL TABLE IF NOT EXISTS vec_facts USING vec0(fact_id TEXT PRIMARY KEY, embedding float[${EMBEDDING_DIM}] distance_metric=cosine);`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS vec_facts USING vec0(fact_id TEXT PRIMARY KEY, embedding float[${EMBEDDING_DIM}]);`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS vec_facts USING vec0(embedding float[${EMBEDDING_DIM}]);`,
  ];
  for (const sql of vecCandidates) {
    try {
      await database.execute(sql);
      vecEnabled = true;
      console.log('[MindMesh db] vec_facts created with:', sql);
      break;
    } catch (error) {
      console.log('[MindMesh db] vec_facts attempt failed:', (error as Error)?.message);
    }
  }
  if (!vecEnabled) {
    console.log('[MindMesh db] sqlite-vec unavailable — JS cosine fallback');
  }

  // knowledge_embeddings — stores content text + raw embedding for JS cosine fallback
  await database.execute(
    `CREATE TABLE IF NOT EXISTS knowledge_embeddings (
      item_id TEXT PRIMARY KEY,
      content_text TEXT,
      embedding TEXT NOT NULL,
      updated_at TEXT
    );`
  );

  // vec_knowledge — ANN search over knowledge items for RAG
  if (vecEnabled) {
    const vecKnowledgeCandidates = [
      `CREATE VIRTUAL TABLE IF NOT EXISTS vec_knowledge USING vec0(item_id TEXT PRIMARY KEY, embedding float[${EMBEDDING_DIM}] distance_metric=cosine);`,
      `CREATE VIRTUAL TABLE IF NOT EXISTS vec_knowledge USING vec0(item_id TEXT PRIMARY KEY, embedding float[${EMBEDDING_DIM}]);`,
    ];
    for (const sql of vecKnowledgeCandidates) {
      try {
        await database.execute(sql);
        console.log('[MindMesh db] vec_knowledge created');
        break;
      } catch (err) {
        console.log('[MindMesh db] vec_knowledge attempt failed:', (err as Error)?.message);
      }
    }
  }
};

/** One-time import of legacy JSON stores into SQLite. */
const migrateJsonStores = async (database: DB) => {
  const flag = await database.execute(`SELECT value FROM app_meta WHERE key = 'json_migrated';`);
  if (flag.rows && flag.rows.length > 0) {
    return;
  }

  try {
    const items = await readStoredJson<KnowledgeItem[]>(storagePaths.library);
    for (const item of items ?? []) {
      await database.execute(
        `INSERT OR REPLACE INTO knowledge_items (id, data, updated_at) VALUES (?, ?, ?);`,
        [item.id, JSON.stringify(item), item.updatedAt ?? item.createdAt ?? '']
      );
    }
  } catch {
    // ignore — no legacy library
  }

  try {
    const facts = await readStoredJson<UserFact[]>(storagePaths.memory);
    for (const fact of facts ?? []) {
      await database.execute(
        `INSERT OR REPLACE INTO user_facts (id, text, embedding, created_at) VALUES (?, ?, ?, ?);`,
        [fact.id, fact.text, JSON.stringify(fact.embedding), fact.createdAt]
      );
      if (vecEnabled) {
        try {
          await database.execute(
            `INSERT OR REPLACE INTO vec_facts (fact_id, embedding) VALUES (?, ?);`,
            [fact.id, JSON.stringify(fact.embedding)]
          );
        } catch {
          // ignore vec insert failure
        }
      }
    }
  } catch {
    // ignore — no legacy memory
  }

  try {
    const persisted = await readStoredJson<{
      sessions: ChatSession[];
      currentSessionId: string | null;
    }>(storagePaths.sessions);
    for (const session of persisted?.sessions ?? []) {
      await database.execute(
        `INSERT OR REPLACE INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?);`,
        [session.id, session.title, session.createdAt, session.updatedAt]
      );
      for (let index = 0; index < session.turns.length; index += 1) {
        const turn = session.turns[index];
        await database.execute(
          `INSERT OR REPLACE INTO chat_turns
            (id, session_id, role, text, tool_name, created_at, seq)
            VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [
            turn.id,
            session.id,
            turn.role,
            turn.text,
            turn.toolName ?? null,
            turn.createdAt,
            index,
          ]
        );
      }
    }
    if (persisted?.currentSessionId) {
      await database.execute(
        `INSERT OR REPLACE INTO app_meta (key, value) VALUES ('current_session', ?);`,
        [persisted.currentSessionId]
      );
    }
  } catch {
    // ignore — no legacy sessions
  }

  await database.execute(
    `INSERT OR REPLACE INTO app_meta (key, value) VALUES ('json_migrated', '1');`
  );
};

const doInit = async () => {
  try {
    console.log('[MindMesh db] opening mindmesh.db');
    db = open({ name: 'mindmesh.db' });
    console.log('[MindMesh db] open ok, creating schema');
    await createSchema(db);
    console.log('[MindMesh db] schema ok, migrating json');
    await migrateJsonStores(db);
    console.log('[MindMesh db] init complete, vecEnabled =', vecEnabled);
  } catch (error) {
    console.log('[MindMesh db] init failed:', (error as Error)?.message, (error as Error)?.stack);
    throw error;
  }
};

export const initDatabase = (): Promise<void> => {
  if (!initPromise) {
    initPromise = doInit();
  }
  return initPromise;
};
