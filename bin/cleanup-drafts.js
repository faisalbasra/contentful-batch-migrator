#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const exportFile = './contentful-export/exported-space.json';
const outputFile = './contentful-export/exported-space-cleaned.json';
const reportFile = './draft-cleanup-report.json';

console.log('🔍 Analyzing exported content for draft issues...\n');

// Read the exported content
const exportData = JSON.parse(fs.readFileSync(exportFile, 'utf8'));

// Store content types with their required fields
const contentTypeRequirements = new Map();

// Build content type requirements map
exportData.contentTypes.forEach(ct => {
  const requiredFields = ct.fields
    .filter(field => field.required)
    .map(field => field.id);
  contentTypeRequirements.set(ct.sys.id, {
    name: ct.name,
    requiredFields
  });
});

// Analyze entries
const draftEntries = [];
const invalidDrafts = [];
const orphanDrafts = [];
const validPublishedEntries = [];
const validDraftEntries = [];

exportData.entries.forEach(entry => {
  const isDraft = !entry.sys.publishedVersion ||
                  (entry.sys.version > entry.sys.publishedVersion + 1);

  const contentTypeId = entry.sys.contentType.sys.id;
  const contentTypeInfo = contentTypeRequirements.get(contentTypeId);

  if (isDraft) {
    draftEntries.push(entry);

    // Check if content type exists
    if (!contentTypeInfo) {
      orphanDrafts.push({
        id: entry.sys.id,
        contentType: contentTypeId,
        reason: 'Content type not found',
        entry: entry
      });
      return;
    }

    // Check for missing required fields
    const missingFields = [];
    contentTypeInfo.requiredFields.forEach(fieldId => {
      if (!entry.fields[fieldId] || Object.keys(entry.fields[fieldId]).length === 0) {
        missingFields.push(fieldId);
      }
    });

    if (missingFields.length > 0) {
      invalidDrafts.push({
        id: entry.sys.id,
        contentType: contentTypeId,
        contentTypeName: contentTypeInfo.name,
        missingFields,
        reason: `Missing required fields: ${missingFields.join(', ')}`,
        entry: entry
      });
    } else {
      validDraftEntries.push(entry);
    }
  } else {
    validPublishedEntries.push(entry);
  }
});

// Analyze assets
const draftAssets = [];
const invalidAssetDrafts = [];
const validPublishedAssets = [];
const validDraftAssets = [];

exportData.assets.forEach(asset => {
  const isDraft = !asset.sys.publishedVersion ||
                  (asset.sys.version > asset.sys.publishedVersion + 1);

  if (isDraft) {
    draftAssets.push(asset);

    // Check if asset has a file
    const hasFile = asset.fields.file && Object.keys(asset.fields.file).length > 0;

    if (!hasFile) {
      invalidAssetDrafts.push({
        id: asset.sys.id,
        reason: 'Missing file',
        asset: asset
      });
    } else {
      validDraftAssets.push(asset);
    }
  } else {
    validPublishedAssets.push(asset);
  }
});

// Generate report
const report = {
  summary: {
    totalEntries: exportData.entries.length,
    totalAssets: exportData.assets.length,
    draftEntries: draftEntries.length,
    invalidDrafts: invalidDrafts.length,
    orphanDrafts: orphanDrafts.length,
    validDraftEntries: validDraftEntries.length,
    validPublishedEntries: validPublishedEntries.length,
    draftAssets: draftAssets.length,
    invalidAssetDrafts: invalidAssetDrafts.length,
    validDraftAssets: validDraftAssets.length,
    validPublishedAssets: validPublishedAssets.length,
    totalToRemove: invalidDrafts.length + orphanDrafts.length + invalidAssetDrafts.length
  },
  invalidDrafts: invalidDrafts.map(d => ({
    id: d.id,
    contentType: d.contentType,
    contentTypeName: d.contentTypeName,
    missingFields: d.missingFields,
    reason: d.reason
  })),
  orphanDrafts: orphanDrafts.map(d => ({
    id: d.id,
    contentType: d.contentType,
    reason: d.reason
  })),
  invalidAssetDrafts: invalidAssetDrafts.map(d => ({
    id: d.id,
    reason: d.reason
  }))
};

