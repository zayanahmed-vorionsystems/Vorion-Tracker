const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const stream = require('stream');
const yauzl = require('yauzl');
const pipeline = promisify(stream.pipeline);
const zipPath = path.join(process.env.LOCALAPPDATA || process.env.USERPROFILE, 'electron', 'Cache', '41a5d68646d956d50e13830e121ea0b3d6ab378b6a0ce422aefc1ff214707879', 'electron-v39.8.10-win32-x64.zip');
const dest = path.resolve(__dirname, 'node_modules', 'electron', 'dist-yauzl');
if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
console.log('zipPath', zipPath);
console.log('dest', dest);

yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
  if (err) throw err;
  zipfile.readEntry();
  zipfile.on('entry', entry => {
    console.log('entry', entry.fileName);
    if (/\/\//.test(entry.fileName.slice(-1))) {
      const dir = path.join(dest, entry.fileName);
      fs.mkdirSync(dir, { recursive: true });
      zipfile.readEntry();
      return;
    }
    const filePath = path.join(dest, entry.fileName);
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    zipfile.openReadStream(entry, (err, readStream) => {
      if (err) throw err;
      const writeStream = fs.createWriteStream(filePath, { mode: 0o644 });
      pipeline(readStream, writeStream)
        .then(() => {
          zipfile.readEntry();
        })
        .catch(err => {
          throw err;
        });
    });
  });
  zipfile.on('end', () => {
    console.log('end');
  });
  zipfile.on('close', () => {
    console.log('close');
    const count = [...walk(dest)].length;
    console.log('count', count);
  });
});

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    yield p;
    if (entry.isDirectory()) yield* walk(p);
  }
}
