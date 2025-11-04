#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const contentfulManagement = require('contentful-management');
const RateLimiter = require('./rateLimiter');

// Load configuration
const configPath = path.resolve(__dirname, '../batch-config.json');
if (!fs.existsSync(configPath)) {
  console.error('❌ Error: batch-config.json not found');
  console.error('Please copy batch-config.example.json to batch-config.json and configure it');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { sourceFile, targetSpace, importOptions = {}, rateLimits = {} } = config;

// Helper to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Load export data
console.log('📂 Loading export file...');
const exportData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));

console.log('\n📊 Export Summary:');
console.log(`  - Content Types: ${exportData.contentTypes?.length || 0}`);
console.log(`  - Locales: ${exportData.locales?.length || 0}`);
console.log(`  - Tags: ${exportData.tags?.length || 0}`);
console.log(`  - Assets: ${exportData.assets?.length || 0}`);
console.log(`  - Entries: ${exportData.entries?.length || 0}`);

// Initialize rate limiter if enabled
let rateLimiter = null;
if (rateLimits.enabled) {
  console.log(`\n⏱️  Rate Limiter: ${rateLimits.requestsPerSecond || 10} req/sec, ${rateLimits.requestsPerHour || 36000} req/hour`);
  rateLimiter = new RateLimiter({
    requestsPerSecond: rateLimits.requestsPerSecond || 10,
    requestsPerHour: rateLimits.requestsPerHour || 36000,
    verbose: rateLimits.verbose !== false
  });
}

// Log file setup
const logDir = path.dirname(sourceFile);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logDir, `import-direct-${timestamp}.log`);
const errorLogFile = path.join(logDir, `import-direct-${timestamp}-errors.log`);

const logStream = fs.createWriteStream(logFile, { flags: 'a' });
const errorStream = fs.createWriteStream(errorLogFile, { flags: 'a' });

function log(message, stream = logStream) {
  console.log(message);
  stream.write(message + '\n');
}