// Print summary
console.log('📊 Analysis Summary:');
console.log('─'.repeat(60));
console.log(`Total Entries:                    ${report.summary.totalEntries}`);
console.log(`  ├─ Valid Published Entries:     ${report.summary.validPublishedEntries}`);
console.log(`  ├─ Valid Draft Entries:         ${report.summary.validDraftEntries}`);
console.log(`  ├─ Invalid Drafts:              ${report.summary.invalidDrafts} ⚠️`);
console.log(`  └─ Orphan Drafts:               ${report.summary.orphanDrafts} ⚠️`);
console.log();
console.log(`Total Assets:                     ${report.summary.totalAssets}`);
console.log(`  ├─ Valid Published Assets:      ${report.summary.validPublishedAssets}`);
console.log(`  ├─ Valid Draft Assets:          ${report.summary.validDraftAssets}`);
console.log(`  └─ Invalid Asset Drafts:        ${report.summary.invalidAssetDrafts} ⚠️`);
console.log();
console.log(`Total Items to Remove:            ${report.summary.totalToRemove} 🗑️`);
console.log('─'.repeat(60));

// Show details of invalid items
if (invalidDrafts.length > 0) {
  console.log('\n🔴 Invalid Draft Entries (missing required fields):');
  invalidDrafts.slice(0, 10).forEach(draft => {
    console.log(`  • ${draft.id} (${draft.contentTypeName}): ${draft.reason}`);
  });
  if (invalidDrafts.length > 10) {
    console.log(`  ... and ${invalidDrafts.length - 10} more`);
  }
}

if (orphanDrafts.length > 0) {
  console.log('\n🔴 Orphan Drafts (content type not found):');
  orphanDrafts.slice(0, 10).forEach(draft => {
    console.log(`  • ${draft.id} (${draft.contentType}): ${draft.reason}`);
  });
  if (orphanDrafts.length > 10) {
    console.log(`  ... and ${orphanDrafts.length - 10} more`);
  }
}

if (invalidAssetDrafts.length > 0) {
  console.log('\n🔴 Invalid Asset Drafts (missing file):');
  invalidAssetDrafts.slice(0, 10).forEach(draft => {
    console.log(`  • ${draft.id}: ${draft.reason}`);
  });
  if (invalidAssetDrafts.length > 10) {
    console.log(`  ... and ${invalidAssetDrafts.length - 10} more`);
  }
}

// Save report
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
console.log(`\n📝 Detailed report saved to: ${reportFile}`);

// Create cleaned export
const entriesToRemove = new Set([
  ...invalidDrafts.map(d => d.id),
  ...orphanDrafts.map(d => d.id)
]);

const assetsToRemove = new Set(invalidAssetDrafts.map(d => d.id));

const cleanedData = {
  ...exportData,
  entries: exportData.entries.filter(entry => !entriesToRemove.has(entry.sys.id)),
  assets: exportData.assets.filter(asset => !assetsToRemove.has(asset.sys.id))
};

// Also remove references to removed entries/assets from remaining entries
cleanedData.entries.forEach(entry => {
  Object.keys(entry.fields).forEach(fieldKey => {
    const field = entry.fields[fieldKey];
    Object.keys(field).forEach(locale => {
      const value = field[locale];

      // Handle Link fields
      if (value && typeof value === 'object' && value.sys && value.sys.type === 'Link') {
        const linkedId = value.sys.id;
        if ((value.sys.linkType === 'Entry' && entriesToRemove.has(linkedId)) ||
            (value.sys.linkType === 'Asset' && assetsToRemove.has(linkedId))) {
          delete field[locale];
        }
      }

      // Handle Array of Links
      if (Array.isArray(value)) {
        field[locale] = value.filter(item => {
          if (item && typeof item === 'object' && item.sys && item.sys.type === 'Link') {
            const linkedId = item.sys.id;
            return !((item.sys.linkType === 'Entry' && entriesToRemove.has(linkedId)) ||
                     (item.sys.linkType === 'Asset' && assetsToRemove.has(linkedId)));
          }
          return true;
        });
      }
    });
  });
});

fs.writeFileSync(outputFile, JSON.stringify(cleanedData, null, 2));
console.log(`✅ Cleaned export saved to: ${outputFile}`);
console.log(`\n💡 Original file size: ${(fs.statSync(exportFile).size / 1024 / 1024).toFixed(2)} MB`);
console.log(`💡 Cleaned file size:  ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);
console.log(`\n✨ Cleanup complete! You can now use the cleaned file for import.`);
