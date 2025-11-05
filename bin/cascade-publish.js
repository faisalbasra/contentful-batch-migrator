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

// Calculate dependency depth
function calculateDepth(itemId, dependencyMap, publishedSet, visited = new Set()) {
  // Avoid circular references
  if (visited.has(itemId)) {
    return Infinity; // Circular reference
  }

  const references = dependencyMap.get(itemId) || [];

  // If no references, depth is 0
  if (references.length === 0) {
    return 0;
  }

  // If all references are published, depth is 0 (can publish now)
  const unpublishedRefs = references.filter(refId => !publishedSet.has(refId));
  if (unpublishedRefs.length === 0) {
    return 0;
  }

  // Calculate max depth of unpublished references
  visited.add(itemId);
  const depths = unpublishedRefs.map(refId =>
    calculateDepth(refId, dependencyMap, publishedSet, new Set(visited))
  );
  visited.delete(itemId);

  const maxDepth = Math.max(...depths);
  return maxDepth === Infinity ? Infinity : maxDepth + 1;
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

  console.log('='.repeat(60) + '\n');

  // Confirm before proceeding
  if (!dryRun) {
    console.log('⚠️  This will publish draft content in the target environment.');
    console.log('   Make sure you are connected to the correct space!\n');
  }

  console.log('🔗 Connecting to Contentful...');
  const client = contentful.createClient({
    accessToken: config.managementToken
  });

  const space = await client.getSpace(config.spaceId);
  const environment = await space.getEnvironment(config.environmentId);
  console.log('✅ Connected\n');

  // Fetch all entries and assets
  console.log('📊 Analyzing content...');

  const allEntries = [];
  const allAssets = [];

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
  console.log(' ✓');

  // Fetch assets (paginated)
  skip = 0;
  let assetsTotal = 0;

  console.log('   Fetching assets...');
  while (true) {
    const response = await environment.getAssets({ limit, skip });
    allAssets.push(...response.items);
    assetsTotal = response.total;
    skip += limit;

    process.stdout.write(`\r   - Fetched ${allAssets.length}/${assetsTotal} assets`);

    if (allAssets.length >= response.total) break;
    await sleep(100);
  }
  console.log(' ✓\n');

  // Separate published and unpublished
  const publishedEntries = new Set();
  const publishedAssets = new Set();
  const draftEntries = [];
  const draftAssets = [];

  allEntries.forEach(entry => {
    if (entry.sys.publishedVersion) {
      publishedEntries.add(entry.sys.id);
    } else {
      draftEntries.push(entry);
    }
  });

  allAssets.forEach(asset => {
    if (asset.sys.publishedVersion) {
      publishedAssets.add(asset.sys.id);
    } else {
      draftAssets.push(asset);
    }
  });

  const publishedSet = new Set([...publishedEntries, ...publishedAssets]);

  console.log('📋 Analysis Results:');
  console.log(`   Total Entries: ${allEntries.length}`);
  console.log(`   - Published: ${publishedEntries.size}`);
  console.log(`   - Draft: ${draftEntries.length}`);
  console.log(`   Total Assets: ${allAssets.length}`);
  console.log(`   - Published: ${publishedAssets.size}`);
  console.log(`   - Draft: ${draftAssets.length}`);
  console.log(`   Total to publish: ${draftEntries.length + draftAssets.length}\n`);

  if (draftEntries.length === 0 && draftAssets.length === 0) {
    console.log('✅ All content is already published! Nothing to do.');
    return;
  }

  // Build dependency map
  console.log('🔍 Building dependency graph...');
  const dependencyMap = new Map();

  draftEntries.forEach(entry => {
    const references = getEntryReferences(entry);
    dependencyMap.set(entry.sys.id, references);
  });

  // Assets have no dependencies
  draftAssets.forEach(asset => {
    dependencyMap.set(asset.sys.id, []);
  });

  console.log('   ✓ Dependency graph built\n');

  // Calculate depths
  console.log('📏 Calculating dependency depths...');
  const itemDepths = new Map();
  const allDraftIds = [...draftEntries.map(e => e.sys.id), ...draftAssets.map(a => a.sys.id)];

  allDraftIds.forEach(id => {
    const depth = calculateDepth(id, dependencyMap, publishedSet);
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
    waves: []
  };

  console.log('='.repeat(60));
  console.log('🚀 Starting Cascade Publishing');
  console.log('='.repeat(60) + '\n');

  let waveNum = 1;

  for (const depth of sortedDepths) {
    if (depth === Infinity) {
      console.log(`\n⚠️  Skipping ${depthGroups.get(depth).length} items with circular references\n`);
      stats.skipped = depthGroups.get(depth).length;
      continue;
    }

    const itemsToPublish = depthGroups.get(depth);
    console.log(`📦 Wave ${waveNum} (Depth ${depth}): ${itemsToPublish.length} items`);

    let wavePublished = 0;
    let waveFailed = 0;

    for (const itemId of itemsToPublish) {
      try {
        // Determine if entry or asset
        const entry = draftEntries.find(e => e.sys.id === itemId);
        const asset = draftAssets.find(a => a.sys.id === itemId);

        if (dryRun) {
          wavePublished++;
          if (wavePublished % 50 === 0) {
            process.stdout.write(`\r   Publishing: ${wavePublished}/${itemsToPublish.length}`);
          }
          continue;
        }

        if (entry) {
          const freshEntry = await environment.getEntry(itemId);

          // Check if already published
          if (!freshEntry.sys.publishedVersion || freshEntry.sys.version > freshEntry.sys.publishedVersion) {
            await freshEntry.publish();
            publishedSet.add(itemId);
          }

          wavePublished++;
        } else if (asset) {
          const freshAsset = await environment.getAsset(itemId);

          // Check if already published
          if (!freshAsset.sys.publishedVersion || freshAsset.sys.version > freshAsset.sys.publishedVersion) {
            await freshAsset.publish();
            publishedSet.add(itemId);
          }

          wavePublished++;
        }

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
  console.log(`   Total items: ${stats.totalItems}`);
  console.log(`   ✅ Published: ${stats.published}`);

  if (stats.failed > 0) {
    console.log(`   ❌ Failed: ${stats.failed}`);
  }

  if (stats.skipped > 0) {
    console.log(`   ⚠️  Skipped (circular refs): ${stats.skipped}`);
  }

  console.log(`   📈 Success rate: ${Math.round((stats.published / stats.totalItems) * 100)}%`);

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
    console.log(`\n⚠️  ${stats.skipped} items have circular references and need manual review.`);
    console.log('   Check the Contentful UI for draft entries and resolve circular dependencies.');
  }

  if (stats.failed > 0) {
    console.log(`\n💡 Tip: Run this script again to retry failed items.`);
  }

  console.log('');
}

// Run
cascadePublish().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
