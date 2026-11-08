import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { checkDistNoncharacters, sanitizeDistNoncharacters } from '../../scripts/verify-dist.mjs';

describe('Build output character encoding verification (Issue #13)', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const distDir = path.resolve(rootDir, 'dist');
  const contentJsPath = path.resolve(distDir, 'content.js');

  beforeAll(() => {
    if (!fs.existsSync(contentJsPath)) {
      execSync('npm run build', { cwd: rootDir, stdio: 'pipe' });
    }
  }, 60000);

  it('ensures dist/content.js does not contain raw noncharacter byte sequences (EF BF BE or EF BF BF)', () => {
    expect(fs.existsSync(contentJsPath)).toBe(true);

    const buf = fs.readFileSync(contentJsPath);
    let rawFFFE = 0;
    let rawFFFF = 0;

    for (let i = 0; i < buf.length - 2; i++) {
      if (buf[i] === 0xef && buf[i + 1] === 0xbf) {
        if (buf[i + 2] === 0xbe) rawFFFE++;
        if (buf[i + 2] === 0xbf) rawFFFF++;
      }
    }

    expect(rawFFFE).toBe(0);
    expect(rawFFFF).toBe(0);
  });

  it('ensures checkDistNoncharacters reports 0 errors across all dist files', () => {
    const errors = checkDistNoncharacters(distDir);
    expect(errors).toEqual([]);
  });

  it('ensures sanitizeDistNoncharacters escapes raw noncharacters into safe Unicode escape sequences', () => {
    const tempDir = path.resolve(rootDir, 'dist/.test-encoding-temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const testFilePath = path.join(tempDir, 'test-script.js');
    // Raw U+FFFE in string
    const rawContent = 'const x = "\uFFFE"; const y = "\uFFFF";';
    fs.writeFileSync(testFilePath, rawContent, 'utf8');

    // Confirm that the raw bytes are present initially
    let initialBuf = fs.readFileSync(testFilePath);
    let hasRawFFFE = false;
    for (let i = 0; i < initialBuf.length - 2; i++) {
      if (initialBuf[i] === 0xef && initialBuf[i + 1] === 0xbf && initialBuf[i + 2] === 0xbe) {
        hasRawFFFE = true;
        break;
      }
    }
    expect(hasRawFFFE).toBe(true);

    // Run sanitization
    const fixed = sanitizeDistNoncharacters(tempDir);
    expect(fixed).toBe(1);

    // Verify raw bytes are eliminated and replaced by escaped representation \uFFFE
    const sanitizedBuf = fs.readFileSync(testFilePath);
    let remainingRawFFFE = false;
    for (let i = 0; i < sanitizedBuf.length - 2; i++) {
      if (sanitizedBuf[i] === 0xef && sanitizedBuf[i + 1] === 0xbf && sanitizedBuf[i + 2] === 0xbe) {
        remainingRawFFFE = true;
        break;
      }
    }
    expect(remainingRawFFFE).toBe(false);

    const sanitizedText = fs.readFileSync(testFilePath, 'utf8');
    expect(sanitizedText).toBe('const x = "\\uFFFE"; const y = "\\uFFFF";');

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
