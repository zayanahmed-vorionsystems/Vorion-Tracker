const path = require('path');
const fs = require('fs');
const unzipper = require('unzipper');

const zipPath = path.join(process.env.LOCALAPPDATA || process.env.USERPROFILE, 'electron', 'Cache', '41a5d68646d956d50e13830e121ea0b3d6ab378b6a0ce422aefc1ff214707879', 'electron-v39.8.10-win32-x64.zip');
const dest = path.resolve(__dirname, 'node_modules', 'electron', 'dist-unzipper-test');

if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

console.log('zipPath', zipPath);
console.log('dest', dest);

unzipper.Open.file(zipPath)
  .then(directory => {
    console.log('entries', directory.files.length);
    return directory.extract({ path: dest });
  })
  .then(() => {
    console.log('extract complete');
    const walk = dir => {
      const out = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        out.push(p.replace(dest + path.sep, ''));
        if (entry.isDirectory()) out.push(...walk(p));
      }
      return out;
    };
    const list = walk(dest);
    console.log('count', list.length);
    console.log(list.slice(0, 50).join('\n'));
  })
  .catch(err => {
    console.error('error', err);
    process.exit(1);
  });
