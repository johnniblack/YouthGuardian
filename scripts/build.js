const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

// Bundle content script with esbuild
console.log('Bundling content script...');
execSync('npx esbuild src/content/index.ts --bundle --outfile=dist/content/index.js --format=iife', { stdio: 'inherit' });

// Copy static files
const staticFiles = [
  { src: 'manifest.json', dest: 'manifest.json' },
  { src: 'src/popup/popup.html', dest: 'popup/popup.html' },
  { src: 'src/popup/popup.css', dest: 'popup/popup.css' },
];

for (const file of staticFiles) {
  const src = path.join(__dirname, '..', file.src);
  const dest = path.join(distDir, file.dest);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${file.src} -> ${file.dest}`);
  }
}

console.log('Build complete!');
