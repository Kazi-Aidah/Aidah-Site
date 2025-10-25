const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

function getSubfolders(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

function getMarkdownFiles(folderPath) {
  return fs.readdirSync(folderPath)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
}

function writeManifest(folderPath, files) {
  const manifestPath = path.join(folderPath, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(files, null, 2), 'utf8');
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error('data/ directory not found');
    process.exit(1);
  }
  const folders = getSubfolders(DATA_DIR);
  folders.forEach(folder => {
    const folderPath = path.join(DATA_DIR, folder);
    const files = getMarkdownFiles(folderPath);
    writeManifest(folderPath, files);
    console.log(`Manifest written for ${folder}:`, files);
  });
}

main();
