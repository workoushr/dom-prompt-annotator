import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { sanitizeDistNoncharacters, checkDistNoncharacters } from './verify-dist.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const distDir = resolve(rootDir, 'dist');

async function runBuild() {
  // Clean dist directory
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  console.log('1/4 Building Side Panel & Studio UI...');
  await build({
    configFile: false,
    root: resolve(rootDir, 'src'),
    publicDir: resolve(rootDir, 'public'),
    plugins: [react()],
    base: './',
    resolve: {
      alias: {
        '@': resolve(rootDir, 'src'),
      },
    },
    esbuild: {
      charset: 'ascii',
    },
    build: {
      outDir: distDir,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          sidepanel: resolve(rootDir, 'src/sidepanel/index.html'),
          studio: resolve(rootDir, 'src/studio/index.html'),
        },
      },
    },
  });

  const scripts = [
    {
      name: 'Background Service Worker',
      entry: resolve(rootDir, 'src/background/index.ts'),
      fileName: 'background.js',
      globalName: 'DomPromptAnnotatorBackground',
    },
    {
      name: 'Content Script',
      entry: resolve(rootDir, 'src/content/index.tsx'),
      fileName: 'content.js',
      globalName: 'DomPromptAnnotatorContent',
    },
    {
      name: 'Main World Bridge',
      entry: resolve(rootDir, 'src/content/mainWorldBridge.ts'),
      fileName: 'mainWorldBridge.js',
      globalName: 'DomPromptAnnotatorBridge',
    },
  ];

  for (let i = 0; i < scripts.length; i++) {
    const s = scripts[i];
    console.log(`${i + 2}/4 Building ${s.name}...`);
    await build({
      configFile: false,
      publicDir: false,
      plugins: [react()],
      resolve: {
        alias: {
          '@': resolve(rootDir, 'src'),
        },
      },
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
      esbuild: {
        charset: 'ascii',
      },
      build: {
        outDir: distDir,
        emptyOutDir: false,
        lib: {
          entry: s.entry,
          name: s.globalName,
          formats: ['iife'],
          fileName: () => s.fileName,
        },
        rollupOptions: {
          output: {
            extend: true,
            inlineDynamicImports: true,
          },
        },
      },
    });
  }

  // Failsafe sanitization for any remaining noncharacters (e.g. U+FFFE, U+FFFF)
  const sanitizedCount = sanitizeDistNoncharacters(distDir);
  if (sanitizedCount > 0) {
    console.log(`Sanitized ${sanitizedCount} file(s) containing raw noncharacters.`);
  }

  // Strict validation to prevent Chrome extension loader rejection ("It isn't UTF-8 encoded")
  const errors = checkDistNoncharacters(distDir);
  if (errors.length > 0) {
    const detail = errors.map((e) => `  - ${e.file} at byte offset ${e.offset}: ${e.noncharacter}`).join('\n');
    throw new Error(`Build verification failed! Raw Unicode noncharacters found in dist:\n${detail}`);
  }

  console.log('Build completed and verified successfully in dist/');
}

runBuild().catch((err) => {
  console.error(err);
  process.exit(1);
});
