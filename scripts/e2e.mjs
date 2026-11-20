#!/usr/bin/env node
/**
 * Real-browser E2E harness for the unpacked Chrome MV3 extension.
 *
 * Usage:
 *   npm run build        # produce dist/ first
 *   node scripts/e2e.mjs
 *
 * Chrome resolution order:
 *   1. CHROME_PATH environment variable
 *   2. newest ~/.cache/ms-playwright/chromium-NNNN/chrome-linux64/chrome
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const e2eDir = path.join(projectRoot, 'e2e');
const distDir = path.join(projectRoot, 'dist');

const WAIT = 15000;
const CLIPBOARD_WAIT = 5000;
const COPY_CLEAR_WAIT = 5000;
const BBOX_TOLERANCE = 1;
const ASPECT_TOLERANCE = 0.05;
const CONTINUE_ON_FAILURE = process.env.E2E_CONTINUE === '1';

class HarnessError extends Error {}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveChromePath() {
  const explicit = process.env.CHROME_PATH?.trim();
  if (explicit) {
    if (!isExecutable(explicit)) {
      throw new HarnessError(
        `CHROME_PATH is set to "${explicit}" but that file is missing or not executable.`
      );
    }
    return explicit;
  }

  const cacheRoot = path.join(os.homedir(), '.cache', 'ms-playwright');
  let entries = [];
  try {
    entries = fs.readdirSync(cacheRoot);
  } catch {
    throw new HarnessError(
      `Could not read Playwright browser cache at ${cacheRoot}. Set CHROME_PATH to a Chrome-for-Testing binary.`
    );
  }

  const candidates = [];
  for (const entry of entries) {
    const match = /^chromium-(\d+)$/.exec(entry);
    if (!match) continue;
    const binary = path.join(cacheRoot, entry, 'chrome-linux64', 'chrome');
    if (isExecutable(binary)) {
      candidates.push({ binary, version: Number(match[1]) });
    }
  }
  candidates.sort((a, b) => b.version - a.version);
  if (candidates.length === 0) {
    throw new HarnessError(
      `No Chrome for Testing binary found under ${cacheRoot}/chromium-*/chrome-linux64/chrome. ` +
        'Set CHROME_PATH to a Chrome-for-Testing binary.'
    );
  }
  return candidates[0].binary;
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

async function startStaticServer() {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    if (pathname === '/' || pathname.endsWith('/')) {
      pathname = `${pathname}fixture.html`;
    }

    let filePath = path.resolve(e2eDir, `.${pathname}`);
    if (filePath !== e2eDir && !filePath.startsWith(`${e2eDir}${path.sep}`)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let stat = null;
    try {
      stat = fs.statSync(filePath);
    } catch {
      stat = null;
    }

    // SPA-style extensionless routes (e.g. /spa-route) fall back to the
    // fixture so history.pushState + reload can be exercised without a 404.
    if ((!stat || !stat.isFile()) && !path.extname(filePath)) {
      const fallbackPath = path.join(e2eDir, 'fixture.html');
      try {
        stat = fs.statSync(fallbackPath);
        filePath = fallbackPath;
      } catch {
        stat = null;
      }
    }

    if (!stat || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentTypeFor(filePath),
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new HarnessError('Static server did not report a TCP port.');
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function assert(condition, message) {
  if (!condition) throw new HarnessError(message);
}

function assertBoxClose(actual, expected, label) {
  assert(actual, `${label}: bounding box is unavailable.`);
  for (const key of ['x', 'y', 'width', 'height']) {
    assert(
      typeof actual[key] === 'number' && Number.isFinite(actual[key]),
      `${label}: bounding box has invalid ${key}.`
    );
    const delta = Math.abs(actual[key] - expected[key]);
    assert(
      delta <= BBOX_TOLERANCE,
      `${label}: ${key} moved by ${delta.toFixed(2)}px (expected within ${BBOX_TOLERANCE}px; before=${expected[key]}, after=${actual[key]}).`
    );
  }
}

async function main() {
  const checks = { passed: 0, failed: 0 };
  const pageErrors = [];
  const consoleErrors = [];
  let context = null;
  let staticServer = null;
  let userDataDir = null;
  let failure = null;
  const failures = [];
  let currentCheck = '(startup)';
  let extensionWorker = null;

  const getExtensionWorker = async () => {
    if (extensionWorker) {
      return extensionWorker;
    }
    let worker = context
      .serviceWorkers()
      .find((w) => w.url().startsWith('chrome-extension://'));
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: WAIT });
    }
    extensionWorker = worker;
    return worker;
  };

  const pass = (name) => {
    checks.passed += 1;
    currentCheck = name;
    console.log(`PASS ${name}`);
  };

  const runCheck = async (name, fn) => {
    currentCheck = name;
    try {
      await fn();
      pass(name);
    } catch (error) {
      checks.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAIL ${name}: ${message}`);
      failures.push({ name, message });
      if (!CONTINUE_ON_FAILURE) throw error;
    }
  };

  try {
    if (!fs.existsSync(path.join(distDir, 'manifest.json'))) {
      throw new HarnessError(
        `Extension build not found at ${distDir}. Run \`npm run build\` before \`node scripts/e2e.mjs\`.`
      );
    }

    const chromePath = resolveChromePath();
    staticServer = await startStaticServer();
    const serverRef = staticServer;
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpa-e2e-'));

    context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: chromePath,
      headless: true,
      viewport: { width: 1280, height: 900 },
      args: [
        `--disable-extensions-except=${distDir}`,
        `--load-extension=${distDir}`,
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    await runCheck('extension service worker loads', async () => {
      let worker = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
      if (!worker) {
        worker = await context.waitForEvent('serviceworker', { timeout: WAIT });
      }
      assert(worker, 'No extension service worker was registered.');
      const url = new URL(worker.url());
      assert(url.protocol === 'chrome-extension:', `Unexpected service worker URL: ${worker.url()}`);
      assert(url.host, `Could not determine the extension id from ${worker.url()}`);
    });

    await runCheck('packaged manifest has no side panel', async () => {
      const worker = await getExtensionWorker();
      const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
      assert(!('side_panel' in manifest), 'manifest must not declare side_panel.');
      const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
      assert(
        !permissions.includes('sidePanel'),
        `manifest permissions must not include sidePanel (found: ${permissions.join(', ')}).`
      );
    });

    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: serverRef.baseUrl,
    });

    const page = await context.newPage();
    page.setDefaultTimeout(WAIT);
    page.on('pageerror', (error) => {
      pageErrors.push(error);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    const bar = page.locator('[data-testid=\"dpa-bottom-bar\"]');
    const badge1 = page.locator('[data-testid=\"dpa-badge-1\"]');
    const drawerBtn = page.locator('[data-testid=\"dpa-bottom-bar-drawer-btn\"]');
    const copyBtn = page.locator('[data-testid=\"dpa-bottom-bar-copy-btn\"]');
    const deviceBtn = page.locator('[data-testid=\"dpa-bottom-bar-device-btn\"]');
    const deviceReset = page.locator('[data-testid=\"dpa-device-reset\"]');
    const deviceIframe = page.locator('[data-testid=\"dpa-device-preview-iframe\"]');
    const popover = page.locator('[data-testid=\"dpa-popover\"]');
    const instructionTextarea = page.locator('[data-testid=\"dpa-textarea-instruction\"]');
    const saveBtn = page.locator('[data-testid=\"dpa-btn-save\"]');

    const fixtureUrl = `${serverRef.baseUrl}/fixture.html`;
    await page.goto(fixtureUrl, { waitUntil: 'load' });

    const addAnnotation = async (selector, instruction) => {
      await page.locator(selector).click();
      await popover.waitFor({ state: 'visible' });
      await instructionTextarea.fill(instruction);
      await saveBtn.click();
      await popover.waitFor({ state: 'hidden' });
    };

    const readClipboard = () =>
      page.evaluate(async () => {
        if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
          throw new Error('navigator.clipboard.readText is unavailable');
        }
        return navigator.clipboard.readText();
      });

    const waitForClipboardContains = async (text) => {
      const startedAt = Date.now();
      let lastError = null;
      while (Date.now() - startedAt < CLIPBOARD_WAIT) {
        try {
          const value = await readClipboard();
          if (value.includes(text)) return value;
        } catch (error) {
          lastError = error;
        }
        await delay(100);
      }
      throw new HarnessError(
        `Clipboard never contained ${JSON.stringify(text)} within ${CLIPBOARD_WAIT}ms` +
          (lastError ? ` (last error: ${lastError.message})` : '')
      );
    };

    // Content scripts run in the "DOM Prompt Annotator" isolated world. React
    // props/handlers are only visible there, not in the page main world.
    const runInExtensionWorld = async (expression) => {
      const cdp = await context.newCDPSession(page);
      const contexts = [];
      cdp.on('Runtime.executionContextCreated', (event) => {
        contexts.push(event.context);
      });
      try {
        await cdp.send('Runtime.enable');
        await delay(50);
        const contextInfo =
          contexts.find((c) => c.name === 'DOM Prompt Annotator') ??
          contexts.find((c) => c.auxData?.type === 'isolated');
        assert(contextInfo, 'Extension isolated world was not found.');
        const result = await cdp.send('Runtime.evaluate', {
          expression,
          contextId: contextInfo.id,
          returnByValue: true,
          awaitPromise: true,
        });
        if (result.exceptionDetails) {
          throw new HarnessError(
            `Extension-world evaluation failed: ${JSON.stringify(result.exceptionDetails)}`
          );
        }
        return result.result?.value;
      } finally {
        await cdp.detach().catch(() => {});
      }
    };

    const setInspectPreference = async (inspectMode) => {
      const worker = await getExtensionWorker();
      await worker.evaluate(
        async (mode) => {
          await chrome.storage.local.set({
            dpa_ui_preferences: { inspectMode: mode },
          });
        },
        inspectMode
      );
    };

    const readInspectPreference = async () => {
      const worker = await getExtensionWorker();
      return worker.evaluate(async () => {
        const stored = await chrome.storage.local.get('dpa_ui_preferences');
        return stored.dpa_ui_preferences ?? null;
      });
    };

    const ensureDeviceMenuOpen = async () => {
      if (await deviceReset.isVisible().catch(() => false)) return;
      await deviceBtn.click();
      await deviceReset.waitFor({ state: 'visible' });
    };

    // Closes the device preview regardless of the preview frame's origin so a
    // failed assertion cannot leave the overlay covering the page.
    const resetDevicePreview = async () => {
      if ((await deviceIframe.count()) === 0) {
        return;
      }
      try {
        await ensureDeviceMenuOpen();
        await deviceReset.click();
        await deviceIframe
          .waitFor({ state: 'hidden', timeout: WAIT })
          .catch(() => {});
        await delay(200);
      } catch {
        // Best-effort cleanup; the browser context is closed on hard failure.
      }
    };

    const findPreviewFrame = async (urlPattern) => {
      const mainFrame = page.mainFrame();
      const deadline = Date.now() + WAIT;
      while (Date.now() < deadline) {
        const frames = page.frames().filter((candidate) => candidate !== mainFrame);
        const frame = urlPattern
          ? frames.find((candidate) => urlPattern.test(candidate.url()))
          : frames[0];
        if (frame) return frame;
        await delay(100);
      }
      throw new HarnessError(
        `Device preview iframe never exposed a matching frame${
          urlPattern ? ` (pattern: ${urlPattern})` : ''
        }.`
      );
    };

    // 1. No persisted preference: no bar, no padding, and normal page clicks work.
    await runCheck('initial load is inactive without a persisted preference', async () => {
      await delay(700);
      assert((await bar.count()) === 0, 'Expected no bottom bar before the preference is enabled.');
      const padding = await page.evaluate(() => document.body.style.paddingBottom);
      assert(padding === '', `Expected no body padding while inactive, got ${JSON.stringify(padding)}.`);

      const clickPrevented = await page.evaluate(() => {
        const target = document.querySelector('#primary-btn');
        if (!target) throw new Error('#primary-btn is missing from the fixture.');
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      });
      assert(clickPrevented === false, 'Page clicks must not be intercepted while inactive.');
      await delay(200);
      assert((await popover.count()) === 0, 'No annotation popover should open while inactive.');
    });

    await setInspectPreference(true);
    await page.reload({ waitUntil: 'load' });

    // 2. With the preference enabled the bar mounts on page load.
    await runCheck('bottom bar is visible when the preference is enabled', async () => {
      await bar.waitFor({ state: 'visible' });
      assert(await bar.isVisible(), 'Bottom bar is present but not visible.');
      assert(
        (await readInspectPreference())?.inspectMode === true,
        'Persisted preference should remain enabled after reload.'
      );
    });

    await runCheck('recording button is removed', async () => {
      const count = await page.locator('[data-testid=\"dpa-bottom-bar-rec-btn\"]').count();
      assert(count === 0, `Expected no [data-testid=\"dpa-bottom-bar-rec-btn\"], found ${count}.`);
    });

    // 2. Create an annotation through inspect-mode click and popover save.
    await runCheck('annotation create adds badge and drawer count', async () => {
      await addAnnotation('#primary-btn', 'Make this button primary');
      await badge1.waitFor({ state: 'visible' });
      assert((await badge1.count()) === 1, 'Expected exactly one badge for annotation 1.');
      const drawerText = (await drawerBtn.textContent())?.replace(/\\s+/g, ' ').trim() ?? '';
      assert(drawerText.includes('1'), `Expected drawer button text to contain "1", got ${JSON.stringify(drawerText)}.`);
    });

    // 2b. Content-script writes must reach chrome.storage.session (not a memory fallback)
    // and must never be written to disk-backed chrome.storage.local.
    await runCheck('annotation is stored in chrome.storage.session only', async () => {
      const worker =
        context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://')) ?? null;
      assert(worker, 'Extension service worker is unavailable.');
      const snapshot = await worker.evaluate(async () => {
        const session = await chrome.storage.session.get(null);
        const local = await chrome.storage.local.get(null);
        return { session, local };
      });
      const sessionStates = Object.entries(snapshot.session).filter(([key]) =>
        key.startsWith('dpa_page_state:')
      );
      assert(
        sessionStates.length > 0,
        'No dpa_page_state entry in chrome.storage.session; content script likely fell back to memory.'
      );
      const annotations = sessionStates.flatMap(([, value]) =>
        Array.isArray(value?.annotations) ? value.annotations : []
      );
      assert(
        annotations.length === 1,
        `Expected 1 annotation in chrome.storage.session, found ${annotations.length}.`
      );
      const localStateKeys = Object.keys(snapshot.local).filter((key) =>
        key.startsWith('dpa_page_state:')
      );
      assert(
        localStateKeys.length === 0,
        `Page state must not persist to chrome.storage.local, found: ${localStateKeys.join(', ')}`
      );
    });

    // 3. Copy writes to the clipboard and clears markings.
    await runCheck('copy clears markings and writes prompt to clipboard', async () => {
      await page.bringToFront();
      await copyBtn.click();
      await badge1.waitFor({ state: 'hidden', timeout: COPY_CLEAR_WAIT }).catch(() => {});
      const remaining = await badge1.count();
      assert(remaining === 0, `Expected copy to clear badges, but ${remaining} badge(s) remain.`);
      await waitForClipboardContains('Make this button primary');
    });

    // 4. Reload must not restore markings (session-only state).
    await runCheck('reload clears markings', async () => {
      await addAnnotation('#email', 'Make this email required');
      await badge1.waitFor({ state: 'visible' });
      await page.reload({ waitUntil: 'load' });
      await bar.waitFor({ state: 'visible' });
      // Give the content script a moment to finish any (undesired) async restore.
      await delay(1000);
      const badgeCount = await badge1.count();
      assert(badgeCount === 0, `Expected no badges after reload, found ${badgeCount}.`);
      const drawerText = (await drawerBtn.textContent())?.replace(/\\s+/g, ' ').trim() ?? '';
      assert(drawerText.includes('0'), `Expected drawer button text to contain "0" after reload, got ${JSON.stringify(drawerText)}.`);
    });

    // 5. Turning inspect off persists false; the bar stays on this page only.
    await runCheck('inspect off persists and navigation hides the bar', async () => {
      await page.locator('[data-testid=\"dpa-bottom-bar-select-btn\"]').click();
      await delay(300);
      assert(
        (await readInspectPreference())?.inspectMode === false,
        'Toggling inspect off should persist inspectMode: false.'
      );
      assert(await bar.isVisible(), 'The bar should remain visible on the current page after toggling off.');

      await page.goto(`${fixtureUrl}?next=1`, { waitUntil: 'load' });
      await delay(700);
      const barCount = await bar.count();
      const barVisible = barCount > 0 ? await bar.isVisible() : false;
      assert(
        !barVisible,
        `Expected no bar after navigation while the preference is off (count=${barCount}).`
      );
      const padding = await page.evaluate(() => document.body.style.paddingBottom);
      assert(padding === '', `Expected no body padding after navigation, got ${JSON.stringify(padding)}.`);

      // Re-enable for the remaining scenarios.
      await setInspectPreference(true);
      await page.reload({ waitUntil: 'load' });
      await bar.waitFor({ state: 'visible' });
    });

    // 6. Masking a parent selector after the annotation exists must still mask
    // the annotated descendant at export time (issue #28).
    await runCheck('export masks a descendant of a late-added mask selector', async () => {
      const secrets = [
        'secret-input-value-9f3a',
        'secret-input-title-9f3a',
        'secret-input-placeholder-9f3a',
        'secret-input-aria-9f3a',
        'secret-span-text-9f3a',
        'secret-span-title-9f3a',
      ];

      // `.secret-parent` is NOT in maskingConfig yet when the child is annotated.
      await addAnnotation('#secret-input', 'Redact this field');
      await badge1.waitFor({ state: 'visible' });

      await drawerBtn.click();
      const privacyTab = page.locator('[data-testid="dpa-drawer-tab-privacy"]');
      await privacyTab.waitFor({ state: 'visible' });
      await privacyTab.click();

      const selectorInput = page.locator('[data-testid="dpa-drawer-add-selector-input"]');
      await selectorInput.fill('.secret-parent');
      await page.locator('[data-testid="dpa-drawer-add-selector-btn"]').click();

      await page
        .locator('.dpa-selector-chip', { hasText: '.secret-parent' })
        .waitFor({ state: 'visible' });

      await page.locator('[data-testid="dpa-drawer-close-btn"]').click();
      await page
        .locator('[data-testid="dpa-drawer"]')
        .waitFor({ state: 'detached', timeout: WAIT })
        .catch(() => {});

      await page.bringToFront();
      await page.locator('[data-testid="dpa-copy-format-toggle-btn"]').click();
      await page.locator('[data-testid="dpa-copy-json-btn"]').click();
      await waitForClipboardContains('[MASKED]');
      const clipboard = await readClipboard();

      let payload;
      try {
        payload = JSON.parse(clipboard);
      } catch (error) {
        throw new HarnessError(
          `JSON export was not valid JSON: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      assert(
        Array.isArray(payload.annotations) && payload.annotations.length === 1,
        `Expected 1 exported annotation, found ${payload.annotations?.length}.`
      );
      const exported = JSON.stringify(payload);
      assert(
        exported.includes('[MASKED]'),
        'Exported JSON must contain [MASKED] for a descendant of a mask selector.'
      );
      for (const secret of secrets) {
        assert(
          !exported.includes(secret),
          `Exported JSON leaked raw secret string ${JSON.stringify(secret)}.`
        );
      }

      const attributes = payload.annotations[0]?.element?.attributes ?? {};
      for (const key of ['value', 'title', 'placeholder', 'aria-label']) {
        assert(
          attributes[key] === '[MASKED]',
          `Expected exported attribute ${key} to be [MASKED], got ${JSON.stringify(attributes[key])}.`
        );
      }

      // Copy clears markings; wait for the badge to disappear.
      await badge1.waitFor({ state: 'hidden', timeout: COPY_CLEAR_WAIT }).catch(() => {});
      assert(
        (await badge1.count()) === 0,
        'Copy should clear annotations after the masking export.'
      );
    });

    // 7. In-page device preview iframe, with the bottom bar pinned in place.
    await runCheck('device preview opens iframe without moving the bar', async () => {
      const barBefore = await bar.boundingBox();
      assert(barBefore, 'Could not measure the bottom bar before opening device preview.');

      await deviceBtn.click();
      const preset = page.locator('[data-testid=\"dpa-device-preset-iphone-15-pro\"]');
      await preset.waitFor({ state: 'visible' });
      await preset.click();

      await deviceIframe.waitFor({ state: 'visible' });
      await delay(300);

      const barAfter = await bar.boundingBox();
      assertBoxClose(barAfter, barBefore, 'bottom bar after device preview');

      const iframeBox = await deviceIframe.boundingBox();
      assert(iframeBox, 'Device preview iframe has no bounding box.');
      assert(iframeBox.height > 0, 'Device preview iframe has zero height.');
      const ratio = iframeBox.width / iframeBox.height;
      const expectedRatio = 393 / 852;
      const relativeDelta = Math.abs(ratio - expectedRatio) / expectedRatio;
      assert(
        relativeDelta <= ASPECT_TOLERANCE,
        `Expected iframe aspect ratio near ${expectedRatio.toFixed(4)} (393/852), got ${ratio.toFixed(4)} (${(relativeDelta * 100).toFixed(1)}% off).`
      );

      await ensureDeviceMenuOpen();
      await deviceReset.click();
      await deviceIframe.waitFor({ state: 'hidden', timeout: WAIT }).catch(() => {});
      const iframeCount = await deviceIframe.count();
      assert(iframeCount === 0, `Expected reset to remove the preview iframe, found ${iframeCount}.`);

      // The idle device button has a 0.12s width transition; let it settle
      // before measuring the bar so the assertion reflects the final layout.
      await delay(300);
      const barReset = await bar.boundingBox();
      assertBoxClose(barReset, barBefore, 'bottom bar after device reset');
    });

    // 8. Same-origin subframe navigation must not tear down the parent overlay.
    await runCheck('preview subframe navigation keeps the parent UI', async () => {
      const errorsBefore = pageErrors.length;
      try {
        await deviceBtn.click();
        const preset = page.locator('[data-testid="dpa-device-preset-iphone-15-pro"]');
        await preset.waitFor({ state: 'visible' });
        await preset.click();
        await deviceIframe.waitFor({ state: 'visible' });
        await delay(300);

        // Make the link clickable: inspect mode would intercept page clicks.
        if ((await readInspectPreference())?.inspectMode !== false) {
          await page.locator('[data-testid="dpa-bottom-bar-select-btn"]').click();
          await delay(300);
        }
        assert(
          (await readInspectPreference())?.inspectMode === false,
          'Inspect mode should be persisted as false before clicking inside the preview.'
        );

        await findPreviewFrame(/\/fixture\.html(\?|$)/);
        await page
          .frameLocator('[data-testid="dpa-device-preview-iframe"]')
          .locator('#same-link')
          .click();
        const previewFrame = await findPreviewFrame(/\/page2\.html$/);
        await previewFrame.waitForURL(/\/page2\.html$/, { timeout: WAIT });
        await delay(500);

        assert(await bar.isVisible(), 'Bottom bar disappeared after preview subframe navigation.');
        assert(
          (await page.locator('[data-testid="dpa-overlay-root"]').count()) === 1,
          'Overlay root disappeared after preview subframe navigation.'
        );
        assert(
          (await deviceIframe.count()) === 1,
          'Device preview iframe was removed after preview subframe navigation.'
        );
        assert(
          pageErrors.length === errorsBefore,
          `Preview subframe navigation raised page error(s): ${pageErrors
            .slice(errorsBefore)
            .map((error) => error.message)
            .join(' | ')}`
        );
      } finally {
        await resetDevicePreview();
      }
    });

    // 9. Cross-origin preview navigation must degrade to the hint, not throw.
    await runCheck('cross-origin preview navigation shows the hint and keeps the parent UI', async () => {
      const errorsBefore = pageErrors.length;
      const serverPort = new URL(serverRef.baseUrl).port;
      const crossOriginUrl = `http://localhost:${serverPort}/fixture.html`;
      try {
        await deviceBtn.click();
        const preset = page.locator('[data-testid="dpa-device-preset-iphone-15-pro"]');
        await preset.waitFor({ state: 'visible' });
        await preset.click();
        await deviceIframe.waitFor({ state: 'visible' });
        await delay(300);

        const previewFrame = await findPreviewFrame(/\/fixture\.html(\?|$)/);
        await previewFrame.evaluate((url) => {
          window.location.href = url;
        }, crossOriginUrl);
        await previewFrame.waitForURL(
          new RegExp(`localhost:${serverPort}/fixture\\.html`),
          { timeout: WAIT }
        );

        const hint = page.locator('[data-testid="dpa-device-preview-hint"]');
        await hint.waitFor({ state: 'visible', timeout: WAIT });
        await delay(300);

        assert(await bar.isVisible(), 'Bottom bar disappeared after cross-origin preview navigation.');
        assert(
          (await page.locator('[data-testid="dpa-overlay-root"]').count()) === 1,
          'Overlay root disappeared after cross-origin preview navigation.'
        );
        assert(
          (await deviceIframe.count()) === 1,
          'Device preview iframe was removed after cross-origin preview navigation.'
        );
        assert(await hint.isVisible(), 'Cross-origin preview hint is not visible.');
        assert(
          pageErrors.length === errorsBefore,
          `Cross-origin preview navigation raised page error(s): ${pageErrors
            .slice(errorsBefore)
            .map((error) => error.message)
            .join(' | ')}`
        );
      } finally {
        await resetDevicePreview();
      }
    });

    const setViewport = async (width, height) => {
      await page.setViewportSize({ width, height });
      await delay(250);
    };

    const resetViewport = async () => {
      await setViewport(1280, 900);
    };

    const gotoFixtureWithBar = async () => {
      await page.goto(fixtureUrl, { waitUntil: 'load' });
      await bar.waitFor({ state: 'visible' });
      await delay(250);
    };

    const assertBoxWithin = (inner, outer, label) => {
      assert(inner, `${label}: inner bounding box is unavailable.`);
      assert(outer, `${label}: outer bounding box is unavailable.`);
      const epsilon = 1;
      assert(
        inner.x >= outer.x - epsilon,
        `${label}: inner x=${inner.x.toFixed(2)} is left of outer x=${outer.x.toFixed(2)}.`
      );
      assert(
        inner.y >= outer.y - epsilon,
        `${label}: inner y=${inner.y.toFixed(2)} is above outer y=${outer.y.toFixed(2)}.`
      );
      assert(
        inner.x + inner.width <= outer.x + outer.width + epsilon,
        `${label}: inner right=${(inner.x + inner.width).toFixed(2)} exceeds outer right=${(outer.x + outer.width).toFixed(2)}.`
      );
      assert(
        inner.y + inner.height <= outer.y + outer.height + epsilon,
        `${label}: inner bottom=${(inner.y + inner.height).toFixed(2)} exceeds outer bottom=${(outer.y + outer.height).toFixed(2)}.`
      );
    };

    // 11. SPA pushState must not re-key the mounted page state, and reload must
    // still clear markings on the new document.
    await runCheck('SPA pushState keeps the bar and reload clears markings', async () => {
      await resetViewport();
      await setInspectPreference(true);
      await gotoFixtureWithBar();
      const errorsBefore = pageErrors.length;

      await page.evaluate(() => history.pushState({}, '', '/spa-route'));
      await delay(300);
      assert(
        (await page.evaluate(() => window.location.pathname)) === '/spa-route',
        'history.pushState did not update the URL to /spa-route.'
      );
      assert(await bar.isVisible(), 'Bottom bar disappeared after SPA pushState.');

      await addAnnotation('#email', 'Make this email required after pushState');
      await badge1.waitFor({ state: 'visible' });
      assert((await badge1.count()) === 1, 'Expected one badge after SPA pushState annotation.');
      assert(
        pageErrors.length === errorsBefore,
        `SPA pushState raised page error(s): ${pageErrors
          .slice(errorsBefore)
          .map((error) => error.message)
          .join(' | ')}`
      );

      await page.reload({ waitUntil: 'load' });
      await bar.waitFor({ state: 'visible' });
      await delay(1000);
      const badgeCount = await badge1.count();
      assert(badgeCount === 0, `Expected no badges after reloading an SPA route, found ${badgeCount}.`);
      const drawerText = (await drawerBtn.textContent())?.replace(/\s+/g, ' ').trim() ?? '';
      assert(
        drawerText.includes('0'),
        `Expected drawer count 0 after SPA reload, got ${JSON.stringify(drawerText)}.`
      );
      assert(
        pageErrors.length === errorsBefore,
        `SPA reload raised page error(s): ${pageErrors
          .slice(errorsBefore)
          .map((error) => error.message)
          .join(' | ')}`
      );
    });

    // 12. Two tabs on the same URL must have isolated ephemeral page state, and
    // closing the bar in one tab must not affect the other.
    await runCheck('same-URL tabs keep isolated bar state', async () => {
      await resetViewport();
      await setInspectPreference(true);
      await gotoFixtureWithBar();

      const pageB = await context.newPage();
      pageB.setDefaultTimeout(WAIT);
      pageB.on('pageerror', (error) => {
        pageErrors.push(error);
      });
      pageB.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      const barB = pageB.locator('[data-testid="dpa-bottom-bar"]');
      try {
        await pageB.goto(fixtureUrl, { waitUntil: 'load' });
        await barB.waitFor({ state: 'visible' });

        await addAnnotation('#email', 'Tab A only annotation');
        await badge1.waitFor({ state: 'visible' });
        const badgeCountB = await pageB.locator('[data-testid="dpa-badge-1"]').count();
        assert(
          badgeCountB === 0,
          `Same-URL tab B saw ${badgeCountB} annotation badge(s) from tab A.`
        );

        await page.locator('[data-testid="dpa-bottom-bar-close-btn"]').click();
        await delay(400);
        assert(
          (await page.locator('[data-testid="dpa-bottom-bar"]').count()) === 0,
          'Tab A bottom bar still exists after clicking close.'
        );
        const paddingA = await page.evaluate(() => document.body.style.paddingBottom);
        assert(
          paddingA === '',
          `Tab A body padding should be restored after close, got ${JSON.stringify(paddingA)}.`
        );

        assert(await barB.isVisible(), 'Tab B bottom bar disappeared after tab A closed its bar.');
        const paddingB = await pageB.evaluate(() => document.body.style.paddingBottom);
        assert(
          paddingB === '72px',
          `Tab B body padding should remain 72px, got ${JSON.stringify(paddingB)}.`
        );
      } finally {
        await pageB.close();
      }
    });

    // 13. Narrow viewports must not clip or overflow toolbar controls.
    await runCheck('bottom bar fits narrow viewports', async () => {
      await setInspectPreference(true);
      await gotoFixtureWithBar();

      for (const width of [320, 360]) {
        await setViewport(width, 800);
        const metrics = await bar.evaluate((barEl) => {
          const rect = barEl.getBoundingClientRect();
          const controls = Array.from(barEl.querySelectorAll('button')).map((el) => {
            const r = el.getBoundingClientRect();
            return {
              label: el.getAttribute('data-testid') || el.className,
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
            };
          });
          return {
            scrollWidth: barEl.scrollWidth,
            clientWidth: barEl.clientWidth,
            bar: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            controls,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
          };
        });

        assert(
          metrics.scrollWidth <= metrics.clientWidth,
          `At ${width}px the bar scrollWidth ${metrics.scrollWidth} exceeds clientWidth ${metrics.clientWidth}.`
        );
        assert(metrics.controls.length > 0, `At ${width}px no toolbar controls were found.`);
        for (const control of metrics.controls) {
          assert(
            control.x >= -0.5,
            `At ${width}px control ${control.label} starts at x=${control.x.toFixed(2)} (< 0).`
          );
          assert(
            control.x + control.width <= metrics.innerWidth + 0.5,
            `At ${width}px control ${control.label} ends at ${(control.x + control.width).toFixed(2)} (> ${metrics.innerWidth}).`
          );
          assert(
            control.y >= -0.5 && control.y + control.height <= metrics.innerHeight + 0.5,
            `At ${width}px control ${control.label} is vertically outside the viewport (y=${control.y.toFixed(2)}, height=${control.height.toFixed(2)}).`
          );
        }
        assert(
          metrics.bar.x >= -0.5 && metrics.bar.x + metrics.bar.width <= metrics.innerWidth + 0.5,
          `At ${width}px the bar itself spans ${metrics.bar.x.toFixed(2)}..${(metrics.bar.x + metrics.bar.width).toFixed(2)} outside the viewport.`
        );

        await page.locator('[data-testid="dpa-copy-format-toggle-btn"]').click();
        const copyMenu = page.locator('[data-testid="dpa-copy-menu"]');
        await copyMenu.waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        await copyMenu.waitFor({ state: 'hidden' });
      }
      await resetViewport();
    });

    // 14. Escape closes an open flyout menu without toggling inspect mode or
    // hiding the bar.
    await runCheck('Escape closes the device menu without side effects', async () => {
      await resetViewport();
      await setInspectPreference(true);
      await gotoFixtureWithBar();
      const deviceMenu = page.locator('[data-testid="dpa-device-menu"]');
      await deviceBtn.click();
      await deviceMenu.waitFor({ state: 'visible' });

      await page.keyboard.press('Escape');
      await deviceMenu.waitFor({ state: 'hidden' });
      const selectText = (await page
        .locator('[data-testid="dpa-bottom-bar-select-btn"]')
        .textContent())?.replace(/\s+/g, ' ').trim() ?? '';
      assert(
        selectText.includes('選択中'),
        `Expected the select pill to stay in 選択中 after Escape, got ${JSON.stringify(selectText)}.`
      );
      assert(
        (await readInspectPreference())?.inspectMode === true,
        'Escape on an open menu must not persist inspectMode: false.'
      );
      assert(await bar.isVisible(), 'Bottom bar disappeared after closing the device menu with Escape.');
    });

    // 15. Inspect mode must resolve elements inside open shadow roots, and
    // annotations must export the inner element plus its host chain.
    await runCheck('shadow DOM selection targets the inner element', async () => {
      await resetViewport();
      await setInspectPreference(true);
      await gotoFixtureWithBar();

      const shadowHost = page.locator('#shadow-host');
      await shadowHost.locator('#shadow-btn').click();
      await popover.waitFor({ state: 'visible' });

      const selectorText = (await page
        .locator('[data-testid="dpa-popover-selector"]')
        .textContent())?.trim() ?? '';
      const tagText = (await page
        .locator('[data-testid="dpa-popover-tag"]')
        .textContent())?.trim() ?? '';
      assert(
        selectorText === '#shadow-btn',
        `Expected popover selector "#shadow-btn" for the inner shadow button, got ${JSON.stringify(selectorText)}.`
      );
      assert(
        tagText.includes('button') && tagText.includes('shadow-btn'),
        `Expected popover tag to describe the inner button, got ${JSON.stringify(tagText)}.`
      );

      await instructionTextarea.fill('Keep the shadow button clickable');
      await saveBtn.click();
      await popover.waitFor({ state: 'hidden' });
      await badge1.waitFor({ state: 'visible' });
      await delay(150);

      const rects = await page.evaluate(() => {
        const host = document.querySelector('#shadow-host');
        const inner = host?.shadowRoot?.querySelector('#shadow-btn');
        if (!host || !inner) throw new Error('Shadow fixture elements are missing.');
        const h = host.getBoundingClientRect();
        const r = inner.getBoundingClientRect();
        return {
          host: { x: h.x, y: h.y, width: h.width, height: h.height },
          inner: { x: r.x, y: r.y, width: r.width, height: r.height },
        };
      });

      const outlineBox = await page
        .locator('[data-testid="dpa-annotation-outline-1"]')
        .boundingBox();
      const badgeBox = await page.locator('[data-testid="dpa-badge-1"]').boundingBox();
      assert(outlineBox, 'Shadow annotation outline has no bounding box.');
      assert(badgeBox, 'Shadow annotation badge has no bounding box.');

      for (const key of ['x', 'y', 'width', 'height']) {
        assert(
          Math.abs(outlineBox[key] - rects.inner[key]) <= BBOX_TOLERANCE,
          `Shadow outline ${key}=${outlineBox[key].toFixed(2)} does not match inner button ${key}=${rects.inner[key].toFixed(2)}.`
        );
      }
      assertBoxWithin(outlineBox, rects.host, 'shadow annotation outline');
      assertBoxWithin(badgeBox, rects.host, 'shadow annotation badge');

      await page.locator('[data-testid="dpa-copy-format-toggle-btn"]').click();
      await page.locator('[data-testid="dpa-copy-json-btn"]').click();
      await waitForClipboardContains('#shadow-btn');
      const clipboard = await readClipboard();
      let payload;
      try {
        payload = JSON.parse(clipboard);
      } catch (error) {
        throw new HarnessError(
          `Shadow annotation JSON export was not valid JSON: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      const annotation = payload.annotations?.[0];
      assert(annotation, 'Shadow JSON export contained no annotation.');
      const element = annotation.element ?? {};
      assert(element.tagName === 'button', `Exported shadow tagName should be "button", got ${JSON.stringify(element.tagName)}.`);
      assert(element.id === 'shadow-btn', `Exported shadow id should be "shadow-btn", got ${JSON.stringify(element.id)}.`);
      assert(
        element.selector === '#shadow-btn',
        `Exported shadow selector should be "#shadow-btn", got ${JSON.stringify(element.selector)}.`
      );
      assert(
        Array.isArray(element.shadowHostSelectors) &&
          element.shadowHostSelectors.includes('#shadow-host'),
        `Expected shadowHostSelectors to include "#shadow-host", got ${JSON.stringify(element.shadowHostSelectors)}.`
      );

      await badge1.waitFor({ state: 'hidden', timeout: COPY_CLEAR_WAIT }).catch(() => {});
      assert((await badge1.count()) === 0, 'Copy should clear the shadow annotation.');
    });

    // 16. The drawer mask color must drive the visual mask's computed border.
    await runCheck('mask color picker updates the visual mask', async () => {
      await resetViewport();
      await setInspectPreference(true);
      await gotoFixtureWithBar();

      await drawerBtn.click();
      const drawer = page.locator('[data-testid="dpa-drawer"]');
      await drawer.waitFor({ state: 'visible' });
      await page.locator('[data-testid="dpa-drawer-tab-privacy"]').click();

      const colorInput = page.locator('[data-testid="dpa-drawer-mask-color"]');
      await colorInput.waitFor({ state: 'visible' });
      await colorInput.scrollIntoViewIfNeeded();
      // Native color pickers cannot be driven in headless Chrome, and React
      // handlers live in the extension's isolated world. Invoke the actual
      // React onChange prop there, then assert the full state -> storage ->
      // visual-mask path.
      await runInExtensionWorld(`(() => {
        const shadow = document.querySelector('#dpa-root-host')?.shadowRoot;
        const el = shadow?.querySelector('[data-testid="dpa-drawer-mask-color"]');
        if (!el) throw new Error('mask color input missing');
        const propsKey = Object.getOwnPropertyNames(el).find((key) =>
          key.startsWith('__reactProps$')
        );
        if (!propsKey || !el[propsKey]?.onChange) {
          throw new Error('React onChange prop missing on color input');
        }
        el[propsKey].onChange({ target: { value: '#00ff88' } });
        return el[propsKey].value;
      })()`);
      // React is controlled: the value can briefly revert until onChange's
      // storage/state round-trip completes. Poll instead of asserting instantly.
      let inputValue = '';
      const inputDeadline = Date.now() + WAIT;
      while (Date.now() < inputDeadline) {
        inputValue = await colorInput.inputValue();
        if (inputValue === '#00ff88') break;
        await delay(100);
      }
      assert(
        inputValue === '#00ff88',
        `The mask color input did not accept #00ff88 (got ${JSON.stringify(inputValue)}).`
      );

      const expectedColor = 'rgb(0, 255, 136)';
      let observed = null;
      const deadline = Date.now() + WAIT;
      while (Date.now() < deadline) {
        observed = await page
          .locator('[data-testid="dpa-visual-mask"]')
          .evaluateAll((masks) => ({
            masks: masks.map((mask) => ({
              selector: mask.getAttribute('data-mask-selector'),
              borderColor: getComputedStyle(mask).borderColor,
            })),
          }));
        if (observed.masks.some((mask) => mask.borderColor === expectedColor)) {
          break;
        }
        await delay(100);
      }
      const stored = await (await getExtensionWorker()).evaluate(async () => {
        const all = await chrome.storage.session.get(null);
        return Object.entries(all)
          .filter(([key]) => key.startsWith('dpa_page_state:'))
          .map(([, value]) => value?.maskingConfig?.maskColor ?? null);
      });
      assert(
        observed.masks.some((mask) => mask.borderColor === expectedColor),
        `Expected a visual mask with borderColor ${expectedColor}, got ${JSON.stringify(observed.masks)} (stored=${JSON.stringify(stored)}).`
      );

      assert(
        stored.includes('#00ff88'),
        `Expected stored maskingConfig.maskColor "#00ff88", got ${JSON.stringify(stored)}.`
      );

      await page.locator('[data-testid="dpa-drawer-close-btn"]').click();
      await drawer.waitFor({ state: 'detached', timeout: WAIT }).catch(() => {});
    });

    // 17. A very long unbroken instruction must wrap inside the drawer instead
    // of creating horizontal scrolling.
    await runCheck('drawer wraps long annotation text', async () => {
      await resetViewport();
      await setInspectPreference(true);
      await gotoFixtureWithBar();

      const longInstruction = `${'W'.repeat(600)}\n${'Z'.repeat(600)}`;
      await addAnnotation('#email', longInstruction);
      await badge1.waitFor({ state: 'visible' });

      await drawerBtn.click();
      const drawer = page.locator('[data-testid="dpa-drawer"]');
      await drawer.waitFor({ state: 'visible' });
      const card = page.locator('[data-testid="annotation-card-1"]');
      await card.waitFor({ state: 'visible' });

      const drawerMetrics = await drawer.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      const contentMetrics = await page
        .locator('[data-testid="dpa-drawer-content-annotations"]')
        .evaluate((el) => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }));
      const instructionMetrics = await page
        .locator('[data-testid="annotation-card-1"] .dpa-annotation-instruction')
        .evaluate((el) => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }));
      const pageMetrics = await page.evaluate(() => {
        const body = document.body;
        return {
          body: {
            scrollWidth: body.scrollWidth,
            clientWidth: body.clientWidth,
          },
          document: {
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          },
        };
      });
      const metrics = {
        drawer: drawerMetrics,
        content: contentMetrics,
        instruction: instructionMetrics,
        body: pageMetrics.body,
        document: pageMetrics.document,
      };

      for (const [label, value] of [
        ['drawer', metrics.drawer],
        ['drawer content', metrics.content],
        ['instruction', metrics.instruction],
        ['body', metrics.body],
      ]) {
        assert(
          value.scrollWidth <= value.clientWidth,
          `${label} overflows horizontally: scrollWidth ${value.scrollWidth} > clientWidth ${value.clientWidth}.`
        );
      }
      assert(
        metrics.document.scrollWidth <= metrics.document.innerWidth,
        `Document overflows horizontally: scrollWidth ${metrics.document.scrollWidth} > innerWidth ${metrics.document.innerWidth}.`
      );

      await page.locator('[data-testid="dpa-drawer-delete-1"]').click();
      await page.locator('[data-testid="dpa-drawer-close-btn"]').click();
      await drawer.waitFor({ state: 'detached', timeout: WAIT }).catch(() => {});
    });

    // 10. No uncaught page errors during the run.
    await runCheck('no uncaught page errors', async () => {
      await delay(100);
      if (pageErrors.length > 0) {
        const detail = pageErrors.map((error) => error.message).join(' | ');
        throw new HarnessError(`${pageErrors.length} uncaught page error(s): ${detail}`);
      }
    });

  } catch (error) {
    failure = error;
  }

  try {
    if (context) await context.close();
  } catch (error) {
    console.error(`WARN failed to close browser context: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await closeServer(staticServer?.server);
  } catch (error) {
    console.error(`WARN failed to close static server: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (userDataDir) {
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }

  if (pageErrors.length > 0) {
    console.log(`Captured ${pageErrors.length} uncaught page error(s):`);
    for (const error of pageErrors) {
      console.log(`  pageerror: ${String(error.message).split('\n')[0]}`);
    }
  }

  if (consoleErrors.length > 0) {
    console.log(`Captured ${consoleErrors.length} console error(s):`);
    for (const message of consoleErrors) {
      console.log(`  console.error: ${message.split('\\n')[0]}`);
    }
  }

  if (failures.length > 0 || failure) {
    console.error(`E2E summary: ${checks.passed} passed, ${checks.failed} failed (stopped at: ${currentCheck})`);
    for (const item of failures) {
      console.error(`  - ${item.name}: ${item.message}`);
    }
    if (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      console.error(`First failure: ${message}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`E2E summary: ${checks.passed} passed, ${checks.failed} failed`);
    process.exitCode = 0;
  }

  // Explicit exit so a lingering extension service worker cannot keep Node alive.
  // Give stdout/stderr a beat to flush on pipe-backed stdout.
  await delay(50);
  process.exit(process.exitCode);
}

main().catch((error) => {
  console.error(`E2E harness crashed: ${error instanceof Error ? (error.stack || error.message) : String(error)}`);
  process.exit(1);
});
