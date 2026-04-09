const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

// Bundle Service Worker with esbuild
console.log('Bundling service worker...');
execSync('npx esbuild src/background/service-worker.ts --bundle --outfile=dist/background/service-worker.js --format=esm --external:chrome', { stdio: 'inherit' });

// Bundle content script with esbuild
console.log('Bundling content script...');
execSync('npx esbuild src/content/index.ts --bundle --outfile=dist/content/index.js --format=iife --external:chrome', { stdio: 'inherit' });

// Bundle popup script with esbuild
console.log('Bundling popup script...');
execSync('npx esbuild src/popup/popup.ts --bundle --outfile=dist/popup/popup.js --format=iife --external:chrome', { stdio: 'inherit' });

// Copy static files
const staticFiles = [
  { src: 'manifest.json', dest: 'manifest.json' },
  { src: 'src/popup/popup.html', dest: 'popup/popup.html' },
  { src: 'src/popup/popup.css', dest: 'popup/popup.css' },
  { src: 'icons', dest: 'icons' }, // ¸´ÖÆÍ¼±êÄ¿Â¼
];

for (const file of staticFiles) {
  const src = path.join(__dirname, '..', file.src);
  const dest = path.join(distDir, file.dest);
  if (fs.existsSync(src)) {
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
    console.log(`Copied: ${file.src} -> ${file.dest}`);
  }
}

console.log('Build complete!');
