#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Load configuration
const config = JSON.parse(fs.readFileSync('./batch-config.json', 'utf8'));

const {
  batchSize,
  sourceFile,
  sourceAssetsDir,
  outputDir,
  preserveStructure
} = config;

console.log('🚀 Starting Contentful Export Splitter...\n');
console.log(`Configuration:`);
console.log(`  - Batch size: ${batchSize} assets`);
console.log(`  - Source file: ${sourceFile}`);
console.log(`  - Output directory: ${outputDir}`);
console.log(`\n`);

// Helper function to ensure directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Helper function to copy file
function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

// Helper function to get all asset references from an entry
function getAssetReferencesFromEntry(entry) {
  const assetIds = new Set();

  function traverseFields(obj) {
    if (!obj || typeof obj !== 'object') return;

    if (obj.sys && obj.sys.type === 'Link' && obj.sys.linkType === 'Asset') {
      assetIds.add(obj.sys.id);
    }

    if (Array.isArray(obj)) {
      obj.forEach(item => traverseFields(item));
    } else {
      Object.values(obj).forEach(value => traverseFields(value));
    }
  }

  if (entry.fields) {
    traverseFields(entry.fields);
  }

  return Array.from(assetIds);
}

// Main function
async function splitExport() {
  try {
    // Read the source export file
    console.log('📖 Reading source export file...');
    const exportData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));

    const {
      contentTypes = [],
      entries = [],
      assets = [],
      tags = [],
      locales = [],
      editorInterfaces = [],
      webhooks = []
    } = exportData;

    console.log(`\n📊 Source data summary:`);
    console.log(`  - Content Types: ${contentTypes.length}`);
    console.log(`  - Entries: ${entries.length}`);
    console.log(`  - Assets: ${assets.length}`);
    console.log(`  - Tags: ${tags.length}`);
    console.log(`  - Locales: ${locales.length}`);
    console.log(`  - Editor Interfaces: ${editorInterfaces.length}`);

    // Build asset-to-entry mapping
    console.log('\n🔗 Building asset-entry relationship map...');
    const assetToEntries = new Map();
    const entryToAssets = new Map();

    entries.forEach(entry => {
      const assetRefs = getAssetReferencesFromEntry(entry);
      entryToAssets.set(entry.sys.id, assetRefs);

      assetRefs.forEach(assetId => {
        if (!assetToEntries.has(assetId)) {
          assetToEntries.set(assetId, []);
        }
        assetToEntries.get(assetId).push(entry.sys.id);
      });
    });

    console.log(`  - Found ${assetToEntries.size} assets with entry references`);
    console.log(`  - Found ${entries.length - entryToAssets.size} entries without asset references`);

    // Split assets into batches
    console.log(`\n📦 Splitting into batches of ${batchSize} assets...`);
    const assetBatches = [];
    for (let i = 0; i < assets.length; i += batchSize) {
      assetBatches.push(assets.slice(i, i + batchSize));
    }

    console.log(`  - Created ${assetBatches.length} batches`);

    // Clean output directory
    if (fs.existsSync(outputDir)) {
      console.log(`\n🧹 Cleaning output directory: ${outputDir}`);
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    ensureDir(outputDir);

    // Process each batch
    const processedEntries = new Set();

    for (let batchIndex = 0; batchIndex < assetBatches.length; batchIndex++) {
      const batchNum = String(batchIndex + 1).padStart(2, '0');
      const batchDir = path.join(outputDir, `batch-${batchNum}`);

      console.log(`\n📂 Processing Batch ${batchNum}...`);
      ensureDir(batchDir);

      const batchAssets = assetBatches[batchIndex];
      const batchAssetIds = new Set(batchAssets.map(a => a.sys.id));

      // Find entries that reference assets in this batch
      const batchEntries = entries.filter(entry => {
        // Skip if already processed in previous batch
        if (processedEntries.has(entry.sys.id)) return false;

        const entryAssets = entryToAssets.get(entry.sys.id) || [];
        // Include if entry references any asset in this batch
        return entryAssets.some(assetId => batchAssetIds.has(assetId));
      });

      // Mark these entries as processed
      batchEntries.forEach(entry => processedEntries.add(entry.sys.id));

      console.log(`  - Assets: ${batchAssets.length}`);
      console.log(`  - Entries: ${batchEntries.length}`);

      // Create batch export data
      const batchData = {
        contentTypes: batchIndex === 0 ? contentTypes : [],
        tags: batchIndex === 0 ? tags : [],
        locales: batchIndex === 0 ? locales : [],
        editorInterfaces: batchIndex === 0 ? editorInterfaces : [],
        webhooks: batchIndex === 0 ? webhooks : [],
        entries: batchEntries,
        assets: batchAssets
      };

      // Write batch JSON file
      const batchJsonPath = path.join(batchDir, 'exported-space.json');
      fs.writeFileSync(batchJsonPath, JSON.stringify(batchData, null, 2));
      console.log(`  ✅ Created: ${batchJsonPath}`);

      // Copy asset files
      console.log(`  📁 Copying asset files...`);
      let copiedFiles = 0;
      let skippedFiles = 0;

      for (const asset of batchAssets) {
        // Get file info from all locales
        const fileLocales = asset.fields?.file || {};

        for (const [locale, fileData] of Object.entries(fileLocales)) {
          if (!fileData || !fileData.url) {
            skippedFiles++;
            continue;
          }

          // Parse the URL to get the file path
          // Format: //images.ctfassets.net/b26eki8n3vte/assetId/hash/filename
          const urlPath = fileData.url.replace(/^\/\//, '');
          const sourcePath = path.join(sourceAssetsDir, urlPath);
          const destPath = path.join(batchDir, urlPath);

          if (fs.existsSync(sourcePath)) {
            copyFile(sourcePath, destPath);
            copiedFiles++;
          } else {
            skippedFiles++;
            console.warn(`    ⚠️  File not found: ${sourcePath}`);
          }
        }
      }

      console.log(`  ✅ Copied ${copiedFiles} asset files`);
      if (skippedFiles > 0) {
        console.log(`  ⚠️  Skipped ${skippedFiles} missing files`);
      }
    }

    // Handle orphaned entries (entries without asset references)
    const orphanedEntries = entries.filter(entry => !processedEntries.has(entry.sys.id));

    if (orphanedEntries.length > 0) {
      console.log(`\n📦 Processing orphaned entries (${orphanedEntries.length} entries)...`);

      const lastBatchNum = String(assetBatches.length + 1).padStart(2, '0');
      const orphanBatchDir = path.join(outputDir, `batch-${lastBatchNum}`);
      ensureDir(orphanBatchDir);

      const orphanBatchData = {
        contentTypes: [],
        tags: [],
        locales: [],
        editorInterfaces: [],
        webhooks: [],
        entries: orphanedEntries,
        assets: []
      };

      const orphanBatchJsonPath = path.join(orphanBatchDir, 'exported-space.json');
      fs.writeFileSync(orphanBatchJsonPath, JSON.stringify(orphanBatchData, null, 2));
      console.log(`  ✅ Created: ${orphanBatchJsonPath}`);
    }

    // Create batch manifest
    const manifest = {
      totalBatches: assetBatches.length + (orphanedEntries.length > 0 ? 1 : 0),
      totalAssets: assets.length,
      totalEntries: entries.length,
      batchSize: batchSize,
      createdAt: new Date().toISOString(),
      batches: []
    };

    for (let i = 1; i <= manifest.totalBatches; i++) {
      const batchNum = String(i).padStart(2, '0');
      const batchJsonPath = path.join(outputDir, `batch-${batchNum}`, 'exported-space.json');
      const batchData = JSON.parse(fs.readFileSync(batchJsonPath, 'utf8'));

      manifest.batches.push({
        batchNumber: i,
        batchId: `batch-${batchNum}`,
        assets: batchData.assets.length,
        entries: batchData.entries.length,
        hasContentModel: batchData.contentTypes.length > 0
      });
    }

    const manifestPath = path.join(outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`\n✅ Splitting completed successfully!`);
    console.log(`\n📋 Summary:`);
    console.log(`  - Total batches created: ${manifest.totalBatches}`);
    console.log(`  - Manifest saved to: ${manifestPath}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Review the batches in: ${outputDir}`);
    console.log(`  2. Run: npm run import`);

  } catch (error) {
    console.error('❌ Error during splitting:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
splitExport();
