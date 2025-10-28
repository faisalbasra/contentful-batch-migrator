#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const contentful = require('contentful-management');

// Load configuration
const config = JSON.parse(fs.readFileSync('./batch-config.json', 'utf8'));

const {
  sourceFile,
  outputDir,
  targetSpace
} = config;

console.log('🔍 Starting Migration Validation...\n');

// Helper function to count items
async function getTargetCounts(client, spaceId, environmentId) {
  try {
    const space = await client.getSpace(spaceId);
    const environment = await space.getEnvironment(environmentId);

    console.log('📊 Fetching target space data...');

    // Get content types
    const contentTypes = await environment.getContentTypes({ limit: 1000 });

    // Get entries (with pagination)
    let allEntries = [];
    let skip = 0;
    const limit = 1000;
    let hasMore = true;

    console.log('  - Counting entries...');
    while (hasMore) {
      const entries = await environment.getEntries({ limit, skip });
      allEntries = allEntries.concat(entries.items);
      skip += limit;
      hasMore = entries.items.length === limit;
      process.stdout.write(`    Fetched ${allEntries.length} entries...\r`);
    }
    console.log(`    Total entries: ${allEntries.length}     `);

    // Get assets (with pagination)
    let allAssets = [];
    skip = 0;
    hasMore = true;

    console.log('  - Counting assets...');
    while (hasMore) {
      const assets = await environment.getAssets({ limit, skip });
      allAssets = allAssets.concat(assets.items);
      skip += limit;
      hasMore = assets.items.length === limit;
      process.stdout.write(`    Fetched ${allAssets.length} assets...\r`);
    }
    console.log(`    Total assets: ${allAssets.length}     `);

    // Get tags
    const tags = await environment.getTags({ limit: 1000 });

    // Get locales
    const locales = await environment.getLocales();

    return {
      contentTypes: contentTypes.items.length,
      entries: allEntries.length,
      assets: allAssets.length,
      tags: tags.items.length,
      locales: locales.items.length,
      publishedEntries: allEntries.filter(e => e.sys.publishedVersion).length,
      publishedAssets: allAssets.filter(a => a.sys.publishedVersion).length
    };
  } catch (error) {
    throw new Error(`Failed to fetch target data: ${error.message}`);
  }
}

// Main validation function
async function validateMigration() {
  try {
    // Read source data
    console.log('📖 Reading source export file...');
    const sourceData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));

    const sourceCounts = {
      contentTypes: sourceData.contentTypes?.length || 0,
      entries: sourceData.entries?.length || 0,
      assets: sourceData.assets?.length || 0,
      tags: sourceData.tags?.length || 0,
      locales: sourceData.locales?.length || 0
    };

    console.log('\n📊 Source data counts:');
    console.log(`  - Content Types: ${sourceCounts.contentTypes}`);
    console.log(`  - Entries: ${sourceCounts.entries}`);
    console.log(`  - Assets: ${sourceCounts.assets}`);
    console.log(`  - Tags: ${sourceCounts.tags}`);
    console.log(`  - Locales: ${sourceCounts.locales}`);

    // Initialize Contentful Management client
    console.log('\n🔗 Connecting to target space...');
    const client = contentful.createClient({
      accessToken: targetSpace.managementToken,
      host: targetSpace.host
    });

    const targetCounts = await getTargetCounts(
      client,
      targetSpace.spaceId,
      targetSpace.environmentId
    );

    console.log('\n📊 Target space counts:');
    console.log(`  - Content Types: ${targetCounts.contentTypes}`);
    console.log(`  - Entries: ${targetCounts.entries} (${targetCounts.publishedEntries} published)`);
    console.log(`  - Assets: ${targetCounts.assets} (${targetCounts.publishedAssets} published)`);
    console.log(`  - Tags: ${targetCounts.tags}`);
    console.log(`  - Locales: ${targetCounts.locales}`);

    // Validation checks
    console.log('\n🔍 Validation Results:');
    console.log('='.repeat(60));

    const checks = [
      {
        name: 'Content Types',
        source: sourceCounts.contentTypes,
        target: targetCounts.contentTypes,
        critical: true
      },
      {
        name: 'Entries',
        source: sourceCounts.entries,
        target: targetCounts.entries,
        critical: true
      },
      {
        name: 'Assets',
        source: sourceCounts.assets,
        target: targetCounts.assets,
        critical: true
      },
      {
        name: 'Tags',
        source: sourceCounts.tags,
        target: targetCounts.tags,
        critical: false
      },
      {
        name: 'Locales',
        source: sourceCounts.locales,
        target: targetCounts.locales,
        critical: true
      }
    ];

    let passed = 0;
    let failed = 0;
    let warnings = 0;

    checks.forEach(check => {
      const match = check.source === check.target;
      const diff = check.target - check.source;
      const diffPercent = check.source > 0 ? ((diff / check.source) * 100).toFixed(2) : 0;

      let status = '✅';
      if (!match) {
        if (check.critical) {
          status = '❌';
          failed++;
        } else {
          status = '⚠️ ';
          warnings++;
        }
      } else {
        passed++;
      }

      console.log(`${status} ${check.name.padEnd(20)} Source: ${String(check.source).padStart(6)} | Target: ${String(check.target).padStart(6)} | Diff: ${diff >= 0 ? '+' : ''}${diff} (${diffPercent}%)`);
    });

    console.log('='.repeat(60));

    // Load import state for additional info
    const stateFile = path.join(outputDir, 'import-state.json');
    if (fs.existsSync(stateFile)) {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      console.log('\n📋 Import State:');
      console.log(`  - Completed batches: ${state.completedBatches.length}`);
      console.log(`  - Failed batches: ${state.failedBatches.length}`);

      if (state.failedBatches.length > 0) {
        console.log('\n  Failed batches:');
        state.failedBatches.forEach(fb => {
          console.log(`    - Batch ${fb.batch}: ${fb.error}`);
        });
      }
    }

    // Summary
    console.log('\n📊 Validation Summary:');
    console.log(`  ✅ Passed: ${passed}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  ⚠️  Warnings: ${warnings}`);

    if (failed > 0) {
      console.log('\n❌ Validation failed! Please review the differences above.');
      console.log('\nPossible causes:');
      console.log('  - Some batches failed to import');
      console.log('  - Rate limiting caused incomplete imports');
      console.log('  - Asset upload failures');
      console.log('\nRecommended actions:');
      console.log('  1. Check error logs in: ' + path.join(outputDir, 'logs'));
      console.log('  2. Run: npm run resume (if batches failed)');
      console.log('  3. Review failed items and re-import if needed');
      process.exit(1);
    } else if (warnings > 0) {
      console.log('\n⚠️  Validation passed with warnings. Review the differences above.');
    } else {
      console.log('\n🎉 Validation passed! All data migrated successfully.');
    }

  } catch (error) {
    console.error('\n❌ Error during validation:', error.message);

    if (error.message.includes('accessToken')) {
      console.error('\nPlease ensure:');
      console.error('  1. Your management token is valid');
      console.error('  2. You have installed contentful-management: npm install contentful-management');
    }

    console.error(error.stack);
    process.exit(1);
  }
}

// Check if contentful-management is installed
try {
  require.resolve('contentful-management');
} catch (e) {
  console.error('❌ Error: contentful-management package is not installed.');
  console.error('\nPlease run: npm install contentful-management');
  process.exit(1);
}

// Run validation
validateMigration();
