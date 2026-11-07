import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateCssSelector,
  generateXPath,
  findElementBySelectorOrXPath,
  extractComputedStyles,
  extractOuterHTMLSnippet,
  extractElementMetadata,
  getParentCandidate,
  getFirstChildCandidate,
} from '../domExtractor';
import { DEFAULT_MASKING_CONFIG } from '../../types/annotation';

describe('DOM Metadata Extractor (domExtractor.ts)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('generateCssSelector', () => {
    it('prioritizes unique #id and [data-testid]', () => {
      document.body.innerHTML = `
        <div id="main-header">
          <button data-testid="login-submit" class="btn primary">Sign In</button>
        </div>
      `;

      const header = document.getElementById('main-header')!;
      const btn = document.querySelector('[data-testid="login-submit"]')!;

      expect(generateCssSelector(header)).toBe('#main-header');
      expect(generateCssSelector(btn)).toBe('[data-testid="login-submit"]');
    });

    it('uses semantic classes and :nth-of-type disambiguation when siblings share tags/classes', () => {
      document.body.innerHTML = `
        <section id="pricing">
          <div class="plan-card">Basic</div>
          <div class="plan-card">Pro</div>
          <div class="plan-card">Enterprise</div>
        </section>
      `;

      const cards = document.querySelectorAll('.plan-card');
      const secondCard = cards[1]!;
      const selector = generateCssSelector(secondCard);

      expect(selector).toContain(':nth-of-type(2)');
      expect(document.querySelector(selector)).toBe(secondCard);
    });

    it('escapes special characters in IDs and Tailwind class names (hover:bg-blue-500, w-1/2, [&_svg]:size-4) with CSS.escape and fallback', () => {
      document.body.innerHTML = `
        <div id="radix-:r1:">
          <button class="hover:bg-blue-500 w-1/2 [&_svg]:size-4">Tailwind Button</button>
          <span class="[&_svg]:size-4">Icon Text</span>
        </div>
      `;

      const radixDiv = document.getElementById('radix-:r1:')!;
      const twBtn = document.querySelector('button')!;
      const twSpan = document.querySelector('span')!;

      const idSelector = generateCssSelector(radixDiv);
      expect(document.querySelector(idSelector)).toBe(radixDiv);

      const btnSelector = generateCssSelector(twBtn);
      expect(document.querySelector(btnSelector)).toBe(twBtn);

      const spanSelector = generateCssSelector(twSpan);
      expect(document.querySelector(spanSelector)).toBe(twSpan);

      // Also verify fallback when CSS.escape is undefined
      const originalCss = globalThis.CSS;
      try {
        // @ts-expect-error testing fallback when CSS is undefined
        globalThis.CSS = undefined;
        const fallbackBtnSelector = generateCssSelector(twBtn);
        expect(document.querySelector(fallbackBtnSelector)).toBe(twBtn);
      } finally {
        globalThis.CSS = originalCss;
      }
    });
  });

  describe('generateXPath & findElementBySelectorOrXPath', () => {
    it('generates XPath with id shortcut or full path and resolves elements accurately', () => {
      document.body.innerHTML = `
        <main id="app-main">
          <ul>
            <li>First item</li>
            <li class="target-item">Second item</li>
          </ul>
        </main>
      `;

      const main = document.getElementById('app-main')!;
      expect(generateXPath(main)).toBe('//*[@id="app-main"]');

      const secondLi = document.querySelector('.target-item') as HTMLElement;
      const xpath = generateXPath(secondLi);
      expect(xpath).toBe('/html/body/main/ul/li[2]');

      // Resolve via valid CSS selector
      expect(
        findElementBySelectorOrXPath('.target-item', xpath, document)
      ).toBe(secondLi);

      // Resolve via XPath fallback when CSS selector is broken or outdated
      expect(
        findElementBySelectorOrXPath(':::invalid-selector', xpath, document)
      ).toBe(secondLi);
      expect(
        findElementBySelectorOrXPath('#non-existent-id', xpath, document)
      ).toBe(secondLi);
    });
  });

  describe('extractComputedStyles', () => {
    it('extracts relevant computed styles and omits empty defaults', () => {
      const box = document.createElement('div');
      box.style.display = 'flex';
      box.style.position = 'relative';
      box.style.fontSize = '16px';
      box.style.padding = '12px';
      box.style.gap = '8px';
      document.body.appendChild(box);

      const styles = extractComputedStyles(box);
      expect(styles.display).toBe('flex');
      expect(styles.position).toBe('relative');
      expect(styles.fontSize).toBe('16px');
      expect(styles.padding).toBe('12px');
      expect(styles.gap).toBe('8px');
    });
  });

  describe('extractOuterHTMLSnippet', () => {
    it('strips internal data-dpa-* attributes and truncates long HTML cleanly', () => {
      const container = document.createElement('div');
      container.id = 'long-box';
      container.className = 'content-area';
      container.setAttribute('data-dpa-inspect-target', 'req-123');
      container.innerHTML = `<p data-dpa-temp="1">${'A'.repeat(600)}</p>`;

      const snippet = extractOuterHTMLSnippet(container, 120);
      expect(snippet).not.toContain('data-dpa-');
      expect(snippet.startsWith('<div id="long-box" class="content-area">')).toBe(
        true
      );
      expect(snippet.endsWith('</div>')).toBe(true);
      expect(snippet).toContain('...');
      expect(snippet.length).toBeLessThanOrEqual(120);
    });
  });

  describe('getParentCandidate & getFirstChildCandidate', () => {
    it('traverses up stopping before document.body and traverses down skipping #dpa-root-host, script, and style', () => {
      document.body.innerHTML = `
        <div id="outer-wrap">
          <script>console.log("ignore")</script>
          <style>.ignore {}</style>
          <div id="dpa-root-host"></div>
          <section id="inner-section">
            <button id="action-btn">Action</button>
          </section>
        </div>
      `;

      const outer = document.getElementById('outer-wrap')!;
      const inner = document.getElementById('inner-section')!;
      const btn = document.getElementById('action-btn')!;

      // Going up: btn -> inner -> outer -> null (stops at document.body)
      expect(getParentCandidate(btn)).toBe(inner);
      expect(getParentCandidate(inner)).toBe(outer);
      expect(getParentCandidate(outer)).toBeNull();
      expect(getParentCandidate(document.body)).toBeNull();

      // Going down from outer: skips script, style, and #dpa-root-host -> selects #inner-section
      expect(getFirstChildCandidate(outer)).toBe(inner);
      expect(getFirstChildCandidate(inner)).toBe(btn);
      expect(getFirstChildCandidate(btn)).toBeNull();
    });
  });

  describe('extractElementMetadata', () => {
    it('extracts full ElementMetadata and applies masking when maskingConfig is provided', () => {
      document.body.innerHTML = `
        <div id="user-card" class="card p-4" data-testid="user-card">
          Contact: admin@corp.example.com
        </div>
      `;

      const card = document.getElementById('user-card')!;
      const rawMeta = extractElementMetadata(card);

      expect(rawMeta.tagName).toBe('div');
      expect(rawMeta.id).toBe('user-card');
      expect(rawMeta.selector).toBe('#user-card');
      expect(rawMeta.xpath).toBe('//*[@id="user-card"]');
      expect(rawMeta.textContent).toBe('Contact: admin@corp.example.com');

      const maskedMeta = extractElementMetadata(
        card,
        DEFAULT_MASKING_CONFIG,
        false
      );
      expect(maskedMeta.textContent).toBe('Contact: [MASKED_EMAIL]');
      expect(maskedMeta.outerHTMLSnippet).toContain('[MASKED_EMAIL]');

      const forceMaskedMeta = extractElementMetadata(
        card,
        DEFAULT_MASKING_CONFIG,
        true
      );
      expect(forceMaskedMeta.textContent).toBe('[MASKED]');
    });

    it('handles SVG elements cleanly where el.className is an SVGAnimatedString object', () => {
      document.body.innerHTML = `
        <svg id="icon-svg" class="w-6 h-6 text-blue-500" viewBox="0 0 24 24">
          <path id="icon-path" class="fill-current" d="M12 2L2 22h20L12 2z" />
        </svg>
      `;

      const svg = document.getElementById('icon-svg')!;
      const path = document.getElementById('icon-path')!;

      const svgMeta = extractElementMetadata(svg);
      expect(svgMeta.tagName).toBe('svg');
      expect(svgMeta.className).toBe('w-6 h-6 text-blue-500');
      expect(svgMeta.selector).toBe('#icon-svg');

      const pathMeta = extractElementMetadata(path);
      expect(pathMeta.tagName).toBe('path');
      expect(pathMeta.className).toBe('fill-current');
      expect(pathMeta.selector).toBe('#icon-path');
    });
  });
});
