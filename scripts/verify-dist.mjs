import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

/**
 * Checks all built files in the directory for raw Unicode noncharacters
 * (U+FFFE: 0xEF 0xBF 0xBE, U+FFFF: 0xEF 0xBF 0xBF) that cause Chrome's extension loader
 * to reject content scripts with "It isn't UTF-8 encoded."
 */
export function checkDistNoncharacters(dir = distDir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory does not exist: ${dir}`);
  }

  const errors = [];
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.js') || entry.name.endsWith('.html') || entry.name.endsWith('.css'))
      ) {
        const buf = fs.readFileSync(fullPath);
        for (let i = 0; i < buf.length - 2; i++) {
          if (buf[i] === 0xef && buf[i + 1] === 0xbf && (buf[i + 2] === 0xbe || buf[i + 2] === 0xbf)) {
            const charHex = buf[i + 2] === 0xbe ? 'U+FFFE (EF BF BE)' : 'U+FFFF (EF BF BF)';
            errors.push({
              file: path.relative(rootDir, fullPath),
              offset: i,
              noncharacter: charHex,
            });
          }
        }
      }
    }
  }

  walk(dir);
  return errors;
}

/**
 * Sanitizes any raw U+FFFE and U+FFFF noncharacters by escaping them as \uFFFE and \uFFFF.
 */
export function sanitizeDistNoncharacters(dir = distDir) {
  if (!fs.existsSync(dir)) return 0;
  let fixedCount = 0;

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('\uFFFE') || content.includes('\uFFFF')) {
          const sanitized = content
            .replaceAll('\uFFFE', '\\uFFFE')
            .replaceAll('\uFFFF', '\\uFFFF');
          fs.writeFileSync(fullPath, sanitized, 'utf8');
          fixedCount++;
        }
      }
    }
  }

  walk(dir);
  return fixedCount;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = checkDistNoncharacters();
  if (errors.length > 0) {
    console.error('Validation failed: Found raw Unicode noncharacters (U+FFFE/U+FFFF) in dist:');
    for (const err of errors) {
      console.error(`  - ${err.file} at byte offset ${err.offset}: ${err.noncharacter}`);
    }
    process.exit(1);
  } else {
    console.log('✓ Validation passed: No raw Unicode noncharacters found in dist files.');
  }
}
