#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Load configuration
const configPath = path.join(process.cwd(), 'batch-config.json');

if (!fs.existsSync(configPath)) {
  console.error('❌ batch-config.json not found!');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { outputDir, targetSpace, importOptions } = config;

// Parse command line arguments
const args = process.argv.slice(2);
const batchNum = args[0] ? parseInt(args[0]) : 1;

console.log('🧪 CLI Import Test - Single Batch\n');
console.log('='.repeat(60));
console.log(`Testing batch: ${batchNum}`);
console.log(`Space: ${targetSpace.spaceId}`);
console.log(`Environment: ${targetSpace.environmentId}`);
console.log(`Host: ${targetSpace.host}`);
console.log('='.repeat(60) + '\n');

// Check if batches exist
const manifestPath = path.join(outputDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`❌ Manifest not found: ${manifestPath}`);
  console.log('Please run "npm run split" first to create batches');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (batchNum < 1 || batchNum > manifest.totalBatches) {
  console.error(`❌ Invalid batch number: ${batchNum}`);
  console.log(`Valid range: 1-${manifest.totalBatches}`);
  process.exit(1);
}

const batchName = `batch-${String(batchNum).padStart(2, '0')}`;
const batchDir = path.join(outputDir, batchName);
const contentFile = path.join(batchDir, 'exported-space.json');

if (!fs.existsSync(batchDir)) {
  console.error(`❌ Batch directory not found: ${batchDir}`);
  process.exit(1);
}

// Display batch info
const batchInfo = manifest.batches.find(b => b.batchNumber === batchNum);
console.log('📦 Batch Information:');
console.log(`   Batch ID: ${batchInfo.batchId}`);
console.log(`   Assets: ${batchInfo.assets}`);
console.log(`   Entries: ${batchInfo.entries}`);
console.log(`   Has Content Model: ${batchInfo.hasContentModel ? 'Yes' : 'No'}`);
console.log(`   Content File: ${contentFile}`);
console.log(`   Assets Directory: ${batchDir}\n`);

// Check contentful CLI
try {
  const { execSync } = require('child_process');
  const version = execSync('npx contentful --version', { encoding: 'utf8' }).trim();
  console.log(`✅ Contentful CLI version: ${version}\n`);
} catch (error) {
  console.error('❌ Contentful CLI not available!');
  console.log('Installing it now...');
  process.exit(1);
}

// Build CLI arguments
const cliArgs = [
  'space', 'import',
  '--content-file', contentFile,
  '--space-id', targetSpace.spaceId,
  '--environment-id', targetSpace.environmentId,
  '--management-token', targetSpace.managementToken,
  '--host', targetSpace.host,
  '--retry-limit', '10',
  '--timeout', '70000',
  '--rate-limit', '15'
];

// Add conditional flags
if (batchNum > 1) {
  cliArgs.push('--skip-content-model');
  console.log('⚙️  Config: Skipping content model (batch > 1)');
} else {
  console.log('⚙️  Config: Importing content model (first batch)');
}

if (importOptions.uploadAssets) {
  cliArgs.push('--upload-assets');
  cliArgs.push('--assets-directory', batchDir);
  console.log('⚙️  Config: Upload assets enabled');
}

if (importOptions.skipContentPublishing) {
  cliArgs.push('--skip-content-publishing');
  console.log('⚙️  Config: Skip publishing enabled');
}

if (importOptions.skipContentUpdates) {
  cliArgs.push('--skip-content-updates');
  console.log('⚙️  Config: Skip content updates enabled');
}

if (importOptions.skipAssetUpdates) {
  cliArgs.push('--skip-asset-updates');
  console.log('⚙️  Config: Skip asset updates enabled');
}

// Create log directory
const logDir = path.join(outputDir, 'test-logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, `test-${batchName}.log`);
const errorLogFile = path.join(logDir, `test-${batchName}-errors.log`);

cliArgs.push('--error-log-file', errorLogFile);

console.log(`📝 Logs will be saved to: ${logDir}\n`);
console.log('='.repeat(60));
console.log('🚀 Starting Import Test...');
console.log('='.repeat(60) + '\n');

// Create log stream
const logStream = fs.createWriteStream(logFile, { flags: 'w' });

const startTime = Date.now();

// Spawn contentful CLI
const child = spawn('npx', ['contentful', ...cliArgs], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true
});

let hasErrors = false;

// Capture stdout
child.stdout.on('data', (data) => {
  const text = data.toString();
  logStream.write(text);
  process.stdout.write(text);
});

// Capture stderr
child.stderr.on('data', (data) => {
  const text = data.toString();
  logStream.write(text);
  process.stderr.write(text);
  hasErrors = true;
});

// Handle completion
child.on('close', (code) => {
  logStream.end();

  const endTime = Date.now();
  const duration = Math.round((endTime - startTime) / 1000);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  console.log('\n' + '='.repeat(60));
  console.log('🧪 Test Complete!');
  console.log('='.repeat(60));
  console.log(`⏱️  Duration: ${minutes}m ${seconds}s`);
  console.log(`📝 Log file: ${logFile}`);
  console.log(`📝 Error log: ${errorLogFile}`);

  if (code === 0) {
    console.log(`\n✅ Batch ${batchNum} imported successfully!`);
    console.log(`\n📊 What happened:`);
    console.log(`   • ${batchInfo.assets} assets processed`);
    console.log(`   • ${batchInfo.entries} entries imported`);
    if (batchInfo.hasContentModel) {
      console.log(`   • Content model imported (content types, locales, tags)`);
    }

    console.log(`\n💡 Next steps:`);
    console.log(`   1. Check the Contentful UI to verify the import`);
    console.log(`   2. If everything looks good, run full import: npm run import:cli`);
    console.log(`   3. Or test another batch: npm run test:import:cli <batch-number>`);

    process.exit(0);
  } else {
    console.log(`\n❌ Import failed with exit code: ${code}`);
    console.log(`\n🔍 Troubleshooting:`);
    console.log(`   1. Check error log: ${errorLogFile}`);
    console.log(`   2. Check full log: ${logFile}`);
    console.log(`   3. Verify credentials in batch-config.json`);
    console.log(`   4. Check space quota and permissions`);

    // Try to read error log
    if (fs.existsSync(errorLogFile)) {
      const errorContent = fs.readFileSync(errorLogFile, 'utf8');
      if (errorContent.trim()) {
        console.log(`\n📋 Error log preview:`);
        console.log(errorContent.split('\n').slice(0, 10).join('\n'));
      }
    }

    process.exit(1);
  }
});

child.on('error', (error) => {
  logStream.end();
  console.error(`\n❌ Failed to spawn contentful CLI: ${error.message}`);
  process.exit(1);
});
