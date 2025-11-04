#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the fixed transformed export
const exportPath = './contentful-export/exported-space-uploadfrom-fixed.json';
const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf8'));

console.log('📦 Creating minimal test export with 1 asset...\n');

// Get the first asset
const testAsset = exportData.assets[0];

console.log('Selected asset:', {
  id: testAsset.sys.id,
  fileName: testAsset.fields?.file?.['nb-NO']?.fileName,
  hasUrl: !!testAsset.fields?.file?.['nb-NO']?.url,
  hasUploadFrom: !!testAsset.fields?.file?.['nb-NO']?.uploadFrom
});

// Inspect the asset structure
console.log('\nAsset file structure:');
console.log(JSON.stringify(testAsset.fields.file['nb-NO'], null, 2));

// Create minimal export
const minimalExport = {
  contentTypes: exportData.contentTypes,  // Keep all content types
  entries: [],  // No entries for this test
  assets: [testAsset],
  locales: exportData.locales,
  tags: exportData.tags,
  editorInterfaces: exportData.editorInterfaces,
  webhooks: []
};

// Write test export
const testExportPath = './test-single-asset-export.json';
fs.writeFileSync(testExportPath, JSON.stringify(minimalExport, null, 2));

console.log('\n✅ Test export created:', testExportPath);
console.log('📊 Contents:');
console.log('   - Content Types:', minimalExport.contentTypes.length);
console.log('   - Assets:', minimalExport.assets.length);
console.log('   - Entries:', minimalExport.entries.length);
console.log('   - Locales:', minimalExport.locales.length);
console.log('   - Tags:', minimalExport.tags.length);
