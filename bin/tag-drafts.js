#!/usr/bin/env node

const contentful = require('contentful-management');
const fs = require('fs');

// Load configuration
const configPath = './cascade-config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function tagDrafts(tagId, dryRun = false, removeTag = false) {
  console.log('='.repeat(80));
  console.log(`${removeTag ? 'REMOVE TAG FROM' : 'TAG'} DRAFT ENTRIES`);
  console.log('='.repeat(80));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE TAGGING'}`);
  console.log(`Tag: ${tagId}`);
  console.log(`Action: ${removeTag ? 'Remove tag' : 'Add tag'}`);
  console.log(`Space: ${config.spaceId}`);
  console.log(`Environment: ${config.environmentId}`);
  console.log('='.repeat(80));
  console.log('');

  // Initialize Contentful client
  const client = contentful.createClient({
    accessToken: config.managementToken,
    host: config.host || 'api.contentful.com'
  });

  const space = await client.getSpace(config.spaceId);
  const environment = await space.getEnvironment(config.environmentId);

  // First, ensure the tag exists (create it if it doesn't)
  if (!dryRun && !removeTag) {
    try {
      console.log(`Checking if tag '${tagId}' exists...`);
      await environment.getTag(tagId);
      console.log(`✅ Tag '${tagId}' exists\n`);
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('404')) {
        console.log(`Tag '${tagId}' not found, creating it...`);
        try {
          await environment.createTag(tagId, {
            name: tagId,
            sys: { id: tagId, visibility: 'private' }
          });
          console.log(`✅ Tag '${tagId}' created\n`);
        } catch (createError) {
          console.error(`❌ Failed to create tag: ${createError.message}`);
          console.log('Continuing anyway (tag might already exist)...\n');
        }
      } else {
        console.error(`Warning: Error checking tag: ${error.message}`);
        console.log('Continuing anyway...\n');
      }
    }
  }

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
      await delay(100);
    }
  }

  console.log(`\nTotal entries fetched: ${allEntries.length}`);

  // Separate published from draft
  const draftEntries = allEntries.filter(entry => !entry.sys.publishedVersion);
  const publishedEntries = allEntries.filter(entry => entry.sys.publishedVersion);

  console.log(`  Published: ${publishedEntries.length}`);
  console.log(`  Draft: ${draftEntries.length}`);
  console.log('');

  if (draftEntries.length === 0) {
    console.log('ℹ️  No draft entries found!');
    return;
  }

  console.log('='.repeat(80));
  console.log(`${removeTag ? 'REMOVING TAG FROM' : 'TAGGING'} ${draftEntries.length} DRAFT ENTRIES`);
  console.log('='.repeat(80));
  console.log('');

  const stats = {
    total: draftEntries.length,
    success: 0,
    failed: 0,
    skipped: 0,
    alreadyTagged: 0,
    notTagged: 0
  };

  // Tag each draft entry
  for (let i = 0; i < draftEntries.length; i++) {
    const entry = draftEntries[i];
    const entryId = entry.sys.id;
    const contentType = entry.sys.contentType.sys.id;
    const progress = `[${i + 1}/${draftEntries.length}]`;

    try {
      // Check current tags
      const currentTags = entry.metadata?.tags || [];
      const currentTagIds = currentTags.map(tag => tag.sys.id);
      const hasTag = currentTagIds.includes(tagId);

      if (removeTag) {
        // Remove tag
        if (!hasTag) {
          console.log(`${progress} ⏭️  Not tagged: ${entryId} (${contentType})`);
          stats.notTagged++;
          continue;
        }

        if (dryRun) {
          console.log(`${progress} [DRY RUN] Would remove tag from: ${entryId} (${contentType})`);
          stats.skipped++;
        } else {
          // Fetch fresh entry
          const freshEntry = await environment.getEntry(entryId);

          // Remove the tag
          const updatedTags = freshEntry.metadata.tags.filter(tag => tag.sys.id !== tagId);
          freshEntry.metadata.tags = updatedTags;

          await freshEntry.update();
          console.log(`${progress} ✅ Removed tag: ${entryId} (${contentType})`);
          stats.success++;
        }
      } else {
        // Add tag
        if (hasTag) {
          console.log(`${progress} ⏭️  Already tagged: ${entryId} (${contentType})`);
          stats.alreadyTagged++;
          continue;
        }

        if (dryRun) {
          console.log(`${progress} [DRY RUN] Would tag: ${entryId} (${contentType})`);
          stats.skipped++;
        } else {
          // Fetch fresh entry
          const freshEntry = await environment.getEntry(entryId);

          // Add the tag
          if (!freshEntry.metadata) {
            freshEntry.metadata = { tags: [] };
          }
          if (!freshEntry.metadata.tags) {
            freshEntry.metadata.tags = [];
          }

          freshEntry.metadata.tags.push({
            sys: {
              type: 'Link',
              linkType: 'Tag',
              id: tagId
            }
          });

          await freshEntry.update();
          console.log(`${progress} ✅ Tagged: ${entryId} (${contentType})`);
          stats.success++;
        }
      }
    } catch (error) {
      const errorMsg = error.message || String(error);
      console.log(`${progress} ❌ Failed: ${entryId} (${contentType}) - ${errorMsg.substring(0, 100)}`);
      stats.failed++;
    }

    // Rate limiting: 100ms delay between requests (10 req/sec)
    await delay(100);

    // Progress summary every 100 entries
    if ((i + 1) % 100 === 0) {
      console.log('');
      console.log(`--- Progress: ${i + 1}/${draftEntries.length} ---`);
      if (removeTag) {
        console.log(`    Success: ${stats.success} | Failed: ${stats.failed} | Not tagged: ${stats.notTagged}`);
      } else {
        console.log(`    Success: ${stats.success} | Failed: ${stats.failed} | Already tagged: ${stats.alreadyTagged}`);
      }
      console.log('');
    }
  }

  // Final summary
  console.log('');
  console.log('='.repeat(80));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total draft entries: ${stats.total}`);
  if (removeTag) {
    console.log(`✅ Successfully removed tag: ${stats.success}`);
    console.log(`⏭️  Not tagged: ${stats.notTagged}`);
  } else {
    console.log(`✅ Successfully tagged: ${stats.success}`);
    console.log(`⏭️  Already tagged: ${stats.alreadyTagged}`);
  }
  console.log(`❌ Failed: ${stats.failed}`);
  if (dryRun) {
    console.log(`⏭️  Skipped (dry run): ${stats.skipped}`);
  }
  console.log('='.repeat(80));
  console.log('');

  if (!dryRun && (stats.success > 0 || stats.alreadyTagged > 0)) {
    console.log(`✅ ${removeTag ? 'Removed tag from' : 'Tagged'} ${stats.success} draft entries!`);
    if (stats.alreadyTagged > 0) {
      console.log(`ℹ️  ${stats.alreadyTagged} were already tagged`);
    }
    console.log('');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const removeTag = args.includes('--remove');

// Get tag ID from arguments
let tagId = args.find(arg => !arg.startsWith('--'));

if (!tagId) {
  console.error('❌ Error: Tag ID is required');
  console.log('');
  console.log('Usage:');
  console.log('  node bin/tag-drafts.js <tag-id> [--dry-run] [--remove]');
  console.log('');
  console.log('Examples:');
  console.log('  node bin/tag-drafts.js skip-publish --dry-run    # Preview tagging');
  console.log('  node bin/tag-drafts.js skip-publish              # Tag all drafts');
  console.log('  node bin/tag-drafts.js skip-publish --remove     # Remove tag from drafts');
  console.log('');
  process.exit(1);
}

// Run the script
tagDrafts(tagId, dryRun, removeTag)
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