async function importDirect() {
  const startTime = Date.now();

  try {
    console.log('\n🔌 Connecting to Contentful...');
    const client = contentfulManagement.createClient({
      accessToken: targetSpace.managementToken,
      host: targetSpace.host || 'api.contentful.com'
    });

    const space = await client.getSpace(targetSpace.spaceId);
    const environment = await space.getEnvironment(targetSpace.environmentId || 'master');

    console.log(`✅ Connected to space: ${targetSpace.spaceId}, environment: ${targetSpace.environmentId || 'master'}\n`);

    // Statistics
    const stats = {
      locales: { total: 0, success: 0, failed: 0 },
      tags: { total: 0, success: 0, failed: 0 },
      contentTypes: { total: 0, success: 0, failed: 0 },
      editorInterfaces: { total: 0, success: 0, failed: 0 },
      assets: { total: 0, success: 0, failed: 0 },
      entries: { total: 0, success: 0, failed: 0 }
    };

    // ========================================
    // 1. Import Locales
    // ========================================
    if (exportData.locales?.length > 0) {
      log(`\n📍 Importing ${exportData.locales.length} locales...`);
      stats.locales.total = exportData.locales.length;

      for (const locale of exportData.locales) {
        try {
          const throttledCall = async () => {
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

          stats.locales.success++;
          log(`  ✅ Locale: ${locale.code}`);
        } catch (error) {
          stats.locales.failed++;
          log(`  ⚠️  Locale ${locale.code}: ${error.message}`, errorStream);
        }
      }
    }

    // ========================================
    // 2. Import Tags
    // ========================================
    if (exportData.tags?.length > 0) {
      log(`\n🏷️  Importing ${exportData.tags.length} tags...`);
      stats.tags.total = exportData.tags.length;

      for (const tag of exportData.tags) {
        try {
          const throttledCall = async () => {
            // createTag signature: (id: string, name: string, visibility?: 'public' | 'private')
            return await environment.createTag(
              tag.sys.id,
              tag.name,
              tag.sys.visibility || 'public'
            );
          };

          if (rateLimiter) {
            await rateLimiter.throttle(throttledCall);
          } else {
            await throttledCall();
          }

          stats.tags.success++;
          if (stats.tags.success % 50 === 0) {
            log(`  📊 Progress: ${stats.tags.success}/${stats.tags.total} tags`);
          }
        } catch (error) {
          stats.tags.failed++;
          if (!error.message.includes('already exists')) {
            log(`  ⚠️  Tag ${tag.name}: ${error.message}`, errorStream);
          }
        }
      }
      log(`  ✅ Imported ${stats.tags.success}/${stats.tags.total} tags`);
    }

    // ========================================
    // 3. Import Content Types
    // ========================================
    if (exportData.contentTypes?.length > 0) {
      log(`\n📋 Importing ${exportData.contentTypes.length} content types...`);
      stats.contentTypes.total = exportData.contentTypes.length;

      for (const contentType of exportData.contentTypes) {
        try {
          const throttledCall = async () => {
            return await environment.createContentTypeWithId(contentType.sys.id, contentType);
          };

          const newContentType = rateLimiter
            ? await rateLimiter.throttle(throttledCall)
            : await throttledCall();

          // Publish content type
          const throttledPublish = async () => {
            return await newContentType.publish();
          };

          if (rateLimiter) {
            await rateLimiter.throttle(throttledPublish);
          } else {
            await throttledPublish();
          }

          stats.contentTypes.success++;
          log(`  ✅ Content Type: ${contentType.name}`);
        } catch (error) {
          stats.contentTypes.failed++;
          log(`  ⚠️  Content Type ${contentType.name}: ${error.message}`, errorStream);
        }
      }
    }

    // ========================================
    // 4. Import Editor Interfaces
    // ========================================
    if (exportData.editorInterfaces?.length > 0) {
      log(`\n🖥️  Importing ${exportData.editorInterfaces.length} editor interfaces...`);
      stats.editorInterfaces.total = exportData.editorInterfaces.length;

      for (const editorInterface of exportData.editorInterfaces) {
        try {
          const throttledCall = async () => {
            const contentType = await environment.getContentType(editorInterface.sys.contentType.sys.id);
            return await contentType.getEditorInterface().then(ei => {
              ei.controls = editorInterface.controls;
              ei.sidebar = editorInterface.sidebar;
              return ei.update();
            });
          };

          if (rateLimiter) {
            await rateLimiter.throttle(throttledCall);
          } else {
            await throttledCall();
          }

          stats.editorInterfaces.success++;
        } catch (error) {
          stats.editorInterfaces.failed++;
          log(`  ⚠️  Editor Interface: ${error.message}`, errorStream);
        }
      }
      log(`  ✅ Imported ${stats.editorInterfaces.success}/${stats.editorInterfaces.total} editor interfaces`);
    }

    // ========================================
    // 5. Import Assets
    // ========================================
    if (exportData.assets?.length > 0) {
      log(`\n📁 Importing ${exportData.assets.length} assets...`);
      stats.assets.total = exportData.assets.length;

      for (const asset of exportData.assets) {
        try {
          // Prepare asset for import - convert 'url' to 'uploadFrom'
          // This tells Contentful to download from source and create new URLs
          const preparedAsset = JSON.parse(JSON.stringify(asset)); // Deep clone

          if (preparedAsset.fields && preparedAsset.fields.file) {
            for (const locale in preparedAsset.fields.file) {
              const file = preparedAsset.fields.file[locale];
              if (file) {
                // Remove read-only metadata (will be regenerated)
                delete file.details;

                if (file.url) {
                  // Convert relative URL to absolute
                  const fullUrl = file.url.startsWith('//') ? `https:${file.url}` : file.url;

                  // Replace 'url' with 'uploadFrom' to trigger download & re-upload
                  file.uploadFrom = {
                    sys: {
                      type: 'Link',
                      linkType: 'Upload',
                      id: fullUrl
                    }
                  };

                  // Remove old URL (will be regenerated in new space)
                  delete file.url;
                }
              }
            }
          }

          // Create or update asset with clean data
          const throttledCreate = async () => {
            try {
              // Try to create asset with clean data
              return await environment.createAssetWithId(asset.sys.id, preparedAsset);
            } catch (error) {
              // If asset already exists, update it with clean data
              if (error.status === 409 || error.message.includes('already exists')) {
                const existingAsset = await environment.getAsset(asset.sys.id);
                // Update with clean fields
                existingAsset.fields = preparedAsset.fields;
                existingAsset.metadata = preparedAsset.metadata || existingAsset.metadata;
                return await existingAsset.update();
              }
              throw error;
            }
          };

          const newAsset = rateLimiter
            ? await rateLimiter.throttle(throttledCreate)
            : await throttledCreate();

          // Process for all locales if upload is enabled
          if (importOptions.uploadAssets) {
            // Check if asset is already processed
            const isAlreadyProcessed = Object.values(newAsset.fields.file || {}).every(
              file => file.url
            );

            // Only process if not already processed
            if (!isAlreadyProcessed) {
              try {
                const throttledProcess = async () => {
                  return await newAsset.processForAllLocales();
                };

                await (rateLimiter
                  ? rateLimiter.throttle(throttledProcess)
                  : throttledProcess());
              } catch (processError) {
                if (!processError.message.includes('File has already been processed')) {
                  throw processError;
                }
              }
            }

            // Wait for processing to complete
            let attempts = 0;
            const maxAttempts = 30;
            let fullyProcessed = isAlreadyProcessed;

            while (attempts < maxAttempts && !fullyProcessed) {
              await sleep(2000);

              const throttledGet = async () => {
                return await environment.getAsset(asset.sys.id);
              };

              const checkedAsset = rateLimiter
                ? await rateLimiter.throttle(throttledGet)
                : await throttledGet();

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

          stats.assets.success++;
          if (stats.assets.success % 50 === 0) {
            log(`  📊 Progress: ${stats.assets.success}/${stats.assets.total} assets`);
          }
        } catch (error) {
          stats.assets.failed++;
          log(`  ❌ Asset ${asset.sys.id}: ${error.message}`, errorStream);
          errorStream.write(JSON.stringify(error, null, 2) + '\n');
        }
      }
      log(`  ✅ Imported ${stats.assets.success}/${stats.assets.total} assets`);
    }

    // ========================================
    // 6. Import Entries
    // ========================================
    if (exportData.entries?.length > 0) {
      log(`\n📝 Importing ${exportData.entries.length} entries...`);
      stats.entries.total = exportData.entries.length;

      for (const entry of exportData.entries) {
        try {
          const contentTypeId = entry.sys.contentType.sys.id;

          const throttledCreate = async () => {
            if (!importOptions.skipContentUpdates) {
              try {
                return await environment.getEntry(entry.sys.id);
              } catch (error) {
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

          stats.entries.success++;
          if (stats.entries.success % 100 === 0) {
            log(`  📊 Progress: ${stats.entries.success}/${stats.entries.total} entries`);
          }
        } catch (error) {
          stats.entries.failed++;
          log(`  ❌ Entry ${entry.sys.id}: ${error.message}`, errorStream);
          errorStream.write(JSON.stringify(error, null, 2) + '\n');
        }
      }
      log(`  ✅ Imported ${stats.entries.success}/${stats.entries.total} entries`);
    }

    // ========================================
    // Summary
    // ========================================
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000 / 60).toFixed(1);

    log('\n' + '='.repeat(60));
    log('📊 Import Summary');
    log('='.repeat(60));
    log(`Locales:            ${stats.locales.success}/${stats.locales.total} (${stats.locales.failed} failed)`);
    log(`Tags:               ${stats.tags.success}/${stats.tags.total} (${stats.tags.failed} failed)`);
    log(`Content Types:      ${stats.contentTypes.success}/${stats.contentTypes.total} (${stats.contentTypes.failed} failed)`);
    log(`Editor Interfaces:  ${stats.editorInterfaces.success}/${stats.editorInterfaces.total} (${stats.editorInterfaces.failed} failed)`);
    log(`Assets:             ${stats.assets.success}/${stats.assets.total} (${stats.assets.failed} failed)`);
    log(`Entries:            ${stats.entries.success}/${stats.entries.total} (${stats.entries.failed} failed)`);
    log('='.repeat(60));
    log(`⏱️  Total Time: ${duration} minutes`);
    log('='.repeat(60));

    // Print rate limiter stats if enabled
    if (rateLimiter) {
      log('\n');
      rateLimiter.printStats();
    }

    log(`\n📝 Logs saved to:`);
    log(`  - ${logFile}`);
    log(`  - ${errorLogFile}`);

    const totalFailed = stats.locales.failed + stats.tags.failed + stats.contentTypes.failed +
                        stats.editorInterfaces.failed + stats.assets.failed + stats.entries.failed;

    if (totalFailed === 0) {
      log('\n✅ Import completed successfully!');
    } else {
      log(`\n⚠️  Import completed with ${totalFailed} failures. Check error log for details.`);
    }

  } catch (error) {
    log(`\n❌ Import failed: ${error.message}`, errorStream);
    errorStream.write(JSON.stringify(error, null, 2) + '\n');
    process.exit(1);
  } finally {
    logStream.end();
    errorStream.end();
  }
}

// Run import
importDirect().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
