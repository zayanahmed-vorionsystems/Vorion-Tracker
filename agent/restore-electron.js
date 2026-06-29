const path = require('path');
const fs = require('fs');
const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');
(async () => {
  try {
    const version = require('./node_modules/electron/package.json').version;
    console.log('electron version:', version);
    const zipPath = await downloadArtifact({ version, artifactName: 'electron', platform: 'win32', arch: 'x64' });
    console.log('downloaded zip:', zipPath);
    console.log('zip exists:', fs.existsSync(zipPath));
    const distDir = path.join(__dirname, 'node_modules', 'electron', 'dist');
    console.log('distDir:', distDir);
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
    console.log('before dist contents:', fs.readdirSync(distDir));
    await extract(zipPath, { dir: distDir });
    console.log('after dist contents:', fs.readdirSync(distDir));
    const pathTxt = path.join(__dirname, 'node_modules', 'electron', 'path.txt');
    fs.writeFileSync(pathTxt, 'electron.exe');
    const versionFile = path.join(distDir, 'version');
    fs.writeFileSync(versionFile, version);
    console.log('path.txt exists:', fs.existsSync(pathTxt));
    console.log('version exists:', fs.existsSync(versionFile));
    console.log('electron.exe exists:', fs.existsSync(path.join(distDir, 'electron.exe')));
  } catch (e) {
    console.error('restore-electron failed:', e);
    process.exit(1);
  }
})();
