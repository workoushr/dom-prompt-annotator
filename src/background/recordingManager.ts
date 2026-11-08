import { AnnotationItem, RecordingSession } from '../types/annotation';

const SESSION_STORAGE_PREFIX = 'dpa_recording_session_';
const SESSION_INDEX_KEY = 'dpa_recording_session_index';

// In-memory cache for fast access and fallback in non-extension or testing environments
const sessionMemoryStore = new Map<string, RecordingSession>();

function getStorageArea(): chrome.storage.StorageArea | null {
  if (
    typeof chrome !== 'undefined' &&
    chrome.storage &&
    chrome.storage.local
  ) {
    return chrome.storage.local;
  }
  return null;
}

export async function saveRecordingSession(session: RecordingSession): Promise<void> {
  if (!session || !session.sessionId) {
    throw new Error('Invalid recording session or missing sessionId');
  }

  sessionMemoryStore.set(session.sessionId, { ...session });

  const storage = getStorageArea();
  if (storage) {
    const key = `${SESSION_STORAGE_PREFIX}${session.sessionId}`;
    await new Promise<void>((resolve) => {
      storage.set({ [key]: session }, () => resolve());
    });

    // Update index list
    await new Promise<void>((resolve) => {
      storage.get([SESSION_INDEX_KEY], (res) => {
        const rawList = res?.[SESSION_INDEX_KEY];
        const list: string[] = Array.isArray(rawList) ? rawList : [];
        if (!list.includes(session.sessionId)) {
          list.push(session.sessionId);
          storage.set({ [SESSION_INDEX_KEY]: list }, () => resolve());
        } else {
          resolve();
        }
      });
    });
  }
}

export async function getRecordingSession(
  sessionId: string
): Promise<RecordingSession | null> {
  if (!sessionId) {
    return null;
  }

  if (sessionMemoryStore.has(sessionId)) {
    return { ...sessionMemoryStore.get(sessionId)! };
  }

  const storage = getStorageArea();
  if (storage) {
    const key = `${SESSION_STORAGE_PREFIX}${sessionId}`;
    const result = await new Promise<Record<string, unknown>>((resolve) => {
      storage.get([key], (res) => resolve(res || {}));
    });

    const session = result[key] as RecordingSession | undefined;
    if (session && session.sessionId === sessionId) {
      sessionMemoryStore.set(sessionId, { ...session });
      return { ...session };
    }
  }

  return null;
}

export async function listRecordingSessions(): Promise<RecordingSession[]> {
  const sessions: RecordingSession[] = [];
  const seenIds = new Set<string>();

  for (const session of sessionMemoryStore.values()) {
    sessions.push({ ...session });
    seenIds.add(session.sessionId);
  }

  const storage = getStorageArea();
  if (storage) {
    const indexResult = await new Promise<Record<string, unknown>>((resolve) => {
      storage.get([SESSION_INDEX_KEY], (res) => resolve(res || {}));
    });
    const ids: string[] = Array.isArray(indexResult[SESSION_INDEX_KEY])
      ? (indexResult[SESSION_INDEX_KEY] as string[])
      : [];

    const missingKeys = ids
      .filter((id) => !seenIds.has(id))
      .map((id) => `${SESSION_STORAGE_PREFIX}${id}`);

    if (missingKeys.length > 0) {
      const items = await new Promise<Record<string, unknown>>((resolve) => {
        storage.get(missingKeys, (res) => resolve(res || {}));
      });
      for (const k of missingKeys) {
        const sess = items[k] as RecordingSession | undefined;
        if (sess && sess.sessionId) {
          sessionMemoryStore.set(sess.sessionId, { ...sess });
          sessions.push({ ...sess });
          seenIds.add(sess.sessionId);
        }
      }
    }
  }

  return sessions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function deleteRecordingSession(sessionId: string): Promise<boolean> {
  const existedInMemory = sessionMemoryStore.delete(sessionId);
  let existedInStorage = false;

  const storage = getStorageArea();
  if (storage) {
    const key = `${SESSION_STORAGE_PREFIX}${sessionId}`;
    await new Promise<void>((resolve) => {
      storage.remove(key, () => {
        existedInStorage = true;
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      storage.get([SESSION_INDEX_KEY], (res) => {
        const rawList = res?.[SESSION_INDEX_KEY];
        const list: string[] = Array.isArray(rawList) ? rawList : [];
        const nextList = list.filter((id) => id !== sessionId);
        storage.set({ [SESSION_INDEX_KEY]: nextList }, () => resolve());
      });
    });
  }

  return existedInMemory || existedInStorage;
}

export async function saveStudioAnnotation(
  sessionId: string,
  annotation: AnnotationItem
): Promise<RecordingSession | null> {
  const session = await getRecordingSession(sessionId);
  if (!session) {
    return null;
  }

  const existingIdx = session.annotations.findIndex((a) => a.id === annotation.id);
  if (existingIdx >= 0) {
    session.annotations[existingIdx] = { ...annotation };
  } else {
    session.annotations.push({ ...annotation });
  }

  await saveRecordingSession(session);
  return { ...session };
}

export async function deleteStudioAnnotation(
  sessionId: string,
  annotationId: number
): Promise<RecordingSession | null> {
  const session = await getRecordingSession(sessionId);
  if (!session) {
    return null;
  }

  session.annotations = session.annotations.filter((a) => a.id !== annotationId);
  await saveRecordingSession(session);
  return { ...session };
}

export async function updateStudioSession(
  sessionId: string,
  patch: Partial<RecordingSession>
): Promise<RecordingSession | null> {
  const session = await getRecordingSession(sessionId);
  if (!session) {
    return null;
  }

  const updatedSession: RecordingSession = {
    ...session,
    ...patch,
    sessionId: session.sessionId, // ensure immutable id
  };

  await saveRecordingSession(updatedSession);
  return { ...updatedSession };
}

export function clearRecordingSessionMemory(): void {
  sessionMemoryStore.clear();
}
