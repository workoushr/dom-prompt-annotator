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

    const filePath = path.resolve(e2eDir, `.${pathname}`);
    if (filePath !== e2eDir && !filePath.startsWith(`${e2eDir}${path.sep}`)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    if (!stat.isFile()) {
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

    // 6. In-page device preview iframe, with the bottom bar pinned in place.
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

    // 6. No uncaught page errors during the run.
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
