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
const { outputDir } = config;

// State file
const stateFile = path.join(outputDir, 'import-state-cli.json');

console.log('🔄 Resume CLI-Based Import\n');

// Check if state file exists
if (!fs.existsSync(stateFile)) {
  console.error('❌ No import state found!');
  console.log(`Expected state file: ${stateFile}`);
  console.log('\nIt looks like you haven\'t started a CLI-based import yet.');
  console.log('To start a new import, run: npm run import:cli');
  process.exit(1);
}

// Load state
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

console.log('📋 Current Import State:');
console.log(`   Started at: ${state.startedAt}`);
console.log(`   Completed batches: ${state.completedBatches.length}`);
console.log(`   Failed batches: ${state.failedBatches.length}`);
console.log(`   Current batch: ${state.currentBatch || 'none'}\n`);

if (state.completedBatches.length > 0) {
  console.log('✅ Completed batches:', state.completedBatches.join(', '));
}

if (state.failedBatches.length > 0) {
  console.log('❌ Failed batches:');
  state.failedBatches.forEach(fb => {
    console.log(`   - ${fb.batch}: ${fb.error} (${fb.timestamp})`);
  });
}

// Load manifest to determine next batch
const manifestPath = path.join(outputDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`\n❌ Manifest not found: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Determine next batch to process
let nextBatch = null;

// If there's a current batch that wasn't completed, retry it
if (state.currentBatch && !state.completedBatches.includes(state.currentBatch)) {
  nextBatch = parseInt(state.currentBatch);
  console.log(`\n🔄 Resuming from interrupted batch: ${state.currentBatch}`);
} else {
  // Find the first batch that hasn't been completed
  for (let i = 1; i <= manifest.totalBatches; i++) {
    const batchNum = String(i).padStart(2, '0');
    if (!state.completedBatches.includes(batchNum)) {
      nextBatch = i;
      break;
    }
  }
}

if (!nextBatch) {
  console.log('\n✅ All batches have been completed!');
  console.log('\n📋 Next steps:');
  console.log('   1. Run: npm run validate');
  console.log('   2. If you stripped validations, run: npm run restore-validations');
  process.exit(0);
}

console.log(`\n🚀 Resuming from batch ${nextBatch}...`);
console.log(`📊 Remaining batches: ${manifest.totalBatches - state.completedBatches.length}\n`);

// Spawn import-cli.js with the next batch number
const importScript = path.join(__dirname, 'import-cli.js');
const child = spawn('node', [importScript, nextBatch.toString()], {
  stdio: 'inherit',
  shell: true
});

child.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ Resume completed successfully');
  } else {
    console.log(`\n❌ Resume ended with exit code ${code}`);
    process.exit(code);
  }
});

child.on('error', (error) => {
  console.error(`\n❌ Failed to resume: ${error.message}`);
  process.exit(1);
});
