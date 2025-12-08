# Configuration Files

This directory contains configuration files for the Contentful Batch Migrator.

## Quick Setup

1. Copy the example configuration files:
   ```bash
   cp config/batch-config.example.json config/batch-config.json
   cp config/cascade-config.example.json config/cascade-config.json
   cp config/export-config.example.json config/export-config.json
   cp config/import-config.example.json config/import-config.json
   ```

2. Edit each configuration file with your actual Contentful credentials and settings.

## Configuration Files

### batch-config.json
Main configuration for batch splitting and importing. Used by most migration scripts.

**Key settings:**
- `batchSize`: Number of assets per batch (default: 400)
- `sourceFile`: Path to exported Contentful space JSON
- `targetSpace`: Target space credentials
- `rateLimits`: Rate limiting configuration

### cascade-config.json
Configuration for cascade publishing (resolving entry dependencies).

**Key settings:**
- `spaceId`: Target space ID
- `environmentId`: Target environment
- `managementToken`: Contentful management token

### export-config.json
Configuration for exporting from a Contentful space.

**Key settings:**
- `spaceId`: Source space ID
- `managementToken`: Management token for source space
- `exportDir`: Directory to save export
- `includeDrafts`: Whether to include draft entries
- `downloadAssets`: Whether to download assets

### import-config.json
Configuration for direct import (without batching).

**Key settings:**
- `spaceId`: Target space ID
- `managementToken`: Management token for target space
- `contentFile`: Path to import file
- `uploadAssets`: Whether to upload assets

## Security Notes

⚠️ **IMPORTANT**: These configuration files contain sensitive credentials!

- Never commit files containing actual credentials to version control
- Only commit `.example.json` files
- The `.gitignore` file is configured to exclude actual config files
- Consider using environment variables for sensitive data

## Backward Compatibility

All scripts check both `config/` directory and root directory for configuration files, preferring the `config/` directory. This ensures backward compatibility with existing setups.
