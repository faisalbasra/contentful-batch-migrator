#!/usr/bin/env node

const contentful = require('contentful-management');
const fs = require('fs');
const path = require('path');

async function restoreValidations() {
  console.log('🔧 Contentful Validation Restorer\n');

  // Read config
  const configPath = path.join(process.cwd(), 'batch-config.json');

  if (!fs.existsSync(configPath)) {
    console.error('❌ batch-config.json not found!');
    console.log('Please create batch-config.json from batch-config.example.json');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  // Read backup file
  const backupFile = path.join(process.cwd(), 'validations-backup.json');

  if (!fs.existsSync(backupFile)) {
    console.error('❌ validations-backup.json not found!');
    console.log('\nThis file should have been created by: npm run strip-validations');
    console.log('Cannot restore validations without the backup file.');
    process.exit(1);
  }

  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

  console.log(`📂 Backup file: ${backupFile}`);
  console.log(`📅 Created: ${backup.timestamp}`);
  console.log(`📋 Content types to restore: ${backup.contentTypes.length}\n`);

  const { spaceId, environmentId, managementToken, host } = config.targetSpace;

  console.log(`🎯 Target Space: ${spaceId}`);
  console.log(`🌍 Environment: ${environmentId}`);
  console.log(`🌐 Host: ${host || 'api.contentful.com'}\n`);

  // Confirm before proceeding
  console.log('⚠️  This will update content types in your target space.');
  console.log('   Validations will be restored to all content types.\n');

  // Connect to Contentful
  console.log('🔗 Connecting to Contentful...');
  const client = contentful.createClient({
    accessToken: managementToken,
    host: host || 'api.contentful.com'
  });

  const space = await client.getSpace(spaceId);
  const environment = await space.getEnvironment(environmentId);
  console.log('✅ Connected\n');

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let totalValidationsRestored = 0;

  console.log('Restoring validations...\n');

  for (const ctBackup of backup.contentTypes) {
    try {
      console.log(`Processing: ${ctBackup.name} (${ctBackup.id})`);

      // Get current content type from target space
      const contentType = await environment.getContentType(ctBackup.id);

      // Restore validations to fields
      let fieldUpdated = false;
      let ctValidationCount = 0;

      contentType.fields = contentType.fields.map(field => {
        const backupField = ctBackup.fields.find(f => f.id === field.id);

        if (!backupField) {
          return field; // Field not in backup, keep as is
        }

        // Restore required constraint
        if (backupField.required === true) {
          console.log(`  ✓ ${field.id}: Restoring 'required' constraint`);
          field.required = true;
          ctValidationCount++;
          fieldUpdated = true;
        }

        // Restore field-level validations
        if (backupField.validations && backupField.validations.length > 0) {
          console.log(`  ✓ ${field.id}: Restoring ${backupField.validations.length} validation(s)`);
          field.validations = backupField.validations;
          ctValidationCount += backupField.validations.length;
          fieldUpdated = true;
        }

        // Restore item validations for array/link fields
        if (backupField.items && backupField.items.validations && backupField.items.validations.length > 0) {
          console.log(`  ✓ ${field.id}.items: Restoring ${backupField.items.validations.length} validation(s)`);
          field.items = field.items || {};
          field.items.validations = backupField.items.validations;
          ctValidationCount += backupField.items.validations.length;
          fieldUpdated = true;
        }

        return field;
      });

      if (fieldUpdated) {
        // Update the content type
        await contentType.update();
        updatedCount++;
        totalValidationsRestored += ctValidationCount;
        console.log(`  ✅ Updated (${ctValidationCount} validations restored)\n`);
      } else {
        skippedCount++;
        console.log(`  ⊘ No validations to restore\n`);
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      console.error(`  ❌ Error: ${error.message}\n`);
      errorCount++;
    }
  }

  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`✅ Successfully restored validations to ${updatedCount} content type(s)`);
  console.log(`📊 Total validations restored: ${totalValidationsRestored}`);
  if (skippedCount > 0) {
    console.log(`⊘  Skipped ${skippedCount} content type(s) (no validations to restore)`);
  }
  if (errorCount > 0) {
    console.log(`❌ ${errorCount} content type(s) had errors`);
  }

  console.log('\n🎉 Validation restoration complete!');
  console.log('\n💡 Next steps:');
  console.log('   • Test your content types to ensure validations work as expected');
  console.log('   • Try creating/editing entries to verify validation rules');
  console.log('   • Keep validations-backup.json as a backup');
}

// Run the function
restoreValidations().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
