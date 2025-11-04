#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Load configuration
const configPath = path.join(process.cwd(), 'batch-config.json');

if (!fs.existsSync(configPath)) {
  console.error('❌ batch-config.json not found!');
  console.log('Please create batch-config.json from batch-config.example.json');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { outputDir, targetSpace, importOptions } = config;

// State management
const stateFile = path.join(outputDir, 'import-state-cli.json');

function loadState() {
  if (fs.existsSync(stateFile)) {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  }
  return {
    startedAt: new Date().toISOString(),
    completedBatches: [],
    failedBatches: [],
    currentBatch: null
  };
}

function saveState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Import a single batch using Contentful CLI
function importBatch(batchDir, batchNum, isFirstBatch) {
  return new Promise((resolve, reject) => {
    const batchName = `batch-${String(batchNum).padStart(2, '0')}`;
    const contentFile = path.join(batchDir, 'exported-space.json');
    const logDir = path.join(outputDir, 'logs');
    const logFile = path.join(logDir, `${batchName}.log`);
    const errorLogFile = path.join(logDir, `${batchName}-errors.log`);

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Batch ${batchNum}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📂 Directory: ${batchDir}`);
    console.log(`📄 Content file: ${contentFile}`);
    console.log(`📝 Log file: ${logFile}`);

    // Build CLI arguments
    const args = [
      'space', 'import',
      '--content-file', contentFile,
      '--space-id', targetSpace.spaceId,
      '--environment-id', targetSpace.environmentId,
      '--management-token', targetSpace.managementToken,
      '--host', targetSpace.host,
      '--error-log-file', errorLogFile,
      '--retry-limit', '10',
      '--timeout', '70000',
      '--rate-limit', '10'
    ];

    // Add conditional flags
    if (isFirstBatch) {
      // First batch: Import content model + content
      console.log(`🎯 First batch - importing content model and content`);
    } else {
      // Subsequent batches: Skip content model (locales are skipped automatically with content model)
      args.push('--skip-content-model');
      console.log(`🎯 Subsequent batch - skipping content model`);
    }

    if (importOptions.uploadAssets) {
      args.push('--upload-assets');
      args.push('--assets-directory', batchDir);
      console.log(`📁 Upload assets: enabled`);
    }

    if (importOptions.skipContentPublishing) {
      args.push('--skip-content-publishing');
      console.log(`⏸️  Skip publishing: enabled`);
    }

    if (importOptions.skipContentUpdates) {
      args.push('--skip-content-updates');
    }

    if (importOptions.skipAssetUpdates) {
      args.push('--skip-asset-updates');
    }

    console.log(`\n🚀 Starting import...\n`);

    // Create write streams for logs
    const logStream = fs.createWriteStream(logFile, { flags: 'w' });
    const errorStream = fs.createWriteStream(errorLogFile, { flags: 'w' });

    // Spawn contentful CLI process
    const child = spawn('npx', ['contentful', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    let stdout = '';
    let stderr = '';

    // Capture stdout
    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      logStream.write(text);
      process.stdout.write(text); // Also show in console
    });

    // Capture stderr
    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      errorStream.write(text);
      process.stderr.write(text); // Also show in console
    });

    // Handle process completion
    child.on('close', (code) => {
      logStream.end();
      errorStream.end();

      console.log(`\n${'='.repeat(60)}`);

      if (code === 0) {
        console.log(`✅ Batch ${batchNum} completed successfully`);
        console.log(`${'='.repeat(60)}\n`);
        resolve({
          success: true,
          batchNum,
          stdout,
          stderr
        });
      } else {
        console.log(`❌ Batch ${batchNum} failed with exit code ${code}`);
        console.log(`${'='.repeat(60)}\n`);
        resolve({
          success: false,
          batchNum,
          exitCode: code,
          stdout,
          stderr
        });
      }
    });

    // Handle errors
    child.on('error', (error) => {
      logStream.end();
      errorStream.end();

      console.error(`❌ Failed to spawn contentful CLI: ${error.message}`);
      reject(error);
    });
  });
}

// Main import function
async function importAllBatches(startFromBatch = 1) {
  console.log('🚀 Contentful CLI-Based Batch Import\n');

  const manifestPath = path.join(outputDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Manifest not found: ${manifestPath}`);
    console.log('Please run "npm run split" first to create batches');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const state = loadState();

  console.log('📋 Import Configuration:');
  console.log(`   Space: ${targetSpace.spaceId}`);
  console.log(`   Environment: ${targetSpace.environmentId}`);
  console.log(`   Host: ${targetSpace.host}`);
  console.log(`   Total batches: ${manifest.totalBatches}`);
  console.log(`   Total assets: ${manifest.totalAssets}`);
  console.log(`   Total entries: ${manifest.totalEntries}`);
  console.log(`   Starting from batch: ${startFromBatch}`);
  console.log(`   Delay between batches: ${importOptions.delayBetweenBatches}ms\n`);

  // Check if contentful CLI is available
  try {
    const { execSync } = require('child_process');
    execSync('npx contentful --version', { stdio: 'ignore' });
  } catch (error) {
    console.error('❌ Contentful CLI not available!');
    console.log('Please install it: npm install -g contentful-cli');
    process.exit(1);
  }

  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

  for (let i = startFromBatch; i <= manifest.totalBatches; i++) {
    const batchNum = String(i).padStart(2, '0');

    // Skip if already completed
    if (state.completedBatches.includes(batchNum)) {
      console.log(`⏭️  Skipping batch ${batchNum} (already completed)\n`);
      successCount++;
      continue;
    }

    const batchDir = path.join(outputDir, `batch-${batchNum}`);

    if (!fs.existsSync(batchDir)) {
      console.error(`❌ Batch directory not found: ${batchDir}`);
      continue;
    }

    // Update state
    state.currentBatch = batchNum;
    saveState(state);

    try {
      // Import batch (first batch includes content model)
      const isFirstBatch = (i === 1 || startFromBatch === 1 && i === startFromBatch);
      const result = await importBatch(batchDir, i, isFirstBatch);

      if (result.success) {
        // Mark as completed
        state.completedBatches.push(batchNum);
        successCount++;
      } else {
        // Mark as failed
        state.failedBatches.push({
          batch: batchNum,
          error: `CLI exit code: ${result.exitCode}`,
          timestamp: new Date().toISOString()
        });
        failCount++;
      }

      state.currentBatch = null;
      saveState(state);

      // Wait before next batch (except for last batch)
      if (i < manifest.totalBatches) {
        const delaySeconds = Math.round(importOptions.delayBetweenBatches / 1000);
        console.log(`⏳ Waiting ${delaySeconds} seconds before next batch...\n`);
        await sleep(importOptions.delayBetweenBatches);
      }

    } catch (error) {
      console.error(`❌ Error importing batch ${batchNum}:`, error.message);
      state.failedBatches.push({
        batch: batchNum,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      state.currentBatch = null;
      saveState(state);
      failCount++;
    }
  }

  // Summary
  const endTime = Date.now();
  const totalTime = Math.round((endTime - startTime) / 1000);
  const minutes = Math.floor(totalTime / 60);
  const seconds = totalTime % 60;

  console.log('\n' + '='.repeat(60));
  console.log('🎉 Import Process Complete!');
  console.log('='.repeat(60));
  console.log(`✅ Successful batches: ${successCount}/${manifest.totalBatches}`);
  console.log(`❌ Failed batches: ${failCount}/${manifest.totalBatches}`);
  console.log(`⏱️  Total time: ${minutes}m ${seconds}s`);
  console.log(`📊 State file: ${stateFile}`);
  console.log(`📝 Logs: ${path.join(outputDir, 'logs/')}`);

  if (state.failedBatches.length > 0) {
    console.log(`\n⚠️  Failed batches:`);
    state.failedBatches.forEach(fb => {
      console.log(`   - ${fb.batch}: ${fb.error}`);
    });
    console.log(`\n💡 To retry failed batches, run: npm run resume:cli`);
  } else {
    console.log(`\n🎊 All batches imported successfully!`);
    console.log(`\n📋 Next steps:`);
    console.log(`   1. Run: npm run validate`);
    console.log(`   2. If you stripped validations, run: npm run restore-validations`);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const startBatch = args[0] ? parseInt(args[0]) : 1;

// Run import
importAllBatches(startBatch).catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
