#!/usr/bin/env node

const contentful = require('contentful-management');
const fs = require('fs');

// Load configuration
const configPath = './cascade-config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function publishAllDrafts(dryRun = false, skipTag = null) {
  console.log('='.repeat(80));
  console.log('PUBLISH ALL DRAFTS - BRUTE FORCE MODE');
  console.log('='.repeat(80));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE PUBLISH'}`);
  console.log(`Space: ${config.spaceId}`);
  console.log(`Environment: ${config.environmentId}`);
  if (skipTag) {
    console.log(`Skip tag: ${skipTag} (entries with this tag will be skipped)`);
  }
  console.log('='.repeat(80));
  console.log('');

  // Initialize Contentful client
  const client = contentful.createClient({
    accessToken: config.managementToken,
    host: config.host || 'api.contentful.com'
  });

  const space = await client.getSpace(config.spaceId);
  const environment = await space.getEnvironment(config.environmentId);

  // Fetch all entries (paginated)
  console.log('Fetching all entries...');
  let allEntries = [];
  let skip = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const response = await environment.getEntries({ limit, skip });
    allEntries = allEntries.concat(response.items);
    console.log(`  Fetched ${allEntries.length} entries so far...`);

    skip += limit;
    hasMore = response.items.length === limit;

    if (hasMore) {
      await delay(100); // Small delay between pagination requests
    }
  }

  console.log(`\nTotal entries fetched: ${allEntries.length}`);

  // Separate published from draft
  let draftEntries = allEntries.filter(entry => !entry.sys.publishedVersion);
  const publishedEntries = allEntries.filter(entry => entry.sys.publishedVersion);

  console.log(`  Published: ${publishedEntries.length}`);
  console.log(`  Draft: ${draftEntries.length}`);

  // Filter out entries with skip tag if specified
  let skippedByTag = [];
  if (skipTag) {
    skippedByTag = draftEntries.filter(entry => {
      const tags = entry.metadata?.tags || [];
      const tagIds = tags.map(tag => tag.sys.id);
      return tagIds.includes(skipTag);
    });

    draftEntries = draftEntries.filter(entry => {
      const tags = entry.metadata?.tags || [];
      const tagIds = tags.map(tag => tag.sys.id);
      return !tagIds.includes(skipTag);
    });

    console.log(`  Skipped by tag '${skipTag}': ${skippedByTag.length}`);
  }

  console.log('');

  if (draftEntries.length === 0) {
    console.log('✅ No draft entries to publish! All done!');
    return;
  }

  console.log('='.repeat(80));
  console.log(`ATTEMPTING TO PUBLISH ${draftEntries.length} DRAFT ENTRIES`);
  console.log('='.repeat(80));
  console.log('');

  const stats = {
    total: draftEntries.length,
    success: 0,
    failed: 0,
    skipped: 0
  };

  const failedEntries = [];

  // Attempt to publish each draft entry
  for (let i = 0; i < draftEntries.length; i++) {
    const entry = draftEntries[i];
    const entryId = entry.sys.id;
    const contentType = entry.sys.contentType.sys.id;
    const progress = `[${i + 1}/${draftEntries.length}]`;

    try {
      if (dryRun) {
        console.log(`${progress} [DRY RUN] Would publish: ${entryId} (${contentType})`);
        stats.skipped++;
      } else {
        // Fetch fresh entry to ensure we have the latest version
        const freshEntry = await environment.getEntry(entryId);

        // Check if it's still a draft (might have been published in a previous iteration)
        if (!freshEntry.sys.publishedVersion) {
          await freshEntry.publish();
          console.log(`${progress} ✅ Published: ${entryId} (${contentType})`);
          stats.success++;
        } else {
          console.log(`${progress} ⏭️  Already published: ${entryId} (${contentType})`);
          stats.skipped++;
        }
      }
    } catch (error) {
      // Expected to fail for entries with unpublished dependencies
      const errorMsg = error.message || String(error);
      console.log(`${progress} ❌ Failed: ${entryId} (${contentType}) - ${errorMsg.substring(0, 100)}`);
      stats.failed++;

      failedEntries.push({
        id: entryId,
        contentType: contentType,
        error: errorMsg
      });
    }

    // Rate limiting: 100ms delay between requests (10 req/sec)
    await delay(100);

    // Progress summary every 100 entries
    if ((i + 1) % 100 === 0) {
      console.log('');
      console.log(`--- Progress: ${i + 1}/${draftEntries.length} ---`);
      console.log(`    Success: ${stats.success} | Failed: ${stats.failed} | Skipped: ${stats.skipped}`);
      console.log('');
    }
  }

  // Final summary
  console.log('');
  console.log('='.repeat(80));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(80));
  if (skipTag) {
    console.log(`Total draft entries found: ${stats.total + skippedByTag.length}`);
    console.log(`🏷️  Skipped by tag '${skipTag}': ${skippedByTag.length}`);
    console.log(`Attempted to publish: ${stats.total}`);
  } else {
    console.log(`Total draft entries: ${stats.total}`);
  }
  console.log(`✅ Successfully published: ${stats.success}`);
  console.log(`❌ Failed to publish: ${stats.failed}`);
  console.log(`⏭️  Skipped (already published): ${stats.skipped}`);
  console.log('='.repeat(80));
  console.log('');

  if (!dryRun && stats.failed > 0) {
    console.log('💡 TIP: Run this script again to retry failed entries.');
    console.log('   Some failures may succeed once their dependencies are published.');
    console.log('');

    // Save failed entries to a file for reference
    const failedEntriesFile = './failed-entries.json';
    fs.writeFileSync(failedEntriesFile, JSON.stringify(failedEntries, null, 2));
    console.log(`📝 Failed entries saved to: ${failedEntriesFile}`);
    console.log('');
  }

  if (!dryRun && stats.success > 0) {
    console.log(`✅ Published ${stats.success} entries in this run!`);
    console.log('');
  }

  if (!dryRun && stats.failed === 0 && stats.skipped === stats.total) {
    console.log('🎉 ALL ENTRIES ARE PUBLISHED! Migration complete!');
    console.log('');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// Get --skip-tag value
let skipTag = null;
const skipTagIndex = args.findIndex(arg => arg === '--skip-tag');
if (skipTagIndex !== -1 && args[skipTagIndex + 1]) {
  skipTag = args[skipTagIndex + 1];
}

// Run the script
publishAllDrafts(dryRun, skipTag)
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
