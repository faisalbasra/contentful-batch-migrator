#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🚀 Contentful Batch Migrator - Setup Wizard\n');
console.log('This wizard will help you set up your configuration files.\n');

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function setup() {
  try {
    // Check if config directory exists
    const configDir = path.join(process.cwd(), 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    console.log('📋 Configuration Setup\n');
    console.log('Choose setup mode:');
    console.log('  1. Quick setup (copy example files)');
    console.log('  2. Interactive setup (guided configuration)');
    console.log('  3. Manual setup (I\'ll do it myself)\n');

    const mode = await question('Enter your choice (1-3): ');

    if (mode === '3') {
      console.log('\n📖 Manual Setup Instructions:');
      console.log('  1. Copy example files from config/ directory');
      console.log('  2. Edit each config file with your credentials');
      console.log('  3. Run "npm run split" to start migration\n');
      console.log('Example files:');
      console.log('  - config/batch-config.example.json');
      console.log('  - config/cascade-config.example.json');
      console.log('  - config/export-config.example.json');
      console.log('  - config/import-config.example.json\n');
      rl.close();
      return;
    }

    if (mode === '1' || mode === '2') {
      // Copy example files
      console.log('\n📝 Creating configuration files...\n');

      const configFiles = [
        'batch-config.json',
        'cascade-config.json',
        'export-config.json',
        'import-config.json'
      ];

      for (const file of configFiles) {
        const examplePath = path.join(configDir, file.replace('.json', '.example.json'));
        const targetPath = path.join(configDir, file);

        if (fs.existsSync(targetPath)) {
          const overwrite = await question(`${file} already exists. Overwrite? (y/N): `);
          if (overwrite.toLowerCase() !== 'y') {
            console.log(`Skipping ${file}`);
            continue;
          }
        }

        fs.copyFileSync(examplePath, targetPath);
        console.log(`✅ Created ${file}`);
      }

      if (mode === '2') {
        console.log('\n🔧 Interactive Configuration\n');

        // Batch config
        console.log('Let\'s configure your batch migration settings:\n');

        const sourceSpaceId = await question('Source Space ID: ');
        const targetSpaceId = await question('Target Space ID: ');
        const managementToken = await question('Management Token: ');
        const batchSize = await question('Batch Size (default 400): ') || '400';
        const region = await question('Region (us/eu, default: us): ') || 'us';

        const host = region === 'eu' ? 'api.eu.contentful.com' : 'api.contentful.com';

        // Update batch-config.json
        const batchConfigPath = path.join(configDir, 'batch-config.json');
        const batchConfig = JSON.parse(fs.readFileSync(batchConfigPath, 'utf8'));
        batchConfig.batchSize = parseInt(batchSize);
        batchConfig.targetSpace.spaceId = targetSpaceId;
        batchConfig.targetSpace.managementToken = managementToken;
        batchConfig.targetSpace.host = host;
        fs.writeFileSync(batchConfigPath, JSON.stringify(batchConfig, null, 2));

        // Update cascade-config.json
        const cascadeConfigPath = path.join(configDir, 'cascade-config.json');
        const cascadeConfig = JSON.parse(fs.readFileSync(cascadeConfigPath, 'utf8'));
        cascadeConfig.spaceId = targetSpaceId;
        cascadeConfig.managementToken = managementToken;
        cascadeConfig.host = host;
        fs.writeFileSync(cascadeConfigPath, JSON.stringify(cascadeConfig, null, 2));

        // Update export-config.json
        const exportConfigPath = path.join(configDir, 'export-config.json');
        const exportConfig = JSON.parse(fs.readFileSync(exportConfigPath, 'utf8'));
        exportConfig.spaceId = sourceSpaceId;
        exportConfig.managementToken = managementToken;
        exportConfig.host = host;
        fs.writeFileSync(exportConfigPath, JSON.stringify(exportConfig, null, 2));

        // Update import-config.json
        const importConfigPath = path.join(configDir, 'import-config.json');
        const importConfig = JSON.parse(fs.readFileSync(importConfigPath, 'utf8'));
        importConfig.spaceId = targetSpaceId;
        importConfig.managementToken = managementToken;
        importConfig.host = host;
        fs.writeFileSync(importConfigPath, JSON.stringify(importConfig, null, 2));

        console.log('\n✅ Configuration files updated with your settings!');
      }

      console.log('\n✨ Setup complete!\n');
      console.log('📖 Next Steps:');
      console.log('  1. Review and edit config files if needed (in config/ directory)');
      console.log('  2. Export your source space (if not done already)');
      console.log('  3. Run "npm run split" to split the export');
      console.log('  4. Run "npm run import" to start migration\n');
      console.log('📚 For detailed guides, see:');
      console.log('  - docs/EXPORT-GUIDE.md');
      console.log('  - docs/IMPORT-GUIDE.md\n');
    } else {
      console.log('Invalid choice. Please run the setup again.\n');
    }

    rl.close();
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    rl.close();
    process.exit(1);
  }
}

setup();
