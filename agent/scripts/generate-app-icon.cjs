#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourcePngPath = path.resolve(projectRoot, '..', 'public', 'logo.png');
const assetsDir = path.join(projectRoot, 'assets');
const targetIcoPath = path.join(assetsDir, 'icon.ico');
const targetPngPath = path.join(assetsDir, 'icon.png');

if (!fs.existsSync(sourcePngPath)) {
  console.warn(`[generate-app-icon] source logo not found: ${sourcePngPath}`);
  process.exit(0);
}

const pngBuffer = fs.readFileSync(sourcePngPath);
fs.mkdirSync(assetsDir, { recursive: true });
fs.copyFileSync(sourcePngPath, targetPngPath);

// ICO container with a single PNG image entry. Modern Windows supports PNG-compressed ICO images.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // image count

const directoryEntry = Buffer.alloc(16);
directoryEntry.writeUInt8(0, 0); // width 0 => 256px
directoryEntry.writeUInt8(0, 1); // height 0 => 256px
directoryEntry.writeUInt8(0, 2); // palette colors
directoryEntry.writeUInt8(0, 3); // reserved
directoryEntry.writeUInt16LE(1, 4); // color planes
directoryEntry.writeUInt16LE(32, 6); // bits per pixel
directoryEntry.writeUInt32LE(pngBuffer.length, 8); // image size
directoryEntry.writeUInt32LE(header.length + directoryEntry.length, 12); // image offset

fs.writeFileSync(targetIcoPath, Buffer.concat([header, directoryEntry, pngBuffer]));

console.log('[generate-app-icon] generated app icons', {
  sourcePngPath,
  targetIcoPath,
  targetPngPath,
});
