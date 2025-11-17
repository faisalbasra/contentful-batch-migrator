#!/usr/bin/env node

const contentful = require('contentful-management');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Load configuration
const configPath = path.join(process.cwd(), 'cascade-config.json');

if (!fs.existsSync(configPath)) {
  console.error('❌ cascade-config.json not found!');
  console.error('   Please create cascade-config.json with your space credentials.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const deleteContentTypes = args.includes('--content-types');
const deleteAssets = args.includes('--assets');

// Get batch size
let batchSize = 10;
const batchSizeIndex = args.findIndex(arg => arg === '--batch-size');
if (batchSizeIndex !== -1 && args[batchSizeIndex + 1]) {
  batchSize = parseInt(args[batchSizeIndex + 1], 10);
  if (isNaN(batchSize) || batchSize < 1) {
    console.error('❌ Invalid batch-size. Must be a positive number.');
    process.exit(1);
  }
}

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Rate limiter (10 req/sec)
const RATE_LIMIT_DELAY = 100; // 100ms = 10 req/sec

// Prompt helper
function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function cleanSpace() {
  console.log('='.repeat(80));
  console.log('🗑️  CONTENTFUL SPACE CLEANUP');
  console.log('='.repeat(80));

  // Initialize Contentful client
  console.log('🔗 Connecting to Contentful...');
  const client = contentful.createClient({
    accessToken: config.managementToken,
    host: config.host
  });

  const space = await client.getSpace(config.spaceId);
  const environment = await space.getEnvironment(config.environmentId);

  // Get organization details
  let organizationName = 'N/A';
  try {
    if (space.sys.organization) {
      const org = await client.getOrganization(space.sys.organization.sys.id);
      organizationName = org.name;
    }
  } catch (error) {
    // Organization info might not be accessible
    organizationName = 'Unable to fetch';
  }

  console.log('✅ Connected\n');

  // Display space details
  console.log('📋 TARGET SPACE DETAILS:');
  console.log('='.repeat(80));
  console.log(`Organization: ${organizationName}`);
  console.log(`Space Name:   ${space.name}`);
  console.log(`Space ID:     ${config.spaceId}`);
  console.log(`Environment:  ${config.environmentId}`);
  console.log(`API Host:     ${config.host}`);
  console.log('='.repeat(80));
  console.log('');

  // Display what will be deleted
  console.log('⚠️  WHAT WILL BE DELETED:');
  console.log('='.repeat(80));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no actual deletion)' : 'LIVE CLEANUP'}`);
  console.log('');
  console.log(`  ✅ All entries (published + draft)`);
  console.log(`  ${deleteContentTypes ? '✅' : '❌'} Content types (${deleteContentTypes ? 'will be deleted' : 'will be kept'})`);
  console.log(`  ${deleteAssets ? '✅' : '❌'} Assets (${deleteAssets ? 'will be deleted' : 'will be kept'})`);
  console.log('='.repeat(80));
  console.log('');

  if (!dryRun) {
    console.log('⚠️  WARNING: This operation is DESTRUCTIVE and cannot be undone!');
    console.log('⚠️  Make sure you have a backup before proceeding.');
    console.log('');

    // Ask for confirmation
    const answer = await promptUser('Are you sure you want to proceed? (Y/N): ');

    if (answer !== 'y' && answer !== 'yes') {
      console.log('\n❌ Operation cancelled by user.');
      process.exit(0);
    }

    console.log('\n✅ Confirmed. Starting cleanup...\n');
  }

  const stats = {
    entries: { total: 0, unpublished: 0, deleted: 0, failed: 0 },
    contentTypes: { total: 0, deleted: 0, failed: 0 },
    assets: { total: 0, unpublished: 0, deleted: 0, failed: 0 }
  };

  // ==========================================
  // STEP 1: Delete All Entries
  // ==========================================
  console.log('📊 Step 1: Fetching all entries...');
  const allEntries = [];
  let skip = 0;
  const limit = 1000;

  while (true) {
    const response = await environment.getEntries({ limit, skip });
    allEntries.push(...response.items);
    stats.entries.total = response.total;

    process.stdout.write(`\r   Fetched ${allEntries.length}/${response.total} entries`);

    skip += limit;
    if (allEntries.length >= response.total) break;
    await delay(RATE_LIMIT_DELAY);
  }
  console.log(' ✓\n');

  if (allEntries.length === 0) {
    console.log('ℹ️  No entries found. Skipping entry deletion.\n');
  } else {
    console.log(`🗑️  Deleting ${allEntries.length} entries...`);
    console.log('   (Unpublishing published entries first, then deleting)\n');

    // Separate published and draft
    const publishedEntries = allEntries.filter(e => e.sys.publishedVersion);
    const draftEntries = allEntries.filter(e => !e.sys.publishedVersion);

    console.log(`   Published entries: ${publishedEntries.length}`);
    console.log(`   Draft entries: ${draftEntries.length}\n`);

    // Step 1a: Unpublish all published entries
    if (publishedEntries.length > 0) {
      console.log('   📤 Unpublishing published entries...');
      let unpublished = 0;
      let failed = 0;

      for (const entry of publishedEntries) {
        try {
          if (!dryRun) {
            const freshEntry = await environment.getEntry(entry.sys.id);
            if (freshEntry.sys.publishedVersion) {
              await freshEntry.unpublish();
            }
          }
          unpublished++;

          if (unpublished % 50 === 0) {
            process.stdout.write(`\r      Unpublished: ${unpublished}/${publishedEntries.length}`);
          }

          await delay(RATE_LIMIT_DELAY);
        } catch (error) {
          failed++;
        }
      }

      console.log(`\r      Unpublished: ${unpublished}/${publishedEntries.length} ✓`);
      stats.entries.unpublished = unpublished;
      console.log('');
    }

    // Step 1b: Delete all entries
    console.log('   🗑️  Deleting all entries...');
    let deleted = 0;
    let failed = 0;

    for (const entry of allEntries) {
      try {
        if (!dryRun) {
          const freshEntry = await environment.getEntry(entry.sys.id);
          await freshEntry.delete();
        }
        deleted++;

        if (deleted % 50 === 0) {
          process.stdout.write(`\r      Deleted: ${deleted}/${allEntries.length}`);
        }

        await delay(RATE_LIMIT_DELAY);
      } catch (error) {
        failed++;
      }
    }

    console.log(`\r      Deleted: ${deleted}/${allEntries.length} ✓`);
    stats.entries.deleted = deleted;
    stats.entries.failed = failed;
    console.log('');
  }

  // ==========================================
  // STEP 2: Delete Content Types (Optional)
  // ==========================================
  if (deleteContentTypes) {
    console.log('📊 Step 2: Fetching all content types...');
    const allContentTypes = [];
    skip = 0;

    while (true) {
      const response = await environment.getContentTypes({ limit, skip });
      allContentTypes.push(...response.items);
      stats.contentTypes.total = response.total;

      process.stdout.write(`\r   Fetched ${allContentTypes.length}/${response.total} content types`);

      skip += limit;
      if (allContentTypes.length >= response.total) break;
      await delay(RATE_LIMIT_DELAY);
    }
    console.log(' ✓\n');

    if (allContentTypes.length === 0) {
      console.log('ℹ️  No content types found. Skipping.\n');
    } else {
      console.log(`🗑️  Deleting ${allContentTypes.length} content types...\n`);

      // Unpublish content types first
      console.log('   📤 Unpublishing content types...');
      let unpublished = 0;

      for (const ct of allContentTypes) {
        try {
          if (!dryRun) {
            const freshCT = await environment.getContentType(ct.sys.id);
            if (freshCT.isPublished()) {
              await freshCT.unpublish();
            }
          }
          unpublished++;

          if (unpublished % 20 === 0) {
            process.stdout.write(`\r      Unpublished: ${unpublished}/${allContentTypes.length}`);
          }

          await delay(RATE_LIMIT_DELAY);
        } catch (error) {
          // May already be unpublished
        }
      }

      console.log(`\r      Unpublished: ${unpublished}/${allContentTypes.length} ✓\n`);

      // Delete content types
      console.log('   🗑️  Deleting content types...');
      let deleted = 0;
      let failed = 0;

      for (const ct of allContentTypes) {
        try {
          if (!dryRun) {
            const freshCT = await environment.getContentType(ct.sys.id);
            await freshCT.delete();
          }
          deleted++;

          if (deleted % 20 === 0) {
            process.stdout.write(`\r      Deleted: ${deleted}/${allContentTypes.length}`);
          }

          await delay(RATE_LIMIT_DELAY);
        } catch (error) {
          failed++;
        }
      }

      console.log(`\r      Deleted: ${deleted}/${allContentTypes.length} ✓`);
      stats.contentTypes.deleted = deleted;
      stats.contentTypes.failed = failed;
      console.log('');
    }
  }

  // ==========================================
  // STEP 3: Delete Assets (Optional)
  // ==========================================
  if (deleteAssets) {
    console.log('📊 Step 3: Fetching all assets...');
    const allAssets = [];
    skip = 0;

    while (true) {
      const response = await environment.getAssets({ limit, skip });
      allAssets.push(...response.items);
      stats.assets.total = response.total;

      process.stdout.write(`\r   Fetched ${allAssets.length}/${response.total} assets`);

      skip += limit;
      if (allAssets.length >= response.total) break;
      await delay(RATE_LIMIT_DELAY);
    }
    console.log(' ✓\n');

    if (allAssets.length === 0) {
      console.log('ℹ️  No assets found. Skipping.\n');
    } else {
      console.log(`🗑️  Deleting ${allAssets.length} assets...\n`);

      // Separate published and draft
      const publishedAssets = allAssets.filter(a => a.sys.publishedVersion);

      console.log(`   Published assets: ${publishedAssets.length}`);
      console.log(`   Draft assets: ${allAssets.length - publishedAssets.length}\n`);

      // Unpublish published assets
      if (publishedAssets.length > 0) {
        console.log('   📤 Unpublishing published assets...');
        let unpublished = 0;

        for (const asset of publishedAssets) {
          try {
            if (!dryRun) {
              const freshAsset = await environment.getAsset(asset.sys.id);
              if (freshAsset.sys.publishedVersion) {
                await freshAsset.unpublish();
              }
            }
            unpublished++;

            if (unpublished % 50 === 0) {
              process.stdout.write(`\r      Unpublished: ${unpublished}/${publishedAssets.length}`);
            }

            await delay(RATE_LIMIT_DELAY);
          } catch (error) {
            // May already be unpublished
          }
        }

        console.log(`\r      Unpublished: ${unpublished}/${publishedAssets.length} ✓\n`);
        stats.assets.unpublished = unpublished;
      }

      // Delete all assets
      console.log('   🗑️  Deleting all assets...');
      let deleted = 0;
      let failed = 0;

      for (const asset of allAssets) {
        try {
          if (!dryRun) {
            const freshAsset = await environment.getAsset(asset.sys.id);
            await freshAsset.delete();
          }
          deleted++;

          if (deleted % 50 === 0) {
            process.stdout.write(`\r      Deleted: ${deleted}/${allAssets.length}`);
          }

          await delay(RATE_LIMIT_DELAY);
        } catch (error) {
          failed++;
        }
      }

      console.log(`\r      Deleted: ${deleted}/${allAssets.length} ✓`);
      stats.assets.deleted = deleted;
      stats.assets.failed = failed;
      console.log('');
    }
  }

  // ==========================================
  // Final Summary
  // ==========================================
  console.log('='.repeat(80));
  console.log('🎉 CLEANUP COMPLETE!');
  console.log('='.repeat(80));

  if (dryRun) {
    console.log('Mode: DRY RUN (no actual deletion performed)');
  }

  console.log('');
  console.log('📊 Summary:');
  console.log('');
  console.log('  Entries:');
  console.log(`    Total found: ${stats.entries.total}`);
  if (stats.entries.unpublished > 0) {
    console.log(`    Unpublished: ${stats.entries.unpublished}`);
  }
  console.log(`    Deleted: ${stats.entries.deleted}`);
  if (stats.entries.failed > 0) {
    console.log(`    Failed: ${stats.entries.failed}`);
  }

  if (deleteContentTypes) {
    console.log('');
    console.log('  Content Types:');
    console.log(`    Total found: ${stats.contentTypes.total}`);
    console.log(`    Deleted: ${stats.contentTypes.deleted}`);
    if (stats.contentTypes.failed > 0) {
      console.log(`    Failed: ${stats.contentTypes.failed}`);
    }
  }

  if (deleteAssets) {
    console.log('');
    console.log('  Assets:');
    console.log(`    Total found: ${stats.assets.total}`);
    if (stats.assets.unpublished > 0) {
      console.log(`    Unpublished: ${stats.assets.unpublished}`);
    }
    console.log(`    Deleted: ${stats.assets.deleted}`);
    if (stats.assets.failed > 0) {
      console.log(`    Failed: ${stats.assets.failed}`);
    }
  }

  console.log('');
  console.log('='.repeat(80));

  if (!dryRun) {
    console.log('✅ Space cleanup completed successfully!');
  } else {
    console.log('ℹ️  This was a dry run. No actual deletion was performed.');
    console.log('   Remove --dry-run flag to perform actual cleanup.');
  }

  console.log('');
}

// Run
cleanSpace().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
