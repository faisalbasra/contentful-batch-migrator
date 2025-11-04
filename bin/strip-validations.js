#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function stripValidations() {
  console.log('🔧 Contentful Validation Stripper\n');

  // Read config
  const configPath = path.join(process.cwd(), 'batch-config.json');

  if (!fs.existsSync(configPath)) {
    console.error('❌ batch-config.json not found!');
    console.log('Please create batch-config.json from batch-config.example.json');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const sourceFile = config.sourceFile;

  if (!fs.existsSync(sourceFile)) {
    console.error(`❌ Source file not found: ${sourceFile}`);
    console.log('Please ensure your export file exists');
    process.exit(1);
  }

  console.log(`📂 Reading: ${sourceFile}`);
  const exportData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));

  if (!exportData.contentTypes || exportData.contentTypes.length === 0) {
    console.log('⚠️  No content types found in export file');
    process.exit(0);
  }

  console.log(`📋 Found ${exportData.contentTypes.length} content types\n`);
  console.log('Stripping validations...\n');

  let totalValidations = 0;
  let totalFields = 0;
  const validationsBackup = {
    sourceFile,
    timestamp: new Date().toISOString(),
    contentTypes: []
  };

  // Process each content type
  exportData.contentTypes = exportData.contentTypes.map(ct => {
    const modifiedCt = { ...ct };
    let ctValidationCount = 0;

    const fieldBackups = [];

    modifiedCt.fields = ct.fields.map(field => {
      const modifiedField = { ...field };
      const fieldBackup = {
        id: field.id,
        required: field.required || false,
        validations: [],
        items: null
      };

      // Count and remove field-level validations
      if (field.validations && field.validations.length > 0) {
        ctValidationCount += field.validations.length;
        totalValidations += field.validations.length;
        fieldBackup.validations = [...field.validations];
        console.log(`  ${ct.sys.id}.${field.id}: Removed ${field.validations.length} validation(s)`);
      }

      modifiedField.validations = [];

      // Remove required constraint
      if (field.required) {
        console.log(`  ${ct.sys.id}.${field.id}: Removed 'required' constraint`);
        ctValidationCount++;
        totalValidations++;
      }
      modifiedField.required = false;

      // Remove item validations for array/link fields
      if (field.items && field.items.validations && field.items.validations.length > 0) {
        ctValidationCount += field.items.validations.length;
        totalValidations += field.items.validations.length;
        fieldBackup.items = { validations: [...field.items.validations] };
        console.log(`  ${ct.sys.id}.${field.id}.items: Removed ${field.items.validations.length} validation(s)`);

        modifiedField.items = { ...field.items };
        modifiedField.items.validations = [];
      }

      totalFields++;
      fieldBackups.push(fieldBackup);

      return modifiedField;
    });

    if (ctValidationCount > 0) {
      console.log(`  ✓ ${ct.name} (${ct.sys.id}): ${ctValidationCount} total validations removed\n`);
    }

    // Save to backup
    validationsBackup.contentTypes.push({
      id: ct.sys.id,
      name: ct.name,
      fields: fieldBackups
    });

    return modifiedCt;
  });

  // Save modified export to new file
  const outputFile = sourceFile.replace('.json', '-no-validations.json');
  fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2));

  // Save validations backup
  const backupFile = path.join(process.cwd(), 'validations-backup.json');
  fs.writeFileSync(backupFile, JSON.stringify(validationsBackup, null, 2));

  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`✅ Successfully processed ${exportData.contentTypes.length} content types`);
  console.log(`📊 Removed ${totalValidations} validations from ${totalFields} fields`);
  console.log(`\n📄 Files created:`);
  console.log(`   • ${outputFile}`);
  console.log(`   • ${backupFile}`);

  console.log(`\n📋 Next steps:`);
  console.log(`   1. Update batch-config.json "sourceFile" to:`);
  console.log(`      "${outputFile}"`);
  console.log(`   2. Run: npm run split`);
  console.log(`   3. Run: npm run import`);
  console.log(`   4. After successful migration, run: npm run restore-validations`);
  console.log(`\n💡 Tip: Keep validations-backup.json safe - you'll need it to restore validations!`);
}

// Run the function
try {
  stripValidations();
} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
