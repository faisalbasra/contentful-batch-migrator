# Changelog

All notable changes to the Contentful Batch Migrator will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-08

### Added
- Interactive setup wizard (`npm run setup`) for easy initialization
- Centralized configuration directory (`config/`)
- `.env.example` file for environment variable reference
- Configuration README in `config/` directory
- Enhanced help command with categorized output
- Backward compatibility for config file locations
- Comprehensive .gitignore for better security

### Changed
- **BREAKING**: Configuration files moved from root to `config/` directory
  - `batch-config.json` → `config/batch-config.json`
  - `cascade-config.json` → `config/cascade-config.json`
  - Created `config/export-config.example.json`
  - Created `config/import-config.example.json`
- Updated all scripts to check `config/` directory first (with fallback to root)
- Improved README with clearer Quick Start guide
- Enhanced package.json metadata and scripts organization

### Removed
- Temporary test files and cleanup scripts from root
- Sensitive configuration files from version control
- Temporary export summaries and state files

### Security
- Added config/*.json to .gitignore (excluding *.example.json)
- Removed hardcoded credentials from tracked files
- Added .env files to .gitignore

### Migration Guide (for existing users)

If you have an existing setup:

1. Create the config directory:
   ```bash
   mkdir -p config
   ```

2. Move your existing config files:
   ```bash
   mv batch-config.json config/
   mv cascade-config.json config/
   ```

3. Or continue using config files in the root directory (backward compatible)

All scripts now check both locations, preferring `config/` directory.

## [0.9.0] - Previous Version

### Features
- Batch processing for large Contentful migrations
- Rate limiting and retry logic
- Multiple publishing strategies
- Draft cleanup and validation tools
- Asset and entry migration support
- State management and resume capability
