#!/usr/bin/env node

const contentful = require('contentful-management');
const fs = require('fs');
const path = require('path');

// Load configuration
const configPath = path.join(process.cwd(), 'cascade-config.json');

if (!fs.existsSync(configPath)) {
  console.error('❌ cascade-config.json not found!');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// State file
const stateFile = path.join(process.cwd(), 'publish-assets-state.json');

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function publishAssets() {
  console.log('📦 Contentful Assets Publisher\n');
  console.log('='.repeat(60));
  console.log(`Space: ${config.spaceId}`);
  console.log(`Environment: ${config.environmentId}`);
  console.log(`Host: ${config.host}`);

  if (dryRun) {
    console.log(`Mode: DRY RUN (no actual publishing)`);
  }

  console.log('='.repeat(60) + '\n');

  // Confirm before proceeding
  if (!dryRun) {
    console.log('⚠️  This will publish all draft assets in the target environment.');
    console.log('   Make sure you are connected to the correct space!\n');
  }

  console.log('🔗 Connecting to Contentful...');
  const client = contentful.createClient({
    accessToken: config.managementToken,
    host: config.host
  });

  const space = await client.getSpace(config.spaceId);
  const environment = await space.getEnvironment(config.environmentId);
  console.log('✅ Connected\n');

  // Fetch all assets
  console.log('📊 Fetching assets...');
  let allAssets = [];
  let skip = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const response = await environment.getAssets({ limit, skip });
    allAssets = allAssets.concat(response.items);
    console.log(`   - Fetched ${allAssets.length}/${response.total} assets`);

    skip += limit;
    hasMore = response.items.length === limit;
  }

  console.log('   ✓ All assets fetched\n');

  // Separate published and draft assets
  const publishedAssets = [];
  const draftAssets = [];

  allAssets.forEach(asset => {
    if (asset.sys.publishedVersion) {
      publishedAssets.push(asset);
    } else {
      draftAssets.push(asset);
    }
  });

  console.log('📋 Analysis Results:');
  console.log(`   Total Assets: ${allAssets.length}`);
  console.log(`   - Published: ${publishedAssets.length}`);
  console.log(`   - Draft: ${draftAssets.length}\n`);

  if (draftAssets.length === 0) {
    console.log('✅ All assets are already published! Nothing to do.');
    return;
  }

  // Publishing
  const stats = {
    startTime: Date.now(),
    totalAssets: draftAssets.length,
    published: 0,
    failed: 0
  };

  console.log('='.repeat(60));
  console.log('🚀 Starting Asset Publishing');
  console.log('='.repeat(60) + '\n');

  console.log(`📦 Publishing ${draftAssets.length} assets...\n`);

  const failedAssets = [];

  for (let i = 0; i < draftAssets.length; i++) {
    const asset = draftAssets[i];
    const progress = `${i + 1}/${draftAssets.length}`;

    try {
      if (dryRun) {
        console.log(`   [DRY RUN] ${progress} - Would publish asset: ${asset.sys.id}`);
        stats.published++;
      } else {
        // Fetch fresh asset to ensure we have latest version
        const freshAsset = await environment.getAsset(asset.sys.id);

        // Check if it actually needs publishing
        if (!freshAsset.sys.publishedVersion ||
            freshAsset.sys.version > freshAsset.sys.publishedVersion) {
          await freshAsset.publish();
          stats.published++;

          if ((i + 1) % 50 === 0 || i === draftAssets.length - 1) {
            console.log(`   ✓ Published ${i + 1}/${draftAssets.length} assets`);
          }
        } else {
          if ((i + 1) % 50 === 0 || i === draftAssets.length - 1) {
            console.log(`   ⏭️  Skipped ${i + 1}/${draftAssets.length} (already published)`);
          }
        }
      }

      // Rate limiting: 100ms between publishes (10 per second)
      await sleep(100);

    } catch (error) {
      console.error(`   ❌ Failed to publish asset ${asset.sys.id}:`, error.message);
      stats.failed++;
      failedAssets.push({
        id: asset.sys.id,
        error: error.message
      });
    }
  }

  const duration = Math.round((Date.now() - stats.startTime) / 1000);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  console.log('\n' + '='.repeat(60));
  console.log('✅ Asset Publishing Complete');
  console.log('='.repeat(60));
  console.log(`\n⏱️  Duration: ${minutes}m ${seconds}s`);
  console.log('\n📊 Results:');
  console.log(`   Total assets: ${stats.totalAssets}`);
  console.log(`   Published: ${stats.published}`);
  console.log(`   Failed: ${stats.failed}`);

  if (stats.totalAssets > 0) {
    console.log(`   📈 Success rate: ${Math.round((stats.published / stats.totalAssets) * 100)}%`);
  }

  if (failedAssets.length > 0) {
    console.log(`\n❌ Failed Assets (${failedAssets.length}):`);
    failedAssets.forEach(item => {
      console.log(`   - ${item.id}: ${item.error}`);
    });
  }

  // Save state
  const state = {
    targetSpace: config.spaceId,
    environment: config.environmentId,
    completedAt: new Date().toISOString(),
    dryRun: dryRun,
    stats: stats,
    failedAssets: failedAssets
  };

  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log(`\n💾 State saved to: ${stateFile}`);
}

// Run
publishAssets()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
