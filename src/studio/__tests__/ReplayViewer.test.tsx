import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReplayViewer, maskRrwebEvents } from '../ReplayViewer';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('ReplayViewer (src/studio/ReplayViewer.tsx)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('maskRrwebEvents', () => {
    it('masks full snapshot text nodes and incremental text mutations', () => {
      const sampleEvents = [
        {
          type: 4, // Meta
          data: { href: 'https://example.com' },
          timestamp: 1000,
        },
        {
          type: 2, // FullSnapshot
          data: {
            node: {
              type: 1,
              childNodes: [
                {
                  type: 3,
                  textContent: 'Sensitive Account Balance $1,000,000',
                },
              ],
            },
          },
          timestamp: 1000,
        },
        {
          type: 3, // IncrementalSnapshot: texts
          data: {
            texts: [
              { id: 10, value: 'Confidential Note' },
            ],
          },
          timestamp: 2000,
        },
        {
          type: 3, // IncrementalSnapshot with mutation adds
          data: {
            adds: [
              {
                parentId: 1,
                nextId: null,
                node: {
                  type: 2,
                  tagName: 'div',
                  attributes: {
                    title: 'Private Tooltip',
                    'aria-label': 'Secret Button',
                  },
                  childNodes: [
                    {
                      type: 3,
                      textContent: 'Dynamic Toast Message',
                    },
                  ],
                },
              },
            ],
          },
          timestamp: 3000,
        },
      ];

      const masked = maskRrwebEvents(sampleEvents);
      expect(masked[1].data.node.childNodes[0].textContent).toBe('[MASKED]');
      expect(masked[2].data.texts[0].value).toBe('[MASKED]');
      expect(masked[3].data.adds[0].node.childNodes[0].textContent).toBe('[MASKED]');
      expect(masked[3].data.adds[0].node.attributes.title).toBe('[MASKED]');
      expect(masked[3].data.adds[0].node.attributes['aria-label']).toBe('[MASKED]');
      // Original events should not be mutated
      expect(sampleEvents[1].data.node.childNodes[0].textContent).toBe(
        'Sensitive Account Balance $1,000,000'
      );
    });

    it('returns empty array when events is not an array', () => {
      expect(maskRrwebEvents(null as unknown as any[])).toEqual([]);
      expect(maskRrwebEvents(undefined as unknown as any[])).toEqual([]);
    });
  });

  describe('Component Rendering', () => {
    it('renders fallback iframe when rrweb events are absent or fewer than 2', async () => {
      const initialHtml = '<html><body><h1 id="test-heading">Hello World</h1></body></html>';

      await act(async () => {
        root = createRoot(container);
        root.render(
          <ReplayViewer
            events={[]}
            initialDomSnapshot={initialHtml}
            maskAllText={false}
            currentTimeMs={0}
            isPlaying={false}
          />
        );
      });

      const iframe = container.querySelector<HTMLIFrameElement>(
        '[data-testid="studio-replayed-iframe"]'
      );
      expect(iframe).not.toBeNull();
      const srcDoc = iframe?.getAttribute('srcdoc') || iframe?.srcDoc || '';
      expect(srcDoc).toContain('Hello World');
    });

    it('masks all text in fallback snapshot when maskAllText is true', async () => {
      const initialHtml = '<html><body><h1>Super Secret</h1></body></html>';

      await act(async () => {
        root = createRoot(container);
        root.render(
          <ReplayViewer
            events={[]}
            initialDomSnapshot={initialHtml}
            maskAllText={true}
            currentTimeMs={0}
            isPlaying={false}
          />
        );
      });

      const iframe = container.querySelector<HTMLIFrameElement>(
        '[data-testid="studio-replayed-iframe"]'
      );
      expect(iframe).not.toBeNull();
      const srcDoc = iframe?.getAttribute('srcdoc') || iframe?.srcDoc || '';
      expect(srcDoc).toContain('[MASKED]');
      expect(srcDoc).not.toContain('Super Secret');
    });

    it('renders empty placeholder when no events and no initial snapshot are provided', async () => {
      await act(async () => {
        root = createRoot(container);
        root.render(
          <ReplayViewer
            events={[]}
            initialDomSnapshot=""
            maskAllText={false}
            currentTimeMs={0}
            isPlaying={false}
          />
        );
      });

      const emptyEl = container.querySelector('[data-testid="studio-empty-snapshot"]');
      expect(emptyEl).not.toBeNull();
    });
  });
});
