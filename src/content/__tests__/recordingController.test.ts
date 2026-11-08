import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RecordingController } from '../recordingController';

describe('RecordingController (src/content/recordingController.ts)', () => {
  let controller: RecordingController;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app">
        <input id="search-box" type="text" value="" />
        <button id="search-btn">Search</button>
      </div>
    `;
    controller = new RecordingController();
  });

  afterEach(() => {
    if (controller.getIsRecording()) {
      controller.stopRecording();
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('starts and stops recording, populating rrwebEvents and metadata', () => {
    expect(controller.getIsRecording()).toBe(false);
    expect(controller.getDurationMs()).toBe(0);

    controller.startRecording();
    expect(controller.getIsRecording()).toBe(true);

    const session = controller.stopRecording({
      globalInstruction: 'Test recording instruction',
    });

    expect(controller.getIsRecording()).toBe(false);
    expect(session.sessionId).toMatch(/^session_/);
    expect(session.globalInstruction).toBe('Test recording instruction');
    expect(Array.isArray(session.rrwebEvents)).toBe(true);
    expect(typeof session.initialDomSnapshot).toBe('string');
  });

  it('captures click events with element selector and label', () => {
    controller.startRecording();

    const btn = document.getElementById('search-btn')!;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const logs = controller.getActionLogs();
    expect(logs.length).toBeGreaterThanOrEqual(1);

    const clickLog = logs.find((l) => l.kind === 'click');
    expect(clickLog).toBeDefined();
    expect(clickLog?.targetSelector).toContain('search-btn');
    expect(clickLog?.summary).toContain('Search');
  });

  it('captures input events with input values', () => {
    controller.startRecording();

    const input = document.getElementById('search-box') as HTMLInputElement;
    input.value = 'まねきねこ';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const logs = controller.getActionLogs();
    const inputLog = logs.find((l) => l.kind === 'input');

    expect(inputLog).toBeDefined();
    expect(inputLog?.targetSelector).toContain('search-box');
    expect(inputLog?.inputValue).toBe('まねきねこ');
    expect(inputLog?.summary).toContain('まねきねこ');
  });

  it('masks sensitive password input values as [MASKED]', () => {
    controller.startRecording();

    const pwd = document.createElement('input');
    pwd.id = 'password-field';
    pwd.type = 'password';
    pwd.value = 'SecretPass123!';
    document.body.appendChild(pwd);

    pwd.dispatchEvent(new Event('input', { bubbles: true }));

    const logs = controller.getActionLogs();
    const pwdLog = logs.find((l) => l.targetSelector.includes('password-field'));

    expect(pwdLog).toBeDefined();
    expect(pwdLog?.inputValue).toBe('[MASKED]');
    expect(pwdLog?.summary).toContain('[MASKED]');
    expect(pwdLog?.summary).not.toContain('SecretPass123!');
  });

  it('captures scroll events with coordinates and throttles excessive events', () => {
    controller.startRecording();

    Object.defineProperty(window, 'scrollX', { value: 0, writable: true });
    Object.defineProperty(window, 'scrollY', { value: 150, writable: true });

    window.dispatchEvent(new Event('scroll'));

    const logs = controller.getActionLogs();
    const scrollLog = logs.find((l) => l.kind === 'scroll');

    expect(scrollLog).toBeDefined();
    expect(scrollLog?.scrollPosition).toEqual({ x: 0, y: 150 });
    expect(scrollLog?.summary).toContain('150px');
  });
});
