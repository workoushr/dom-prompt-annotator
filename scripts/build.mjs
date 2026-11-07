import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const distDir = resolve(rootDir, 'dist');

async function runBuild() {
  // Clean dist directory
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  console.log('1/4 Building Side Panel UI...');
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
    build: {
      outDir: distDir,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          sidepanel: resolve(rootDir, 'src/sidepanel/index.html'),
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

  console.log('Build completed successfully in dist/');
}

runBuild().catch((err) => {
  console.error(err);
  process.exit(1);
});
