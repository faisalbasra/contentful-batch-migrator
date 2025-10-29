#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const contentful = require('contentful-management');
const RateLimiter = require('./rateLimiter');

// Load configuration
const config = JSON.parse(fs.readFileSync('./batch-config.json', 'utf8'));

const {
  outputDir,
  targetSpace,
  importOptions,
  rateLimits
} = config;

const STATE_FILE = path.join(outputDir, 'import-state.json');
const LOG_DIR = path.join(outputDir, 'logs');

// Ensure log directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

ensureDir(LOG_DIR);

// Load or create import state
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return {
    startedAt: new Date().toISOString(),
    completedBatches: [],
    failedBatches: [],
    currentBatch: null
  };
}

// Save import state
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Helper function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Log to file and console
function log(message, logStream) {
  console.log(message);
  if (logStream) {
    logStream.write(message + '\n');
  }
}

// Function to import a single batch using SDK
async function importBatch(batchDir, batchNum, isFirstBatch) {
  const batchLogFile = path.join(LOG_DIR, `batch-${batchNum}.log`);
  const batchErrorFile = path.join(LOG_DIR, `batch-${batchNum}-errors.log`);

  const logStream = fs.createWriteStream(batchLogFile, { flags: 'a' });
  const errorStream = fs.createWriteStream(batchErrorFile, { flags: 'a' });

  try {
    // Read batch data
    const batchJsonPath = path.join(batchDir, 'exported-space.json');
    const batchData = JSON.parse(fs.readFileSync(batchJsonPath, 'utf8'));

    log(`\n📦 Batch Contents:`, logStream);
    log(`  - Content Types: ${batchData.contentTypes?.length || 0}`, logStream);
    log(`  - Locales: ${batchData.locales?.length || 0}`, logStream);
    log(`  - Tags: ${batchData.tags?.length || 0}`, logStream);
    log(`  - Assets: ${batchData.assets?.length || 0}`, logStream);
    log(`  - Entries: ${batchData.entries?.length || 0}`, logStream);

    // Initialize rate limiter
    const rateLimiter = rateLimits?.enabled
      ? new RateLimiter({
          requestsPerSecond: rateLimits.requestsPerSecond,
          requestsPerHour: rateLimits.requestsPerHour,
          verbose: rateLimits.verbose
        })
      : null;

    if (rateLimiter) {
      log(`\n⏱️  Rate Limiter: ${rateLimits.requestsPerSecond} req/sec, ${rateLimits.requestsPerHour} req/hour`, logStream);
    } else {
      log(`\n⚠️  Rate Limiter: DISABLED`, logStream);
    }

    // Initialize Contentful Management client
    log(`\n🔌 Connecting to Contentful...`, logStream);
    const client = contentful.createClient({
      accessToken: targetSpace.managementToken,
      host: targetSpace.host || 'api.contentful.com'
    });

    const space = await client.getSpace(targetSpace.spaceId);
    const environment = await space.getEnvironment(targetSpace.environmentId);
    log(`✅ Connected to space: ${targetSpace.spaceId}, environment: ${targetSpace.environmentId}`, logStream);

    // Import content model (first batch only)
    if (isFirstBatch && batchData.contentTypes?.length > 0) {
      log(`\n📐 Importing Content Model...`, logStream);

      // Import locales first
      if (batchData.locales?.length > 0) {
        log(`  📍 Importing ${batchData.locales.length} locales...`, logStream);
        for (const locale of batchData.locales) {
          try {
            const throttledCall = async () => {
              // Check if locale exists
              const locales = await environment.getLocales();
              const existingLocale = locales.items.find(l => l.code === locale.code);

              if (!existingLocale) {
                return await environment.createLocale(locale);
              }
              return existingLocale;
            };

            if (rateLimiter) {
              await rateLimiter.throttle(throttledCall);
            } else {
              await throttledCall();
            }

            log(`    ✅ Locale: ${locale.code}`, logStream);
          } catch (error) {
            log(`    ⚠️  Locale ${locale.code}: ${error.message}`, errorStream);
          }
        }
      }

      // Import tags
      if (batchData.tags?.length > 0) {
        log(`  🏷️  Importing ${batchData.tags.length} tags...`, logStream);
        for (const tag of batchData.tags) {
          try {
            const throttledCall = async () => {
              return await environment.createTag(tag.sys.id, tag);
            };

            if (rateLimiter) {
              await rateLimiter.throttle(throttledCall);
            } else {
              await throttledCall();
            }

            log(`    ✅ Tag: ${tag.name}`, logStream);
          } catch (error) {
            // Tags may already exist, that's ok
            if (!error.message.includes('already exists')) {
              log(`    ⚠️  Tag ${tag.name}: ${error.message}`, errorStream);
            }
          }
        }
      }

      // Import content types
      log(`  📋 Importing ${batchData.contentTypes.length} content types...`, logStream);
      for (const contentType of batchData.contentTypes) {
        try {
          const throttledCall = async () => {
            const ct = await environment.createContentTypeWithId(contentType.sys.id, contentType);
            if (!importOptions.skipContentPublishing) {
              return await ct.publish();
            }
            return ct;
          };

          if (rateLimiter) {
            await rateLimiter.throttle(throttledCall);
          } else {
            await throttledCall();
          }

          log(`    ✅ Content Type: ${contentType.name}`, logStream);
        } catch (error) {
          log(`    ❌ Content Type ${contentType.name}: ${error.message}`, errorStream);
          throw error;
        }
      }

      // Import editor interfaces
      if (batchData.editorInterfaces?.length > 0) {
        log(`  🖥️  Importing ${batchData.editorInterfaces.length} editor interfaces...`, logStream);
        for (const editorInterface of batchData.editorInterfaces) {
          try {
            const throttledCall = async () => {
              const contentType = await environment.getContentType(editorInterface.sys.contentType.sys.id);
              return await contentType.getEditorInterface().then(ei => {
                ei.controls = editorInterface.controls;
                return ei.update();
              });
            };

            if (rateLimiter) {
              await rateLimiter.throttle(throttledCall);
            } else {
              await throttledCall();
            }

            log(`    ✅ Editor Interface: ${editorInterface.sys.contentType.sys.id}`, logStream);
          } catch (error) {
            log(`    ⚠️  Editor Interface ${editorInterface.sys.contentType.sys.id}: ${error.message}`, errorStream);
          }
        }
      }
    }

    // Import assets
    if (batchData.assets?.length > 0) {
      log(`\n📁 Importing ${batchData.assets.length} assets...`, logStream);
      let assetsImported = 0;

      for (const asset of batchData.assets) {
        try {
          // Create or update asset
          const throttledCreate = async () => {
            if (importOptions.skipAssetUpdates) {
              // Check if asset exists
              try {
                return await environment.getAsset(asset.sys.id);
              } catch (error) {
                // Asset doesn't exist, create it
                return await environment.createAssetWithId(asset.sys.id, asset);
              }
            } else {
              return await environment.createAssetWithId(asset.sys.id, asset);
            }
          };

          const newAsset = rateLimiter
            ? await rateLimiter.throttle(throttledCreate)
            : await throttledCreate();

          // Process for all locales if upload is enabled
          if (importOptions.uploadAssets) {
            const throttledProcess = async () => {
              return await newAsset.processForAllLocales();
            };

            const processedAsset = rateLimiter
              ? await rateLimiter.throttle(throttledProcess)
              : await throttledProcess();

            // Wait for processing to complete
            let attempts = 0;
            const maxAttempts = 30;
            let fullyProcessed = false;

            while (attempts < maxAttempts && !fullyProcessed) {
              await sleep(2000); // Wait 2 seconds between checks

              const throttledGet = async () => {
                return await environment.getAsset(asset.sys.id);
              };

              const checkedAsset = rateLimiter
                ? await rateLimiter.throttle(throttledGet)
                : await throttledGet();

              // Check if all locales are processed
              fullyProcessed = Object.values(checkedAsset.fields.file || {}).every(
                file => file.url
              );

              attempts++;
            }

            // Publish asset if not skipping
            if (!importOptions.skipContentPublishing && fullyProcessed) {
              const throttledPublish = async () => {
                const assetToPublish = await environment.getAsset(asset.sys.id);
                return await assetToPublish.publish();
              };

              if (rateLimiter) {
                await rateLimiter.throttle(throttledPublish);
              } else {
                await throttledPublish();
              }
            }
          }

          assetsImported++;
          if (assetsImported % 10 === 0) {
            log(`  📊 Progress: ${assetsImported}/${batchData.assets.length} assets`, logStream);
          }
        } catch (error) {
          log(`  ❌ Asset ${asset.sys.id}: ${error.message}`, errorStream);
          // Continue with other assets
        }
      }

      log(`  ✅ Imported ${assetsImported}/${batchData.assets.length} assets`, logStream);
    }

    // Import entries
    if (batchData.entries?.length > 0) {
      log(`\n📝 Importing ${batchData.entries.length} entries...`, logStream);
      let entriesImported = 0;

      for (const entry of batchData.entries) {
        try {
          const contentTypeId = entry.sys.contentType.sys.id;

          // Create or update entry
          const throttledCreate = async () => {
            if (importOptions.skipContentUpdates) {
              // Check if entry exists
              try {
                return await environment.getEntry(entry.sys.id);
              } catch (error) {
                // Entry doesn't exist, create it
                return await environment.createEntryWithId(contentTypeId, entry.sys.id, entry);
              }
            } else {
              return await environment.createEntryWithId(contentTypeId, entry.sys.id, entry);
            }
          };

          const newEntry = rateLimiter
            ? await rateLimiter.throttle(throttledCreate)
            : await throttledCreate();

          // Publish entry if not skipping
          if (!importOptions.skipContentPublishing) {
            const throttledPublish = async () => {
              return await newEntry.publish();
            };

            if (rateLimiter) {
              await rateLimiter.throttle(throttledPublish);
            } else {
              await throttledPublish();
            }
          }

          entriesImported++;
          if (entriesImported % 50 === 0) {
            log(`  📊 Progress: ${entriesImported}/${batchData.entries.length} entries`, logStream);
          }
        } catch (error) {
          log(`  ❌ Entry ${entry.sys.id}: ${error.message}`, errorStream);
          // Continue with other entries
        }
      }

      log(`  ✅ Imported ${entriesImported}/${batchData.entries.length} entries`, logStream);
    }

    // Print rate limiter stats
    if (rateLimiter) {
      rateLimiter.printStats();
    }

    logStream.end();
    errorStream.end();

    return { success: true, batchNum };

  } catch (error) {
    log(`\n❌ Batch import failed: ${error.message}`, errorStream);
    logStream.end();
    errorStream.end();
    throw error;
  }
}

