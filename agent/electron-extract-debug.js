const extract = require('extract-zip');
const path = require('path');
const fs = require('fs');
const zipPath = path.join(process.env.LOCALAPPDATA || process.env.USERPROFILE, 'electron', 'Cache', '41a5d68646d956d50e13830e121ea0b3d6ab378b6a0ce422aefc1ff214707879', 'electron-v39.8.10-win32-x64.zip');
const dest = path.resolve(__dirname, 'node_modules', 'electron', 'dist-debug');
if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
console.log('zipPath', zipPath);
console.log('dest', dest);
extract(zipPath, { dir: dest })
  .then(() => {
    console.log('extract success');
    const walk = dir => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const p = path.join(dir, entry.name);
        console.log(p.replace(dest + path.sep, ''));
        if (entry.isDirectory()) walk(p);
      }
    };
    walk(dest);
  })
  .catch(err => {
    console.error('extract error', err);
    process.exit(1);
  });
