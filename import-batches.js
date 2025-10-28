#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Load configuration
const config = JSON.parse(fs.readFileSync('./batch-config.json', 'utf8'));

const {
  outputDir,
  targetSpace,
  importOptions
} = config;

const STATE_FILE = path.join(outputDir, 'import-state.json');
const LOG_DIR = path.join(outputDir, 'logs');

// Ensure log directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

ensureDir(LOG_DIR);

// Load or create import state
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return {
    startedAt: new Date().toISOString(),
    completedBatches: [],
    failedBatches: [],
    currentBatch: null
  };
}

// Save import state
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Helper function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to run contentful import for a batch
function importBatch(batchDir, batchNum, isFirstBatch) {
  return new Promise((resolve, reject) => {
    const batchLogFile = path.join(LOG_DIR, `batch-${batchNum}.log`);
    const batchErrorFile = path.join(LOG_DIR, `batch-${batchNum}-errors.log`);

    const logStream = fs.createWriteStream(batchLogFile, { flags: 'a' });
    const errorStream = fs.createWriteStream(batchErrorFile, { flags: 'a' });

    // Build import config for this batch
    const batchConfig = {
      spaceId: targetSpace.spaceId,
      environmentId: targetSpace.environmentId,
      managementToken: targetSpace.managementToken,
      contentFile: path.join(batchDir, 'exported-space.json'),
      uploadAssets: importOptions.uploadAssets,
      assetsDirectory: batchDir,
      skipContentModel: !isFirstBatch, // Only import content model in first batch
      skipLocales: !isFirstBatch,
      skipContentPublishing: importOptions.skipContentPublishing,
      skipContentUpdates: importOptions.skipContentUpdates,
      skipAssetUpdates: importOptions.skipAssetUpdates,
      host: targetSpace.host,
      errorLogFile: batchErrorFile
    };

    const batchConfigPath = path.join(batchDir, 'import-config.json');
    fs.writeFileSync(batchConfigPath, JSON.stringify(batchConfig, null, 2));

    // Run contentful import CLI
    const importProcess = spawn('npx', [
      'contentful-import',
      '--config',
      batchConfigPath
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    importProcess.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(output);
      logStream.write(output);
    });

    importProcess.stderr.on('data', (data) => {
      const output = data.toString();
      process.stderr.write(output);
      errorStream.write(output);
    });

    importProcess.on('close', (code) => {
      logStream.end();
      errorStream.end();

      if (code === 0) {
        resolve({ success: true, batchNum });
      } else {
        reject(new Error(`Import process exited with code ${code}`));
      }
    });

    importProcess.on('error', (error) => {
      logStream.end();
      errorStream.end();
      reject(error);
    });
  });
}

// Main import function
async function importAllBatches(startFromBatch = 1) {
  try {
    console.log('🚀 Starting Contentful Batch Import...\n');

    // Load manifest
    const manifestPath = path.join(outputDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifest file not found: ${manifestPath}. Please run split-contentful-export.js first.`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`📋 Found ${manifest.totalBatches} batches to import\n`);

    // Load state
    const state = loadState();
    console.log(`📊 Import state:`);
    console.log(`  - Completed batches: ${state.completedBatches.length}`);
    console.log(`  - Failed batches: ${state.failedBatches.length}`);
    console.log(`  - Starting from batch: ${startFromBatch}\n`);

    let successCount = 0;
    let failureCount = 0;

    for (let i = startFromBatch; i <= manifest.totalBatches; i++) {
      const batchNum = String(i).padStart(2, '0');
      const batchDir = path.join(outputDir, `batch-${batchNum}`);

      // Skip if already completed
      if (state.completedBatches.includes(batchNum)) {
        console.log(`⏭️  Batch ${batchNum} already completed, skipping...\n`);
        continue;
      }

      console.log(`\n${'='.repeat(60)}`);
      console.log(`📦 Importing Batch ${batchNum} of ${manifest.totalBatches}`);
      console.log(`${'='.repeat(60)}\n`);

      const batchInfo = manifest.batches.find(b => b.batchId === `batch-${batchNum}`);
      console.log(`Batch info:`);
      console.log(`  - Assets: ${batchInfo.assets}`);
      console.log(`  - Entries: ${batchInfo.entries}`);
      console.log(`  - Has content model: ${batchInfo.hasContentModel ? 'Yes' : 'No'}`);
      console.log(`  - Directory: ${batchDir}\n`);

      // Update state
      state.currentBatch = batchNum;
      saveState(state);

      let retries = 0;
      let success = false;

      while (retries <= importOptions.maxRetries && !success) {
        try {
          if (retries > 0) {
            console.log(`\n⚠️  Retry attempt ${retries} of ${importOptions.maxRetries}...\n`);
            await sleep(importOptions.retryDelay * retries); // Exponential backoff
          }

          await importBatch(batchDir, batchNum, batchInfo.hasContentModel);
          success = true;
          successCount++;

          // Mark as completed
          state.completedBatches.push(batchNum);
          state.currentBatch = null;
          saveState(state);

          console.log(`\n✅ Batch ${batchNum} imported successfully!`);

          // Wait before next batch (except for the last one)
          if (i < manifest.totalBatches) {
            const delaySeconds = Math.floor(importOptions.delayBetweenBatches / 1000);
            console.log(`\n⏳ Waiting ${delaySeconds} seconds before next batch...`);
            await sleep(importOptions.delayBetweenBatches);
          }

        } catch (error) {
          retries++;
          console.error(`\n❌ Error importing batch ${batchNum}:`, error.message);

          if (retries > importOptions.maxRetries) {
            state.failedBatches.push({
              batch: batchNum,
              error: error.message,
              timestamp: new Date().toISOString()
            });
            state.currentBatch = null;
            saveState(state);
            failureCount++;

            console.error(`\n❌ Batch ${batchNum} failed after ${importOptions.maxRetries} retries. Moving to next batch...`);
          }
        }
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Import Summary`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Total batches: ${manifest.totalBatches}`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failureCount}`);
    console.log(`\nLogs saved to: ${LOG_DIR}`);
    console.log(`State saved to: ${STATE_FILE}`);

    if (failureCount > 0) {
      console.log(`\n⚠️  Some batches failed. Review error logs and run:`);
      console.log(`  node resume-import.js`);
      process.exit(1);
    } else {
      console.log(`\n🎉 All batches imported successfully!`);
      console.log(`\nNext steps:`);
      console.log(`  1. Run validation: node validate-migration.js`);
      console.log(`  2. Test your content in: ${targetSpace.environmentId}`);
    }

  } catch (error) {
    console.error('\n❌ Fatal error during import:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let startFromBatch = 1;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--start-from' && args[i + 1]) {
    startFromBatch = parseInt(args[i + 1], 10);
  }
}

// Run the import
importAllBatches(startFromBatch);
