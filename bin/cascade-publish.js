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
const stateFile = path.join(process.cwd(), 'cascade-publish-state.json');

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// Get --skip-tag value
let skipTag = null;
const skipTagIndex = args.findIndex(arg => arg === '--skip-tag');
if (skipTagIndex !== -1 && args[skipTagIndex + 1]) {
  skipTag = args[skipTagIndex + 1];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Get references from entry
function getEntryReferences(entry) {
  const references = new Set();

  function traverseFields(fields) {
    if (!fields) return;

    Object.values(fields).forEach(localeValues => {
      if (!localeValues) return;

      Object.values(localeValues).forEach(value => {
        if (!value) return;

        // Single Link
        if (value.sys && value.sys.type === 'Link') {
          if (value.sys.linkType === 'Entry' || value.sys.linkType === 'Asset') {
            references.add(value.sys.id);
          }
        }

        // Array of Links
        if (Array.isArray(value)) {
          value.forEach(item => {
            if (item && item.sys && item.sys.type === 'Link') {
              if (item.sys.linkType === 'Entry' || item.sys.linkType === 'Asset') {
                references.add(item.sys.id);
              }
            }
          });
        }
      });
    });
  }

  traverseFields(entry.fields);

  return Array.from(references);
}

// Calculate dependency depth with memoization
function calculateDepth(itemId, dependencyMap, publishedSet, memo = new Map(), visited = new Set()) {
  // Check memo cache first
  if (memo.has(itemId)) {
    return memo.get(itemId);
  }

  // Avoid circular references
  if (visited.has(itemId)) {
    return Infinity; // Circular reference
  }

  const references = dependencyMap.get(itemId) || [];

  // If no references, depth is 0
  if (references.length === 0) {
    memo.set(itemId, 0);
    return 0;
  }

  // If all references are published, depth is 0 (can publish now)
  const unpublishedRefs = references.filter(refId => !publishedSet.has(refId));
  if (unpublishedRefs.length === 0) {
    memo.set(itemId, 0);
    return 0;
  }

  // Calculate max depth of unpublished references
  visited.add(itemId);
  const depths = unpublishedRefs.map(refId =>
    calculateDepth(refId, dependencyMap, publishedSet, memo, new Set(visited))
  );
  visited.delete(itemId);

  const maxDepth = Math.max(...depths);
  const result = maxDepth === Infinity ? Infinity : maxDepth + 1;

  // Cache the result
  memo.set(itemId, result);
  return result;
}

async function cascadePublish() {
  console.log('🔄 Contentful Cascade Publisher\n');
  console.log('='.repeat(60));
  console.log(`Space: ${config.spaceId}`);
  console.log(`Environment: ${config.environmentId}`);
  console.log(`Host: ${config.host}`);

  if (dryRun) {
    console.log(`Mode: DRY RUN (no actual publishing)`);
  }

  if (skipTag) {
    console.log(`Skip tag: ${skipTag} (entries with this tag will be skipped)`);
  }

  console.log('='.repeat(60) + '\n');

  // Confirm before proceeding
  if (!dryRun) {
    console.log('⚠️  This will publish draft content in the target environment.');
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

  // Fetch all entries
  console.log('📊 Analyzing entries...');

  const allEntries = [];

  // Fetch entries (paginated)
  let skip = 0;
  const limit = 1000;
  let entriesTotal = 0;

  console.log('   Fetching entries...');
  while (true) {
    const response = await environment.getEntries({ limit, skip });
    allEntries.push(...response.items);
    entriesTotal = response.total;
    skip += limit;

    process.stdout.write(`\r   - Fetched ${allEntries.length}/${entriesTotal} entries`);

    if (allEntries.length >= response.total) break;
    await sleep(100); // Small delay to avoid rate limits
  }
  console.log(' ✓\n');

  // Separate published and unpublished
  const publishedSet = new Set();
  let draftEntries = [];

  allEntries.forEach(entry => {
    if (entry.sys.publishedVersion) {
      publishedSet.add(entry.sys.id);
    } else {
      draftEntries.push(entry);
    }
  });

  const totalDrafts = draftEntries.length;

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
  }

  console.log('📋 Analysis Results:');
  console.log(`   Total Entries: ${allEntries.length}`);
  console.log(`   - Published: ${publishedSet.size}`);
  console.log(`   - Draft: ${totalDrafts}`);
  if (skipTag) {
    console.log(`   - Skipped by tag '${skipTag}': ${skippedByTag.length}`);
  }
  console.log(`   Total to publish: ${draftEntries.length}\n`);

  if (draftEntries.length === 0) {
    console.log('✅ All entries are already published! Nothing to do.');
    return;
  }

  // Build dependency map
  console.log('🔍 Building dependency graph...');
  const dependencyMap = new Map();

  draftEntries.forEach(entry => {
    const references = getEntryReferences(entry);
    dependencyMap.set(entry.sys.id, references);
  });

  console.log('   ✓ Dependency graph built\n');

  // Calculate depths
  console.log('📏 Calculating dependency depths...');
  const itemDepths = new Map();
  const allDraftIds = draftEntries.map(e => e.sys.id);
  const depthMemo = new Map(); // Memoization cache for better performance

  allDraftIds.forEach(id => {
    const depth = calculateDepth(id, dependencyMap, publishedSet, depthMemo);
    itemDepths.set(id, depth);
  });

  // Group by depth
  const depthGroups = new Map();
  itemDepths.forEach((depth, id) => {
    if (!depthGroups.has(depth)) {
      depthGroups.set(depth, []);
    }
    depthGroups.get(depth).push(id);
  });

  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);

  console.log('   ✓ Depths calculated\n');
  console.log('📊 Depth Distribution:');
  sortedDepths.forEach(depth => {
    const count = depthGroups.get(depth).length;
    const depthLabel = depth === Infinity ? '∞ (circular)' : depth;
    console.log(`   Depth ${depthLabel}: ${count} items`);
  });
  console.log('');

  // Publishing waves
  const stats = {
    startTime: Date.now(),
    totalItems: allDraftIds.length,
    published: 0,
    failed: 0,
    skipped: 0,
    skippedByTag: skippedByTag.length,
    waves: []
  };

  console.log('='.repeat(60));
  console.log('🚀 Starting Cascade Publishing (Entries Only)');
  console.log('='.repeat(60) + '\n');

  let waveNum = 1;

  for (const depth of sortedDepths) {
    if (depth === Infinity) {
      console.log(`\n⚠️  Skipping ${depthGroups.get(depth).length} entries with circular references\n`);
      stats.skipped = depthGroups.get(depth).length;
      continue;
    }

    const itemsToPublish = depthGroups.get(depth);
    console.log(`📦 Wave ${waveNum} (Depth ${depth}): ${itemsToPublish.length} entries`);

    let wavePublished = 0;
    let waveFailed = 0;

    for (const itemId of itemsToPublish) {
      try {
        if (dryRun) {
          wavePublished++;
          if (wavePublished % 50 === 0) {
            process.stdout.write(`\r   Publishing: ${wavePublished}/${itemsToPublish.length}`);
          }
          continue;
        }

        const freshEntry = await environment.getEntry(itemId);

        // Check if already published
        if (!freshEntry.sys.publishedVersion || freshEntry.sys.version > freshEntry.sys.publishedVersion) {
          await freshEntry.publish();
          publishedSet.add(itemId);
        }

        wavePublished++;

        if (wavePublished % 50 === 0) {
          process.stdout.write(`\r   Publishing: ${wavePublished}/${itemsToPublish.length}`);
        }

        // Rate limiting
        await sleep(100);

      } catch (error) {
        waveFailed++;
        // Continue with next item
      }
    }

    console.log(`\r   Publishing: ${wavePublished}/${itemsToPublish.length} ✓`);

    if (waveFailed > 0) {
      console.log(`   ⚠️  Failed: ${waveFailed}`);
    }

    stats.waves.push({
      wave: waveNum,
      depth: depth,
      total: itemsToPublish.length,
      published: wavePublished,
      failed: waveFailed
    });

    stats.published += wavePublished;
    stats.failed += waveFailed;

    waveNum++;

    // Delay between waves
    if (depth < sortedDepths[sortedDepths.length - 1] && !dryRun) {
      console.log('   ⏳ Waiting 5 seconds before next wave...\n');
      await sleep(5000);
    } else {
      console.log('');
    }
  }

  // Final report
  const endTime = Date.now();
  const duration = Math.round((endTime - stats.startTime) / 1000);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  console.log('='.repeat(60));
  console.log('🎉 Cascade Publishing Complete!');
  console.log('='.repeat(60));
  console.log(`⏱️  Duration: ${minutes}m ${seconds}s`);
  console.log(`📊 Results:`);
  if (stats.skippedByTag > 0) {
    console.log(`   Total draft entries found: ${stats.totalItems + stats.skippedByTag}`);
    console.log(`   🏷️  Skipped by tag: ${stats.skippedByTag}`);
    console.log(`   Attempted to publish: ${stats.totalItems}`);
  } else {
    console.log(`   Total entries: ${stats.totalItems}`);
  }
  console.log(`   ✅ Published: ${stats.published}`);

  if (stats.failed > 0) {
    console.log(`   ❌ Failed: ${stats.failed}`);
  }

  if (stats.skipped > 0) {
    console.log(`   ⚠️  Skipped (circular refs): ${stats.skipped}`);
  }

  const successRate = stats.totalItems > 0 ? Math.round((stats.published / stats.totalItems) * 100) : 0;
  console.log(`   📈 Success rate: ${successRate}%`);

  // Save state
  const state = {
    targetSpace: config.spaceId,
    environment: config.environmentId,
    completedAt: new Date().toISOString(),
    dryRun: dryRun,
    stats: stats
  };

  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log(`\n💾 State saved to: ${stateFile}`);

  if (stats.skipped > 0) {
    console.log(`\n⚠️  ${stats.skipped} entries have circular references and need manual review.`);
    console.log('   Check the Contentful UI for draft entries and resolve circular dependencies.');
  }

  if (stats.failed > 0) {
    console.log(`\n💡 Tip: Run this script again to retry failed entries.`);
  }

  console.log('');
}

// Run
cascadePublish().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
