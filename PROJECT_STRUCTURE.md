# Project Structure

This document provides an overview of the Contentful Batch Migrator project structure.

```
contentful-batch-migrator/
├── bin/                          # Executable scripts
│   ├── setup.js                  # Interactive setup wizard
│   ├── split.js                  # Split exports into batches
│   ├── import.js                 # SDK-based import
│   ├── import-cli.js             # CLI-based import (recommended for assets)
│   ├── import-direct.js          # Direct import without batching
│   ├── validate.js               # Migration validation
│   ├── resume.js                 # Resume SDK import
│   ├── resume-cli.js             # Resume CLI import
│   ├── cascade-publish.js        # Smart dependency-aware publishing
│   ├── publish-all-drafts.js     # Brute force publishing
│   ├── publish-assets.js         # Publish draft assets
│   ├── tag-drafts.js             # Tag draft entries
│   ├── cleanup-drafts.js         # Remove invalid drafts
│   ├── clean-space.js            # Delete all content from space
│   ├── strip-validations.js      # Remove validations from export
│   ├── restore-validations.js    # Restore validations
│   ├── transform-to-uploadfrom.js# Transform assets to uploadFrom format
│   ├── test-import-cli.js        # Test single batch import
│   └── rateLimiter.js            # Rate limiting utility
│
├── config/                       # Configuration files
│   ├── README.md                 # Configuration documentation
│   ├── batch-config.example.json # Example batch configuration
│   ├── cascade-config.example.json # Example cascade config
│   ├── export-config.example.json # Example export config
│   └── import-config.example.json # Example import config
│
├── docs/                         # Documentation
│   ├── EXPORT-GUIDE.md           # Exporting from Contentful
│   ├── IMPORT-GUIDE.md           # Importing to Contentful
│   ├── TROUBLESHOOTING.md        # Common issues and solutions
│   └── RATE-LIMITING.md          # Rate limiting details
│
├── .env.example                  # Environment variables template
├── .gitignore                    # Git ignore rules
├── CHANGELOG.md                  # Version history and changes
├── CONTRIBUTING.md               # Contribution guidelines
├── LICENSE                       # MIT License
├── README.md                     # Main documentation
├── PROJECT_STRUCTURE.md          # This file
└── package.json                  # NPM package configuration

Generated during migration:
├── batches/                      # Split batches (created by split.js)
│   ├── batch-001/
│   ├── batch-002/
│   └── ...
├── contentful-export/            # Export data (created by export)
└── logs/                         # Import logs (created during import)
```

## Key Directories

### `/bin`
Contains all executable scripts for the migration process. Each script is a Node.js executable that can be run via npm scripts.

### `/config`
Centralized location for all configuration files. Contains example files (`.example.json`) that should be copied and configured with actual credentials.

### `/docs`
Detailed documentation guides for various migration scenarios and troubleshooting.

## Configuration Files

All configuration files should be placed in the `config/` directory:

- **batch-config.json**: Main configuration for batch splitting and importing
- **cascade-config.json**: Configuration for dependency-aware publishing
- **export-config.json**: Configuration for exporting from source space
- **import-config.json**: Configuration for direct import

## Generated Directories

These directories are created during the migration process and should not be committed to version control:

- **batches/**: Contains split export files
- **contentful-export/**: Contains exported content and assets
- **logs/**: Contains import logs and error reports

## Security

Never commit the following to version control:
- `config/*.json` (except `*.example.json`)
- `.env` files
- Exported content in `contentful-export/`
- Batch files in `batches/`
- Log files

The `.gitignore` file is configured to exclude these automatically.

## Getting Started

1. Copy example config files from `config/` directory
2. Edit config files with your Contentful credentials
3. Run `npm run setup` for interactive configuration
4. Follow the README Quick Start guide

For detailed information, see:
- [README.md](README.md) - Main documentation
- [config/README.md](config/README.md) - Configuration details
- [docs/IMPORT-GUIDE.md](docs/IMPORT-GUIDE.md) - Step-by-step import guide
