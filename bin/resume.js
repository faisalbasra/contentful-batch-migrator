#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Load configuration
const config = JSON.parse(fs.readFileSync('./batch-config.json', 'utf8'));

const {
  outputDir
} = config;

const STATE_FILE = path.join(outputDir, 'import-state.json');

console.log('🔄 Resume Import Script\n');

// Load import state
function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    console.error('❌ No import state found. Nothing to resume.');
    console.error('   State file not found: ' + STATE_FILE);
    console.error('\nPlease run: npm run import');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

// Main function
async function resumeImport() {
  try {
    const state = loadState();

    console.log('📊 Current Import State:');
    console.log(`  - Started at: ${state.startedAt}`);
    console.log(`  - Completed batches: ${state.completedBatches.length}`);
    console.log(`  - Failed batches: ${state.failedBatches.length}`);
    console.log(`  - Current batch: ${state.currentBatch || 'None'}\n`);

    if (state.completedBatches.length > 0) {
      console.log('✅ Completed batches:');
      state.completedBatches.forEach(batch => {
        console.log(`   - Batch ${batch}`);
      });
      console.log();
    }

    if (state.failedBatches.length > 0) {
      console.log('❌ Failed batches:');
      state.failedBatches.forEach(fb => {
        console.log(`   - Batch ${fb.batch}: ${fb.error}`);
        console.log(`     Failed at: ${fb.timestamp}`);
      });
      console.log();
    }

    // Load manifest to find next batch
    const manifestPath = path.join(outputDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifest file not found: ${manifestPath}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Determine what to resume
    let resumeStrategy = null;
    let startFromBatch = null;

    if (state.currentBatch) {
      // Resume from current batch (likely interrupted)
      resumeStrategy = 'current';
      startFromBatch = parseInt(state.currentBatch, 10);
      console.log(`🔄 Detected interrupted batch: ${state.currentBatch}`);
    } else if (state.failedBatches.length > 0) {
      // Retry failed batches
      resumeStrategy = 'failed';
      const failedBatchNumbers = state.failedBatches.map(fb => parseInt(fb.batch, 10)).sort((a, b) => a - b);
      startFromBatch = failedBatchNumbers[0];
      console.log(`🔄 Will retry failed batches starting from: batch-${String(startFromBatch).padStart(2, '0')}`);
    } else {
      // Find next batch after completed ones
      const completedNumbers = state.completedBatches.map(b => parseInt(b, 10));
      const maxCompleted = Math.max(0, ...completedNumbers);

      if (maxCompleted >= manifest.totalBatches) {
        console.log('✅ All batches have been completed!');
        console.log('\nNext steps:');
        console.log('  1. Run validation: npm run validate');
        console.log('  2. Test your content in the target space');
        process.exit(0);
      }

      resumeStrategy = 'next';
      startFromBatch = maxCompleted + 1;
      console.log(`🔄 Will resume from next batch: batch-${String(startFromBatch).padStart(2, '0')}`);
    }

    console.log(`\n📋 Resume Plan:`);
    console.log(`  - Strategy: ${resumeStrategy}`);
    console.log(`  - Starting from batch: ${startFromBatch}`);
    console.log(`  - Total batches: ${manifest.totalBatches}`);
    console.log(`  - Remaining batches: ${manifest.totalBatches - state.completedBatches.length}`);

    // Ask for confirmation
    console.log('\n⚠️  This will continue the import process.');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Run bin/import.js with the start-from parameter
    console.log('🚀 Resuming import...\n');

    const importProcess = spawn('node', ['bin/import.js', '--start-from', startFromBatch.toString()], {
      stdio: 'inherit'
    });

    importProcess.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Resume completed successfully!');
      } else {
        console.error('\n❌ Resume process exited with code:', code);
        process.exit(code);
      }
    });

    importProcess.on('error', (error) => {
      console.error('\n❌ Error running bin/import.js:', error.message);
      process.exit(1);
    });

  } catch (error) {
    console.error('\n❌ Error during resume:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the resume
resumeImport();
