const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const FOLDERS_CONFIG_PATH = path.join(DATA_DIR, 'folders.json');

// Load config files
let config = {
  hiddenFolders: [],
  hiddenFiles: [],
  hiddenPatterns: []
};

let foldersConfig = {};

try {
  if (fs.existsSync(CONFIG_PATH)) {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }
} catch (err) {
  console.warn('Warning: Could not load config.json:', err.message);
}

try {
  if (fs.existsSync(FOLDERS_CONFIG_PATH)) {
    foldersConfig = JSON.parse(fs.readFileSync(FOLDERS_CONFIG_PATH, 'utf8'));
  }
} catch (err) {
  console.warn('Warning: Could not load folders.json:', err.message);
}

function matchesPattern(filename, patterns) {
  return patterns.some(pattern => {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`).test(filename);
  });
}

function getSubfolders(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .filter(d => !config.hiddenFolders.includes(d.name))
    .map(d => d.name);
}

function getMarkdownFiles(folderPath) {
  return fs.readdirSync(folderPath)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
    .filter(f => {
      // Check if the file should be hidden
      const mdFilename = `${f}.md`;
      return !config.hiddenFiles.includes(f) && 
             !matchesPattern(mdFilename, config.hiddenPatterns || []);
    });
}

function getFolderConfig(folderName, parentPath) {
  // Get relative path from data directory
  const relativePath = path.relative(DATA_DIR, parentPath);
  const folderKey = path.join(relativePath, folderName).replace(/\\/g, '/');
  
  // Check if this folder has a configuration in folders.json
  if (foldersConfig[folderKey]) {
    return {
      title: folderName,
      ...foldersConfig[folderKey],
      type: 'folder'
    };
  }

  // Default folder configuration
  return {
    title: folderName,
    type: 'folder',
    icon: 'fas fa-folder',
    view: 'medium-view'
  };
}

function processFolder(folderPath) {
  const subfolders = getSubfolders(folderPath);
  const files = getMarkdownFiles(folderPath);
  
  // Create manifest entries for files
  const fileEntries = files.map(file => ({ title: file, type: 'file' }));

  // Create manifest entries for folders with additional properties
  const folderEntries = subfolders.map(folder => 
    getFolderConfig(folder, folderPath)
  );

  const manifestEntries = [...fileEntries, ...folderEntries];

  // Write manifest for current folder
  writeManifest(folderPath, manifestEntries);
  console.log(`Manifest written for ${path.relative(DATA_DIR, folderPath)}:`, manifestEntries);

  // Recursively process subfolders
  subfolders.forEach(subfolder => {
    processFolder(path.join(folderPath, subfolder));
  });
}

function writeManifest(folderPath, entries) {
  const manifestPath = path.join(folderPath, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(entries, null, 2), 'utf8');
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error('data/ directory not found');
    process.exit(1);
  }
  
  // Process root data directory and all its subfolders
  const rootFolders = getSubfolders(DATA_DIR);
  rootFolders.forEach(folder => {
    processFolder(path.join(DATA_DIR, folder));
  });
}

main();
