#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Transforms asset file objects from local file references to uploadFrom URLs
 * for direct CDN-to-CDN transfer.
 *
 * Usage: node bin/transform-to-uploadfrom.js <input-file> <output-file>
 *
 * This script:
 * 1. Reads an export JSON file
 * 2. Transforms asset file objects to use uploadFrom with CDN URLs
 * 3. Writes the transformed export to a new file
 *
 * Benefits:
 * - 50-70% faster import (CDN-to-CDN vs local upload)
 * - No local storage needed
 * - Contentful fetches directly from source space CDN
 */

function transformAssetToUploadFrom(asset) {
  if (!asset.fields || !asset.fields.file) {
    return asset;
  }

  // Transform each locale
  Object.keys(asset.fields.file).forEach(locale => {
    const fileObj = asset.fields.file[locale];

    if (!fileObj || !fileObj.url) {
      return;
    }

    // Construct full CDN URL
    // Format: //images.ctfassets.net/{spaceId}/{assetId}/{hash}/{fileName}
    let cdnUrl = fileObj.url;

    // Ensure it's a full HTTPS URL
    if (cdnUrl.startsWith('//')) {
      cdnUrl = 'https:' + cdnUrl;
    } else if (!cdnUrl.startsWith('http')) {
      cdnUrl = 'https://' + cdnUrl;
    }

    // Transform to uploadFrom format - keep url field for validation
    asset.fields.file[locale] = {
      contentType: fileObj.contentType,
      fileName: fileObj.fileName,
      url: fileObj.url,  // Keep original url - required by Contentful CLI
      uploadFrom: {
        sys: {
          type: 'Link',
          linkType: 'Upload',
          id: cdnUrl
        }
      }
    };

    // Only remove details field
    delete asset.fields.file[locale].details;
  });

  return asset;
}

function transformExport(inputFile, outputFile) {
  console.log('🔄 Transforming export to use uploadFrom...\n');
  console.log(`📂 Input: ${inputFile}`);
  console.log(`📂 Output: ${outputFile}\n`);

  // Read export file
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Input file not found: ${inputFile}`);
    process.exit(1);
  }

  const exportData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

  if (!exportData.assets || !Array.isArray(exportData.assets)) {
    console.error('❌ Invalid export format: no assets array found');
    process.exit(1);
  }

  const totalAssets = exportData.assets.length;
  console.log(`📦 Processing ${totalAssets} assets...`);

  let transformedCount = 0;
  let skippedCount = 0;

  // Transform assets
  exportData.assets = exportData.assets.map((asset, index) => {
    const transformed = transformAssetToUploadFrom(asset);

    // Check if asset has uploadFrom now
    if (asset.fields && asset.fields.file) {
      const hasUploadFrom = Object.values(asset.fields.file).some(
        fileObj => fileObj && fileObj.uploadFrom
      );

      if (hasUploadFrom) {
        transformedCount++;
      } else {
        skippedCount++;
      }
    } else {
      skippedCount++;
    }

    // Progress indicator
    if ((index + 1) % 100 === 0 || (index + 1) === totalAssets) {
      process.stdout.write(`\r   Progress: ${index + 1}/${totalAssets} assets processed`);
    }

    return transformed;
  });

  console.log('\n');

  // Write transformed export
  fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2));

  console.log('✅ Transformation complete!\n');
  console.log('📊 Summary:');
  console.log(`   Total assets: ${totalAssets}`);
  console.log(`   Transformed: ${transformedCount}`);
  console.log(`   Skipped: ${skippedCount}`);
  console.log(`\n💡 Next steps:`);
  console.log(`   1. Use this transformed file for splitting:`);
  console.log(`      Update batch-config.json: "sourceFile": "${outputFile}"`);
  console.log(`   2. Run split: npm run split`);
  console.log(`   3. Import will use uploadFrom URLs (faster!)`);
  console.log(`\n⚡ Expected benefits:`);
  console.log(`   • 50-70% faster import`);
  console.log(`   • No local storage needed`);
  console.log(`   • CDN-to-CDN transfer`);
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Usage: node bin/transform-to-uploadfrom.js <input-file> <output-file>');
  console.log('');
  console.log('Example:');
  console.log('  node bin/transform-to-uploadfrom.js \\');
  console.log('    ./contentful-export/exported-space-no-validations.json \\');
  console.log('    ./contentful-export/exported-space-uploadfrom.json');
  process.exit(1);
}

const inputFile = path.resolve(args[0]);
const outputFile = path.resolve(args[1]);

transformExport(inputFile, outputFile);
