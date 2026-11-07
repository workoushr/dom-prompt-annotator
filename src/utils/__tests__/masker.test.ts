import { describe, it, expect, beforeEach } from 'vitest';
import {
  maskPII,
  maskTextString,
  isElementMatchedByMaskSelectors,
  findMaskedElementsOnPage,
  maskHtmlSnippet,
  applyMaskingToElementMetadata,
  applyMaskingToAnnotation,
  applyMaskingToExportPayload,
} from '../masker';
import {
  AnnotationItem,
  DEFAULT_MASKING_CONFIG,
  ElementMetadata,
  ExportPayload,
  MaskingConfig,
} from '../../types/annotation';

describe('Playwright-style Masking Engine (masker.ts)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('maskPII', () => {
    it('masks email addresses with [MASKED_EMAIL]', () => {
      expect(maskPII('Contact alice.smith+test@example.co.jp for info')).toBe(
        'Contact [MASKED_EMAIL] for info'
      );
      expect(maskPII('Multiple: a@b.com and c@d.org')).toBe(
        'Multiple: [MASKED_EMAIL] and [MASKED_EMAIL]'
      );
    });

    it('masks Bearer tokens, JWTs, OpenAI sk- keys, and GitHub ghp_ tokens with [MASKED_TOKEN]', () => {
      expect(maskPII('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')).toBe(
        'Authorization: [MASKED_TOKEN]'
      );
      expect(maskPII('Token is eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWRtaW4ifQ.signature12345')).toBe(
        'Token is [MASKED_TOKEN]'
      );
      expect(maskPII('OpenAI key: sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz123456')).toBe(
        'OpenAI key: [MASKED_TOKEN]'
      );
      expect(maskPII('GitHub PAT: ghp_1234567890abcdefABCDEF1234567890ab')).toBe(
        'GitHub PAT: [MASKED_TOKEN]'
      );
    });

    it('masks credit card numbers (13-19 digits with spaces or dashes) with [MASKED_CARD]', () => {
      expect(maskPII('Card: 4111 1111 1111 1234')).toBe('Card: [MASKED_CARD]');
      expect(maskPII('Amex: 3782-822463-10005')).toBe('Amex: [MASKED_CARD]');
      expect(maskPII('Raw 16 digits: 5500000000000004')).toBe(
        'Raw 16 digits: [MASKED_CARD]'
      );
    });

    it('masks JP, US, and international phone numbers with [MASKED_PHONE]', () => {
      expect(maskPII('JP Mobile: 090-1234-5678')).toBe(
        'JP Mobile: [MASKED_PHONE]'
      );
      expect(maskPII('JP Landline: 03-1234-5678')).toBe(
        'JP Landline: [MASKED_PHONE]'
      );
      expect(maskPII('Intl JP: +81-90-1234-5678')).toBe(
        'Intl JP: [MASKED_PHONE]'
      );
      expect(maskPII('US Phone: (555) 123-4567')).toBe(
        'US Phone: [MASKED_PHONE]'
      );
    });

    it('preserves normal non-PII text, dates/timestamps, pixel values, and CSS classes without false positives', () => {
      const safe = 'Submit Order #42 for 3 items ($129.99)';
      expect(maskPII(safe)).toBe(safe);
      expect(maskPII('2026-11-06 10:20:30')).toBe('2026-11-06 10:20:30');
      expect(maskPII('Date range: 2026-11-06 2026-11-07')).toBe(
        'Date range: 2026-11-06 2026-11-07'
      );
      expect(maskPII('01-02-2026')).toBe('01-02-2026');
      expect(maskPII('width: 1440px; viewport: 1440x900')).toBe(
        'width: 1440px; viewport: 1440x900'
      );
      expect(maskPII('class="hover:bg-blue-500 w-1/2 p-4"')).toBe(
        'class="hover:bg-blue-500 w-1/2 p-4"'
      );
    });
  });

  describe('maskTextString', () => {
    it('replaces non-empty text with [MASKED] when maskAll is true', () => {
      expect(maskTextString('Sensitive balance $9,420', { maskAll: true })).toBe(
        '[MASKED]'
      );
      expect(maskTextString('   ', { maskAll: true })).toBe('   ');
      expect(maskTextString('', { maskAll: true })).toBe('');
    });

    it('runs maskPII when autoMaskPII is true and maskAll is false', () => {
      expect(
        maskTextString('Email: user@domain.com', {
          maskAll: false,
          autoMaskPII: true,
        })
      ).toBe('Email: [MASKED_EMAIL]');
    });
  });

  describe('isElementMatchedByMaskSelectors & findMaskedElementsOnPage', () => {
    it('matches elements and descendants against CSS selectors and ignores invalid selectors safely', () => {
      document.body.innerHTML = `
        <div class="secret-panel" data-mask="true">
          <span id="nested-secret">Top Secret</span>
        </div>
        <input id="pwd-input" type="password" value="hunter2" />
        <button id="normal-btn">Click Me</button>
        <div id="dpa-root-host">
          <div data-mask="true" id="internal-masked">Extension UI</div>
        </div>
      `;

      const nested = document.getElementById('nested-secret')!;
      const pwd = document.getElementById('pwd-input')!;
      const normalBtn = document.getElementById('normal-btn')!;

      const selectors = [
        'input[type="password"]',
        '[data-mask="true"]',
        'div[unclosed-selector', // invalid selector
        ':::invalid-pseudo', // invalid selector
      ];

      expect(isElementMatchedByMaskSelectors(nested, selectors)).toBe(true);
      expect(isElementMatchedByMaskSelectors(pwd, selectors)).toBe(true);
      expect(isElementMatchedByMaskSelectors(normalBtn, selectors)).toBe(false);
      expect(isElementMatchedByMaskSelectors(null, selectors)).toBe(false);

      const pageMasked = findMaskedElementsOnPage(document, selectors);
      const ids = pageMasked.map((el) => el.id || el.className);
      expect(ids).toContain('secret-panel');
      expect(ids).toContain('pwd-input');
      // Must exclude #dpa-root-host and its children
      expect(ids).not.toContain('internal-masked');
      expect(ids).not.toContain('dpa-root-host');
    });
  });

  describe('maskHtmlSnippet', () => {
    it('masks text nodes and sensitive attributes while preserving DOM structure, tag names, classes, and IDs', () => {
      const html = `
        <div id="profile-card" class="card user-card" data-testid="profile">
          <h3 class="title" title="user@example.com">John (user@example.com)</h3>
          <input type="password" id="secret-pw" value="MySecretPass123" placeholder="Enter password" />
          <div data-mask="true" class="balance-box" aria-label="Account balance $50,000">
            <span>$50,000.00</span>
          </div>
        </div>
      `;

      const masked = maskHtmlSnippet(html, false, DEFAULT_MASKING_CONFIG);

      // Structure & classes preserved
      expect(masked).toContain('id="profile-card"');
      expect(masked).toContain('class="card user-card"');
      expect(masked).toContain('data-testid="profile"');

      // PII masked in normal text & title attribute
      expect(masked).toContain('title="[MASKED_EMAIL]"');
      expect(masked).toContain('John ([MASKED_EMAIL])');

      // Password input value & placeholder masked
      expect(masked).toContain('id="secret-pw"');
      expect(masked).toContain('value="[MASKED]"');
      expect(masked).toContain('placeholder="[MASKED]"');
      expect(masked).not.toContain('MySecretPass123');

      // [data-mask="true"] subtree text and aria-label masked
      expect(masked).toContain('aria-label="[MASKED]"');
      expect(masked).toContain('<span>[MASKED]</span>');
      expect(masked).not.toContain('$50,000.00');
    });

    it('handles <input value="..." placeholder="..."> and <textarea> properly without losing attributes or breaking void tags', () => {
      const html =
        '<form class="login-form"><input type="email" name="email" value="alice@example.com" placeholder="Contact 090-1234-5678"><textarea name="bio" rows="3" placeholder="Email bob@example.com">Reach me at alice@example.com</textarea></form>';

      const piiMasked = maskHtmlSnippet(html, false, DEFAULT_MASKING_CONFIG);
      expect(piiMasked).toContain('type="email"');
      expect(piiMasked).toContain('name="email"');
      expect(piiMasked).toContain('value="[MASKED_EMAIL]"');
      expect(piiMasked).toContain('placeholder="Contact [MASKED_PHONE]"');
      expect(piiMasked).toContain('rows="3"');
      expect(piiMasked).toContain('placeholder="Email [MASKED_EMAIL]"');
      expect(piiMasked).toContain('>Reach me at [MASKED_EMAIL]</textarea>');
      expect(piiMasked).not.toContain('</input>');

      const fullMasked = maskHtmlSnippet(html, true, DEFAULT_MASKING_CONFIG);
      expect(fullMasked).toContain('value="[MASKED]"');
      expect(fullMasked).toContain('placeholder="[MASKED]"');
      expect(fullMasked).toContain('>[MASKED]</textarea>');
    });

    it('masks all text nodes when forceMaskAll is true', () => {
      const html = '<button id="pay-btn" class="btn-primary">Pay $99.00 Now</button>';
      const masked = maskHtmlSnippet(html, true, DEFAULT_MASKING_CONFIG);
      expect(masked).toBe(
        '<button id="pay-btn" class="btn-primary">[MASKED]</button>'
      );
    });
  });

  describe('applyMaskingToElementMetadata, applyMaskingToAnnotation, and applyMaskingToExportPayload', () => {
    const baseElement: ElementMetadata = {
      tagName: 'div',
      id: 'customer-row',
      className: 'row items-center',
      selector: '#customer-row',
      xpath: '//*[@id="customer-row"]',
      attributes: {
        id: 'customer-row',
        class: 'row items-center',
        'data-email': 'customer@company.com',
        title: 'Call 090-1234-5678',
      },
      textContent: 'Customer: customer@company.com / 090-1234-5678',
      outerHTMLSnippet:
        '<div id="customer-row" class="row items-center" title="Call 090-1234-5678">Customer: customer@company.com / 090-1234-5678</div>',
      rect: { x: 10, y: 20, width: 300, height: 40 },
      computedStyles: { display: 'flex' },
      framework: {
        detected: 'react',
        componentName: 'CustomerRow',
        componentHierarchy: ['App', 'CustomerList', 'CustomerRow'],
        source: { fileName: 'CustomerRow.tsx', lineNumber: 15 },
      },
    };

    it('masks PII in ElementMetadata when autoMaskPII is enabled', () => {
      const maskedEl = applyMaskingToElementMetadata(
        baseElement,
        false,
        DEFAULT_MASKING_CONFIG
      );

      expect(maskedEl.textContent).toBe(
        'Customer: [MASKED_EMAIL] / [MASKED_PHONE]'
      );
      expect(maskedEl.attributes['data-email']).toBe('[MASKED_EMAIL]');
      expect(maskedEl.attributes.title).toBe('Call [MASKED_PHONE]');
      expect(maskedEl.outerHTMLSnippet).toContain('[MASKED_EMAIL]');
      expect(maskedEl.outerHTMLSnippet).toContain('[MASKED_PHONE]');
      // Does not mutate original
      expect(baseElement.textContent).toContain('customer@company.com');
    });

    it('masks entire ElementMetadata text when matched by custom selector inExportPayload', () => {
      const customConfig: MaskingConfig = {
        ...DEFAULT_MASKING_CONFIG,
        maskSelectors: ['#customer-row'],
      };

      const annotation: AnnotationItem = {
        id: 1,
        instruction: 'Align this row properly',
        maskText: false,
        createdAt: '2026-11-07T00:00:00.000Z',
        element: baseElement,
      };

      const maskedAnnotation = applyMaskingToAnnotation(annotation, customConfig);
      expect(maskedAnnotation.element.textContent).toBe('[MASKED]');
      expect(maskedAnnotation.element.attributes.title).toBe('[MASKED]');
      expect(maskedAnnotation.element.outerHTMLSnippet).toBe(
        '<div id="customer-row" class="row items-center" title="[MASKED]">[MASKED]</div>'
      );

      const payload: ExportPayload = {
        pageContext: {
          url: 'https://example.com/customers',
          title: 'Customers',
          viewport: { width: 1280, height: 800 },
          timestamp: '2026-11-07T00:00:00.000Z',
          globalInstruction: 'Refactor table layout',
          maskingConfig: customConfig,
        },
        annotations: [annotation],
      };

      const maskedPayload = applyMaskingToExportPayload(payload);
      expect(maskedPayload.annotations[0].element.textContent).toBe('[MASKED]');
    });
  });
});
