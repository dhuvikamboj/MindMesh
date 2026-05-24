import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getDb, initDatabase } from '@/lib/db';
import { ChatSession, ChatTurn } from '@/types/agent';

const DEFAULT_TITLE = 'New chat';

const createSession = (): ChatSession => {
  const now = new Date().toISOString();
  return {
    id: `s-${Date.now()}`,
    title: DEFAULT_TITLE,
    turns: [],
    createdAt: now,
    updatedAt: now,
  };
};

const insertSessionRow = async (session: ChatSession) => {
  await getDb().execute(
    `INSERT OR REPLACE INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?);`,
    [session.id, session.title, session.createdAt, session.updatedAt]
  );
};

const setCurrentMeta = async (id: string | null) => {
  await getDb().execute(
    `INSERT OR REPLACE INTO app_meta (key, value) VALUES ('current_session', ?);`,
    [id ?? '']
  );
};

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const sessionsRef = useRef<ChatSession[]>([]);
  sessionsRef.current = sessions;

  useEffect(() => {
    let isActive = true;

    (async () => {
      try {
        await initDatabase();
        const db = getDb();
        const sessionRes = await db.execute(
          `SELECT id, title, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC;`
        );
        const turnRes = await db.execute(
          `SELECT id, session_id, role, text, tool_name, created_at, image_uris FROM chat_turns ORDER BY session_id, seq;`
        );
        const metaRes = await db.execute(
          `SELECT value FROM app_meta WHERE key = 'current_session';`
        );
        if (!isActive) {
          return;
        }

        const turnRows = (turnRes.rows ?? []) as {
          id: string;
          session_id: string;
          role: ChatTurn['role'];
          text: string;
          tool_name: string | null;
          created_at: string;
          image_uris: string | null;
        }[];
        const turnsBySession = new Map<string, ChatTurn[]>();
        for (const row of turnRows) {
          const list = turnsBySession.get(row.session_id) ?? [];
          let imageUris: string[] | undefined;
          if (row.image_uris) {
            try {
              const parsed = JSON.parse(row.image_uris);
              if (Array.isArray(parsed) && parsed.length) {
                imageUris = parsed;
              }
            } catch {
              // ignore malformed
            }
          }
          list.push({
            id: row.id,
            role: row.role,
            text: row.text,
            toolName: row.tool_name ?? undefined,
            imageUris,
            createdAt: row.created_at,
          });
          turnsBySession.set(row.session_id, list);
        }

        const sessionRows = (sessionRes.rows ?? []) as {
          id: string;
          title: string;
          created_at: string;
          updated_at: string;
        }[];
        const loaded: ChatSession[] = sessionRows.map((row) => ({
          id: row.id,
          title: row.title,
          turns: turnsBySession.get(row.id) ?? [],
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));

        if (loaded.length) {
          setSessions(loaded);
          const storedCurrent = (metaRes.rows?.[0] as { value?: string } | undefined)?.value;
          setCurrentSessionId(
            storedCurrent && loaded.some((s) => s.id === storedCurrent)
              ? storedCurrent
              : loaded[0].id
          );
        } else {
          const first = createSession();
          await insertSessionRow(first);
          await setCurrentMeta(first.id);
          setSessions([first]);
          setCurrentSessionId(first.id);
        }
      } catch {
        if (isActive) {
          const first = createSession();
          setSessions([first]);
          setCurrentSessionId(first.id);
        }
      } finally {
        if (isActive) {
          setIsHydrating(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === currentSessionId) ?? null,
    [sessions, currentSessionId]
  );

  const currentTurns = currentSession?.turns ?? [];

  const newSession = useCallback(() => {
    const session = createSession();
    setSessions((current) => [session, ...current]);
    setCurrentSessionId(session.id);
    insertSessionRow(session).catch(() => undefined);
    setCurrentMeta(session.id).catch(() => undefined);
    return session.id;
  }, []);

  const selectSession = useCallback((id: string) => {
    setCurrentSessionId(id);
    setCurrentMeta(id).catch(() => undefined);
  }, []);

  const deleteSession = useCallback((id: string) => {
    const remaining = sessionsRef.current.filter((session) => session.id !== id);
    getDb()
      .execute(`DELETE FROM chat_turns WHERE session_id = ?;`, [id])
      .catch(() => undefined);
    getDb()
      .execute(`DELETE FROM chat_sessions WHERE id = ?;`, [id])
      .catch(() => undefined);

    if (remaining.length) {
      setSessions(remaining);
      setCurrentSessionId((previous) => {
        if (previous && previous !== id) {
          return previous;
        }
        setCurrentMeta(remaining[0].id).catch(() => undefined);
        return remaining[0].id;
      });
    } else {
      const fresh = createSession();
      insertSessionRow(fresh).catch(() => undefined);
      setCurrentMeta(fresh.id).catch(() => undefined);
      setSessions([fresh]);
      setCurrentSessionId(fresh.id);
    }
  }, []);

  const appendTurn = useCallback(
    (turn: ChatTurn) => {
      const sessionId = currentSessionId;
      if (!sessionId) {
        return;
      }
      const session = sessionsRef.current.find((entry) => entry.id === sessionId);
      const seq = session?.turns.length ?? 0;
      const updatedAt = new Date().toISOString();
      const nextTitle =
        session && session.title === DEFAULT_TITLE && turn.role === 'user'
          ? turn.text.slice(0, 40)
          : session?.title ?? DEFAULT_TITLE;

      getDb()
        .execute(
          `INSERT OR REPLACE INTO chat_turns
            (id, session_id, role, text, tool_name, created_at, seq, image_uris)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            turn.id,
            sessionId,
            turn.role,
            turn.text,
            turn.toolName ?? null,
            turn.createdAt,
            seq,
            turn.imageUris?.length ? JSON.stringify(turn.imageUris) : null,
          ]
        )
        .catch(() => undefined);
      getDb()
        .execute(`UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?;`, [
          nextTitle,
          updatedAt,
          sessionId,
        ])
        .catch(() => undefined);

      setSessions((current) =>
        current.map((entry) =>
          entry.id === sessionId
            ? {
                ...entry,
                turns: [...entry.turns, turn],
                title: nextTitle,
                updatedAt,
              }
            : entry
        )
      );
    },
    [currentSessionId]
  );

  return {
    sessions,
    currentSessionId,
    currentSession,
    currentTurns,
    isSessionsHydrating: isHydrating,
    newSession,
    selectSession,
    deleteSession,
    appendTurn,
  };
}
