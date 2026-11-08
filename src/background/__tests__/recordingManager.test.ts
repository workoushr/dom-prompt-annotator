import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearRecordingSessionMemory,
  deleteRecordingSession,
  deleteStudioAnnotation,
  getRecordingSession,
  listRecordingSessions,
  saveRecordingSession,
  saveStudioAnnotation,
  updateStudioSession,
} from '../recordingManager';
import { handleRuntimeMessage } from '../index';
import { RecordingSession, AnnotationItem } from '../../types/annotation';

const mockSession: RecordingSession = {
  sessionId: 'test_session_1',
  url: 'https://example.com/test',
  title: 'Test Page',
  createdAt: '2026-11-08T00:00:00.000Z',
  durationMs: 5000,
  viewport: { width: 393, height: 852 },
  globalInstruction: 'Test global instruction',
  maskingConfig: {
    autoMaskPII: true,
    maskAllText: false,
    maskSelectors: ['input[type="password"]'],
    maskColor: '#FF00FF',
    visualMaskEnabled: true,
  },
  rrwebEvents: [],
  actionLogs: [
    {
      id: 'act_1',
      offsetMs: 1000,
      kind: 'click',
      targetSelector: 'button#btn',
      summary: 'クリック: button#btn',
    },
  ],
  annotations: [
    {
      id: 1,
      timestampMs: 1000,
      instruction: 'ボタンの色を変更',
      maskText: false,
      createdAt: '2026-11-08T00:00:01.000Z',
      element: {
        tagName: 'button',
        id: 'btn',
        className: 'btn-primary',
        selector: 'button#btn',
        xpath: '//button[@id="btn"]',
        attributes: {},
        textContent: '送信',
        outerHTMLSnippet: '<button id="btn">送信</button>',
        rect: { x: 10, y: 10, width: 100, height: 40 },
        computedStyles: {},
        framework: null,
      },
    },
  ],
};

describe('RecordingManager (src/background/recordingManager.ts)', () => {
  beforeEach(() => {
    clearRecordingSessionMemory();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).chrome;
  });

  it('saves and retrieves recording session in memory store', async () => {
    await saveRecordingSession(mockSession);
    const retrieved = await getRecordingSession('test_session_1');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.sessionId).toBe('test_session_1');
    expect(retrieved?.url).toBe('https://example.com/test');
    expect(retrieved?.actionLogs.length).toBe(1);
    expect(retrieved?.annotations.length).toBe(1);
  });

  it('lists recording sessions sorted by createdAt descending', async () => {
    const session2: RecordingSession = {
      ...mockSession,
      sessionId: 'test_session_2',
      createdAt: '2026-11-08T01:00:00.000Z',
    };

    await saveRecordingSession(mockSession);
    await saveRecordingSession(session2);

    const list = await listRecordingSessions();
    expect(list.length).toBe(2);
    expect(list[0].sessionId).toBe('test_session_2');
    expect(list[1].sessionId).toBe('test_session_1');
  });

  it('deletes recording session correctly', async () => {
    await saveRecordingSession(mockSession);
    const deleted = await deleteRecordingSession('test_session_1');
    expect(deleted).toBe(true);

    const retrieved = await getRecordingSession('test_session_1');
    expect(retrieved).toBeNull();
  });

  it('saves, updates, and deletes studio annotations within session', async () => {
    await saveRecordingSession(mockSession);

    // Add new annotation
    const newAnn: AnnotationItem = {
      id: 2,
      timestampMs: 3000,
      instruction: 'トーストの文言変更',
      maskText: true,
      createdAt: '2026-11-08T00:00:03.000Z',
      element: {
        tagName: 'div',
        id: 'toast',
        className: 'toast',
        selector: 'div#toast',
        xpath: '//div[@id="toast"]',
        attributes: {},
        textContent: '完了',
        outerHTMLSnippet: '<div id="toast">完了</div>',
        rect: { x: 0, y: 0, width: 200, height: 50 },
        computedStyles: {},
        framework: null,
      },
    };

    const updated = await saveStudioAnnotation('test_session_1', newAnn);
    expect(updated?.annotations.length).toBe(2);
    expect(updated?.annotations.find((a) => a.id === 2)?.instruction).toBe('トーストの文言変更');

    // Update existing annotation
    const modifiedAnn: AnnotationItem = {
      ...newAnn,
      instruction: 'トーストの表示時間を延長',
    };
    const updatedAgain = await saveStudioAnnotation('test_session_1', modifiedAnn);
    expect(updatedAgain?.annotations.length).toBe(2);
    expect(updatedAgain?.annotations.find((a) => a.id === 2)?.instruction).toBe(
      'トーストの表示時間を延長'
    );

    // Delete annotation
    const afterDelete = await deleteStudioAnnotation('test_session_1', 1);
    expect(afterDelete?.annotations.length).toBe(1);
    expect(afterDelete?.annotations[0].id).toBe(2);
  });

  it('updates studio session with partial patch', async () => {
    await saveRecordingSession(mockSession);

    const updated = await updateStudioSession('test_session_1', {
      globalInstruction: 'Updated global instructions for LLM',
      maskingConfig: {
        ...mockSession.maskingConfig,
        maskAllText: true,
      },
    });

    expect(updated?.globalInstruction).toBe('Updated global instructions for LLM');
    expect(updated?.maskingConfig.maskAllText).toBe(true);
    expect(updated?.sessionId).toBe('test_session_1');
  });

  it('handles background message routing for studio session events', async () => {
    const createTabMock = vi.fn().mockResolvedValue({ id: 99 });
    const getURLMock = vi.fn((path: string) => `chrome-extension://dummy/${path}`);

    (globalThis as Record<string, unknown>).chrome = {
      runtime: {
        getURL: getURLMock,
      },
      tabs: {
        create: createTabMock,
      },
    };

    // 1. SAVE_RECORDING_SESSION with openStudioTab: true
    let saveResponse: any = null;
    handleRuntimeMessage(
      {
        type: 'SAVE_RECORDING_SESSION',
        session: mockSession,
        openStudioTab: true,
      },
      {} as any,
      (res) => {
        saveResponse = res;
      }
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(saveResponse).toEqual({ ok: true, sessionId: 'test_session_1' });
    expect(createTabMock).toHaveBeenCalledWith({
      url: 'chrome-extension://dummy/studio/index.html?sessionId=test_session_1',
    });

    // 2. GET_RECORDING_SESSION
    let getResponse: any = null;
    handleRuntimeMessage(
      {
        type: 'GET_RECORDING_SESSION',
        sessionId: 'test_session_1',
      },
      {} as any,
      (res) => {
        getResponse = res;
      }
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(getResponse?.ok).toBe(true);
    expect(getResponse?.session?.sessionId).toBe('test_session_1');

    // 3. UPDATE_STUDIO_SESSION
    let updateResponse: any = null;
    handleRuntimeMessage(
      {
        type: 'UPDATE_STUDIO_SESSION',
        sessionId: 'test_session_1',
        patch: { durationMs: 8000 },
      },
      {} as any,
      (res) => {
        updateResponse = res;
      }
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(updateResponse?.ok).toBe(true);
    expect(updateResponse?.session?.durationMs).toBe(8000);
  });
});