// Main import function
async function importAllBatches(startFromBatch = 1) {
  try {
    console.log('🚀 Starting Contentful Batch Import...\n');

    // Load manifest
    const manifestPath = path.join(outputDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifest file not found: ${manifestPath}. Please run npm run split first.`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`📋 Found ${manifest.totalBatches} batches to import\n`);

    // Load state
    const state = loadState();
    console.log(`📊 Import state:`);
    console.log(`  - Completed batches: ${state.completedBatches.length}`);
    console.log(`  - Failed batches: ${state.failedBatches.length}`);
    console.log(`  - Starting from batch: ${startFromBatch}\n`);

    let successCount = 0;
    let failureCount = 0;

    for (let i = startFromBatch; i <= manifest.totalBatches; i++) {
      const batchNum = String(i).padStart(2, '0');
      const batchDir = path.join(outputDir, `batch-${batchNum}`);

      // Skip if already completed
      if (state.completedBatches.includes(batchNum)) {
        console.log(`⏭️  Batch ${batchNum} already completed, skipping...\n`);
        continue;
      }

      console.log(`\n${'='.repeat(60)}`);
      console.log(`📦 Importing Batch ${batchNum} of ${manifest.totalBatches}`);
      console.log(`${'='.repeat(60)}\n`);

      const batchInfo = manifest.batches.find(b => b.batchId === `batch-${batchNum}`);
      console.log(`Batch info:`);
      console.log(`  - Assets: ${batchInfo.assets}`);
      console.log(`  - Entries: ${batchInfo.entries}`);
      console.log(`  - Has content model: ${batchInfo.hasContentModel ? 'Yes' : 'No'}`);
      console.log(`  - Directory: ${batchDir}\n`);

      // Update state
      state.currentBatch = batchNum;
      saveState(state);

      let retries = 0;
      let success = false;

      while (retries <= importOptions.maxRetries && !success) {
        try {
          if (retries > 0) {
            console.log(`\n⚠️  Retry attempt ${retries} of ${importOptions.maxRetries}...\n`);
            await sleep(importOptions.retryDelay * retries); // Exponential backoff
          }

          await importBatch(batchDir, batchNum, batchInfo.hasContentModel);
          success = true;
          successCount++;

          // Mark as completed
          state.completedBatches.push(batchNum);
          state.currentBatch = null;
          saveState(state);

          console.log(`\n✅ Batch ${batchNum} imported successfully!`);

          // Wait before next batch (except for the last one)
          if (i < manifest.totalBatches) {
            const delaySeconds = Math.floor(importOptions.delayBetweenBatches / 1000);
            console.log(`\n⏳ Waiting ${delaySeconds} seconds before next batch...`);
            await sleep(importOptions.delayBetweenBatches);
          }

        } catch (error) {
          retries++;
          console.error(`\n❌ Error importing batch ${batchNum}:`, error.message);

          if (retries > importOptions.maxRetries) {
            state.failedBatches.push({
              batch: batchNum,
              error: error.message,
              timestamp: new Date().toISOString()
            });
            state.currentBatch = null;
            saveState(state);
            failureCount++;

            console.error(`\n❌ Batch ${batchNum} failed after ${importOptions.maxRetries} retries. Moving to next batch...`);
          }
        }
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Import Summary`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Total batches: ${manifest.totalBatches}`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failureCount}`);
    console.log(`\nLogs saved to: ${LOG_DIR}`);
    console.log(`State saved to: ${STATE_FILE}`);

    if (failureCount > 0) {
      console.log(`\n⚠️  Some batches failed. Review error logs and run:`);
      console.log(`  npm run resume`);
      process.exit(1);
    } else {
      console.log(`\n🎉 All batches imported successfully!`);
      console.log(`\nNext steps:`);
      console.log(`  1. Run validation: npm run validate`);
      console.log(`  2. Test your content in: ${targetSpace.environmentId}`);
    }

  } catch (error) {
    console.error('\n❌ Fatal error during import:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let startFromBatch = 1;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--start-from' && args[i + 1]) {
    startFromBatch = parseInt(args[i + 1], 10);
  }
}

// Run the import
importAllBatches(startFromBatch);
