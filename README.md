# Contentful Batch Migrator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

> A robust solution for migrating large Contentful spaces without hitting rate limits.

Migrate thousands of assets and entries between Contentful spaces by intelligently splitting them into manageable batches. Perfect for moving content between regions, environments, or organizations.

## 🚀 Features

- **Batch Processing**: Automatically split large exports into configurable batch sizes
- **Client-Side Rate Limiting**: Token bucket algorithm enforces API rate limits (10 req/sec, 36K req/hour)
- **Draft Cleanup**: Identify and remove invalid/orphan draft entries before migration
- **Smart Publishing**: Multiple publishing strategies for handling circular dependencies
- **Tag Management**: Tag and filter draft entries for selective publishing
- **Brute Force Publishing**: Repeatedly publish drafts until circular dependencies resolve
- **Smart Relationships**: Maintains asset-entry relationships across batches
- **Resume Support**: Automatically resume failed or interrupted migrations
- **Progress Tracking**: Detailed logs and state management
- **Validation**: Post-migration validation to ensure data integrity
- **Retry Logic**: Configurable retry attempts with exponential backoff

## 📊 Use Cases

✅ Migrating 1,000+ assets and entries
✅ Moving content between Contentful regions (US → EU)
✅ Copying content between organizations
✅ Environment cloning with large datasets
✅ Avoiding "Too Many Requests" (429) errors

## 🎯 Problem & Solution

### The Problem

Importing large Contentful exports (4,000+ assets, 10,000+ entries) directly causes:
- Rate limiting errors (429 Too Many Requests)
- Failed imports
- Lost time and frustration

### The Solution

This tool:
1. **Splits** your export into batches (500-700 assets each)
2. **Maintains** relationships between assets and entries
3. **Imports** batches sequentially with delays
4. **Retries** failed batches automatically
5. **Validates** migration success

## 📦 Installation

### Prerequisites

- Node.js >= 18.0.0 (LTS recommended)
- npm or yarn
- Contentful Management Token (CMA)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/faisalbasra/contentful-batch-migrator.git
cd contentful-batch-migrator

# 2. Install dependencies
npm install

# 3. Set up configuration
npm run setup   # Interactive setup wizard (or manual setup below)

# Manual setup (alternative to setup wizard):
cp config/batch-config.example.json config/batch-config.json
cp config/cascade-config.example.json config/cascade-config.json
# Edit config files with your Contentful credentials

# 4. Run the migration
npm run split    # Step 1: Split export into batches
npm run import   # Step 2: Import batches sequentially
npm run validate # Step 3: Validate migration success

# 5. Publish content (if needed)
npm run cascade-publish  # Smart dependency-aware publishing
# OR
npm run publish-all      # Brute force publishing (for circular dependencies)
```

**First time user?** Check out the [Getting Started Guide](docs/IMPORT-GUIDE.md) for a detailed walkthrough.

See all available commands:
```bash
npm run help
```

### 📚 Available Commands

```bash
npm run help                          # Show all available commands

# Migration Commands
npm run cleanup-drafts                # Analyze and remove invalid drafts
npm run split                         # Split export into batches
npm run import                        # Import all batches
npm run import:cli                    # Import using CLI (recommended for assets)
npm run validate                      # Validate migration
npm run resume                        # Resume failed import
npm run resume:cli                    # Resume failed CLI import

# Publishing Commands
npm run publish-assets                # Publish all draft assets
npm run publish-assets:dry-run        # Preview asset publishing
npm run cascade-publish               # Smart publish with dependency resolution
npm run cascade-publish:dry-run       # Preview cascade publish
npm run publish-all                   # Brute force publish all drafts
npm run publish-all:dry-run           # Preview brute force publish
npm run tag-drafts <tag> [opts]       # Tag/untag draft entries

# Cleanup Commands
npm run clean                         # Remove batches directory
npm run clean:all                     # Remove batches and export
npm run clean-space [opts]            # Delete entries/content types/assets from space
npm run clean-space:dry-run           # Preview space cleanup
```

## 🔧 Configuration

Edit `batch-config.json`:

```json
{
  "batchSize": 400,
  "sourceFile": "./contentful-export/exported-space.json",
  "sourceAssetsDir": "./contentful-export",
  "outputDir": "./batches",
  "targetSpace": {
    "spaceId": "YOUR_TARGET_SPACE_ID",
    "environmentId": "master",
    "managementToken": "YOUR_CMA_TOKEN",
    "host": "api.contentful.com"
  },
  "importOptions": {
    "uploadAssets": true,
    "skipContentPublishing": false,
    "delayBetweenBatches": 180000,
    "maxRetries": 3,
    "retryDelay": 5000
  },
  "rateLimits": {
    "enabled": true,
    "requestsPerSecond": 10,
    "requestsPerHour": 36000,
    "verbose": true
  }
}
```

### Configuration Options

| Option | Description | Default | Recommended |
|--------|-------------|---------|-------------|
| `batchSize` | Assets per batch | 400 | 400-700 |
| `delayBetweenBatches` | Wait time between batches (ms) | 180000 | 180000-300000 |
| `maxRetries` | Retry attempts per batch | 3 | 3-5 |
| `retryDelay` | Initial retry delay (ms) | 5000 | 5000-10000 |
| `rateLimits.enabled` | Enable client-side rate limiting | true | true |
| `rateLimits.requestsPerSecond` | Max requests per second | 10 | 10 |
| `rateLimits.requestsPerHour` | Max requests per hour | 36000 | 36000 |

📚 **Rate limiting details**: [docs/RATE-LIMITING.md](docs/RATE-LIMITING.md)

## 📖 Usage

### Step 1: Export from Source Space

First, export your content from the source Contentful space:

```bash
npx contentful-export \
  --space-id SOURCE_SPACE_ID \
  --management-token SOURCE_TOKEN \
  --export-dir ./contentful-export \
  --download-assets
```

📚 **Detailed guide**: [docs/EXPORT-GUIDE.md](docs/EXPORT-GUIDE.md)

### Step 2: Clean Invalid Drafts (Optional but Recommended)

If your export contains draft entries with missing required fields or orphan drafts, clean them before importing:

```bash
npm run cleanup-drafts
```

**Output:**
```
📊 Analysis Summary:
─────────────────────────────────────────────────────────
Total Entries:                    11985
  ├─ Valid Published Entries:     11850
  ├─ Valid Draft Entries:         100
  ├─ Invalid Drafts:              25 ⚠️
  └─ Orphan Drafts:               10 ⚠️

Total Assets:                     4126
  ├─ Valid Published Assets:      4100
  ├─ Valid Draft Assets:          20
  └─ Invalid Asset Drafts:        6 ⚠️

Total Items to Remove:            41 🗑️
```

**What it does:**
- Identifies draft entries with missing required fields
- Finds orphan drafts (content type doesn't exist)
- Detects invalid asset drafts (missing files)
- Creates `draft-cleanup-report.json` with detailed analysis
- Generates cleaned export: `contentful-export/exported-space-cleaned.json`

**Next:** Update your `batch-config.json` to use the cleaned file:
```json
{
  "sourceFile": "./contentful-export/exported-space-cleaned.json"
}
```

### Step 3: Split the Export

Split your large export into batches:

```bash
npm run split
```

**Output:**
```
🚀 Starting Contentful Export Splitter...
📊 Source data summary:
  - Assets: 4126
  - Entries: 11985
📦 Created 7 batches
✅ Splitting completed successfully!
```

Creates `batches/` directory with subdirectories for each batch.

### Step 4: Import Batches

Import all batches sequentially:

```bash
npm run import
```

**Features:**
- Automatically imports content model in first batch
- Waits between batches (prevents rate limiting)
- Retries failed batches
- Saves progress state

**Expected time**: 3-5 hours for ~4,000 assets (with rate limiting enabled)

### Step 5: Validate Migration

Verify the migration was successful:

```bash
npm run validate
```

**Output:**
```
✅ Content Types         Source:     60 | Target:     60 | Diff: 0
✅ Entries               Source:  11985 | Target:  11985 | Diff: 0
✅ Assets                Source:   4126 | Target:   4126 | Diff: 0

🎉 Validation passed! All data migrated successfully.
```

📚 **Detailed guide**: [docs/IMPORT-GUIDE.md](docs/IMPORT-GUIDE.md)

### Step 6: Publish Draft Entries

After importing with `skipContentPublishing: true`, you need to publish draft entries. Choose the appropriate publishing strategy based on your needs:

#### Strategy 1: Cascade Publish (Recommended for Clean Dependencies)

Publishes entries in dependency order (entries with no dependencies first, then their dependents):

```bash
# Preview first
npm run cascade-publish:dry-run

# Publish
npm run cascade-publish

# Skip tagged entries
npm run cascade-publish -- --skip-tag skip-publish
```

**Features:**
- ✅ Analyzes entry dependencies
- ✅ Publishes in waves (depth-first)
- ✅ Handles circular references gracefully
- ✅ Can skip tagged entries with --skip-tag
- ⚠️ May skip entries with circular dependencies

**Output:**
```
Analyzing dependencies...
Found 11985 draft entries
Publishing wave 1 (depth 0): 5000 entries
Publishing wave 2 (depth 1): 4000 entries
Publishing wave 3 (depth 2): 2500 entries
⚠️ Skipped 485 entries with circular dependencies
```

#### Strategy 2: Brute Force Publish (For Circular Dependencies)

Attempts to publish all drafts without analyzing dependencies. Run repeatedly until all are published:

```bash
# Preview first
npm run publish-all:dry-run

# Run repeatedly until complete
npm run publish-all
npm run publish-all  # Run again
npm run publish-all  # Keep running until failures reach 0
```

**Features:**
- ✅ No dependency analysis required
- ✅ Handles circular dependencies through repetition
- ✅ Each run publishes what it can
- ✅ Failed entries are saved to `failed-entries.json`

**Output:**
```
Total draft entries: 4000
✅ Successfully published: 1200
❌ Failed to publish: 2800
⏭️ Skipped (already published): 0

💡 TIP: Run this script again to retry failed entries.
```

**How it works:**
1. **First run**: Publishes entries with no unpublished dependencies (~30%)
2. **Second run**: Publishes entries whose dependencies were published in run 1 (~40%)
3. **Third run**: More entries get published (~20%)
4. **Continue**: Until all entries are published or failures stop decreasing

#### Strategy 3: Selective Publishing with Tags

Tag problematic entries and skip them during publishing. Both `cascade-publish` and `publish-all` support `--skip-tag`:

```bash
# 1. Tag all current drafts with 'skip-publish'
npm run tag-drafts skip-publish -- --dry-run  # Preview
npm run tag-drafts skip-publish               # Tag them

# 2a. Use cascade publish (skipping tagged)
npm run cascade-publish -- --skip-tag skip-publish

# OR

# 2b. Use brute force publish (skipping tagged)
npm run publish-all -- --skip-tag skip-publish

# 3. Run repeatedly if using brute force
npm run publish-all -- --skip-tag skip-publish

# 4. When ready, untag and publish the remaining ones
npm run tag-drafts skip-publish -- --remove   # Remove tag
npm run publish-all                            # Publish remaining
```

**Tag Management Commands:**
```bash
# Tag draft entries
npm run tag-drafts <tag-name>                    # Tag all drafts
npm run tag-drafts <tag-name> -- --dry-run       # Preview tagging
npm run tag-drafts <tag-name> -- --remove        # Remove tag from drafts

# Publishing with tag filtering
npm run cascade-publish -- --skip-tag <tag-name>  # Smart publish, skip tagged
npm run publish-all -- --skip-tag <tag-name>      # Brute force, skip tagged

# Example: Tag with 'circular-dep'
npm run tag-drafts circular-dep
npm run cascade-publish -- --skip-tag circular-dep
# Or use: npm run publish-all -- --skip-tag circular-dep
```

**Use cases:**
- Mark entries known to have circular dependencies
- Skip problematic entries temporarily
- Publish clean entries first, handle complex ones later
- Test publishing on a subset of entries
- Combine with cascade for efficient dependency-aware publishing

#### Strategy 4: Asset Publishing First

Publish all assets before entries (assets have no dependencies):

```bash
# Preview
npm run publish-assets:dry-run

# Publish all draft assets
npm run publish-assets
```

Then proceed with entry publishing using one of the strategies above.

#### Choosing the Right Strategy

| Scenario | Recommended Strategy |
|----------|---------------------|
| Clean migration, no circular deps | **Cascade Publish** |
| Known circular dependencies (100-1000 entries) | **Brute Force Publish** |
| Many circular dependencies (1000+ entries) | **Selective with Tags** (Cascade or Brute Force with `--skip-tag`) |
| Want to skip problematic entries | **Cascade** or **Brute Force** with `--skip-tag` |
| Assets only | **Asset Publishing** |
| Mixed approach | **Assets** → **Cascade** (skip tagged) → **Brute Force** for remaining |

#### Publishing Configuration

Create `cascade-config.json` for publishing scripts:

```json
{
  "spaceId": "your-space-id",
  "environmentId": "master",
  "managementToken": "CFPAT-your-management-token",
  "host": "api.contentful.com"
}
```

**Note**: Use `api.eu.contentful.com` for EU spaces.

### Step 7: Space Cleanup (Optional)

Sometimes you need to clean up a space before re-importing or to start fresh. Use the built-in `clean-space` script for selective cleanup.

#### Cleanup Scenarios

##### Scenario 1: Clean Entries Only (Keep Content Types & Assets)

Remove all entries but keep content types and assets:

```bash
# Preview first
npm run clean-space:dry-run

# Execute cleanup
npm run clean-space
```

**What gets deleted:**
- ✅ All entries (published + draft)

**What stays:**
- ❌ Content types (kept)
- ❌ Assets (kept)

**Use case:** Remove all content but keep the content model and assets for fresh import.

##### Scenario 2: Clean Entries + Content Types (Keep Assets)

Remove entries and content types, but keep assets:

```bash
# Preview first
npm run clean-space -- --dry-run --content-types

# Execute cleanup
npm run clean-space -- --content-types
```

**What gets deleted:**
- ✅ All entries
- ✅ All content types

**What stays:**
- ❌ Assets (kept)

**Use case:** When you want to re-import content model and entries but keep existing assets. **Perfect for your EU space cleanup!**

##### Scenario 3: Complete Cleanup (Delete Everything)

Remove everything - entries, content types, AND assets:

```bash
# Preview first
npm run clean-space -- --dry-run --content-types --assets

# Execute cleanup
npm run clean-space -- --content-types --assets
```

**What gets deleted:**
- ✅ All entries
- ✅ All content types
- ✅ All assets

**Use case:** Complete fresh start.

#### Command Options

```bash
npm run clean-space [options]

Options:
  --dry-run           Preview what will be deleted (no actual deletion)
  --content-types     Delete content types after entries
  --assets            Delete assets as well
  --batch-size <n>    Number of concurrent operations (default: 10)
```

#### Features

- ✅ **Supports EU & US endpoints** - Reads from `cascade-config.json`
- ✅ **Confirmation prompt** - Shows space details and asks for Y/N confirmation
- ✅ **Dry-run mode** - Preview before deleting
- ✅ **Rate limiting** - 10 req/sec to respect API limits
- ✅ **Auto-unpublish** - Unpublishes before deletion
- ✅ **Progress tracking** - Real-time progress updates
- ✅ **Safe by default** - Only deletes entries unless flags are provided

#### Example Workflows

##### Workflow 1: Re-import After Failed Migration

```bash
# 1. Clean entries + content types (keep assets)
npm run clean-space -- --content-types

# 2. Re-import
npm run import

# 3. Publish
npm run publish-assets
npm run cascade-publish
```

##### Workflow 2: Clean Content Only, Keep Model

```bash
# 1. Clean only entries (keep model + assets)
npm run clean-space

# 2. Import new content
npm run import
```

##### Workflow 3: Complete Fresh Start

```bash
# 1. Backup first (optional but recommended)
npx contentful-export \
  --space-id YOUR_SPACE_ID \
  --management-token YOUR_TOKEN \
  --export-dir ./backup

# 2. Clean everything
npm run clean-space -- --content-types --assets

# 3. Import from scratch
npm run import
```

#### ⚠️ Important Warnings

1. **DESTRUCTIVE OPERATION** - Cannot be undone
2. **Test on staging first** - Always test cleanup on a non-production environment
3. **Backup before cleanup** - Create an export before running cleanup
4. **Check cascade-config.json** - Ensure it points to the correct space (EU or US)
5. **Use dry-run first** - Always preview with `--dry-run` before actual deletion
6. **Deletes published content** - This removes both draft AND published content

#### Configuration

The script uses `cascade-config.json` for space credentials:

```json
{
  "spaceId": "69zmfo9ko3qk",
  "environmentId": "master",
  "managementToken": "CFPAT-your-management-token",
  "host": "api.eu.contentful.com"
}
```

Make sure this file points to the correct space before running cleanup!

#### Confirmation Prompt

When running cleanup (not in dry-run mode), you'll see space details and be asked to confirm:

```
🔗 Connecting to Contentful...
✅ Connected

📋 TARGET SPACE DETAILS:
================================================================================
Organization: Your Organization Name
Space Name:   Your Space Name
Space ID:     69zmfo9ko3qk
Environment:  master
API Host:     api.eu.contentful.com
================================================================================

⚠️  WHAT WILL BE DELETED:
================================================================================
Mode: LIVE CLEANUP

  ✅ All entries (published + draft)
  ✅ Content types (will be deleted)
  ❌ Assets (will be kept)
================================================================================

⚠️  WARNING: This operation is DESTRUCTIVE and cannot be undone!
⚠️  Make sure you have a backup before proceeding.

Are you sure you want to proceed? (Y/N):
```

Type **Y** or **yes** to proceed, or **N** to cancel.

#### Your Specific Use Case (EU Space)

To clean your EU space (entries + content types, keep assets):

```bash
# 1. Verify cascade-config.json points to EU space
cat cascade-config.json

# 2. Preview what will be deleted (no confirmation needed)
npm run clean-space -- --dry-run --content-types

# 3. Execute cleanup (will ask for confirmation)
npm run clean-space -- --content-types
# You'll see space details and must type Y to proceed

# 4. Re-import
npm run import
```

### Resume Failed Import

If import fails or is interrupted:

```bash
npm run resume
```

Automatically detects where to resume and continues.

## 📁 Project Structure

```
contentful-batch-migrator/
├── bin/                           # Executable scripts
│   ├── rateLimiter.js            # Token bucket rate limiter
│   ├── cleanup-drafts.js         # Remove invalid/orphan drafts
│   ├── clean-space.js            # Delete entries/content types/assets from space
│   ├── split.js                  # Split large exports into batches
│   ├── import.js                 # Import batches with rate limiting
│   ├── import-cli.js             # Import batches using Contentful CLI
│   ├── import-direct.js          # Direct import without batching
│   ├── validate.js               # Validate migration success
│   ├── resume.js                 # Resume interrupted migrations
│   ├── resume-cli.js             # Resume interrupted CLI migrations
│   ├── cascade-publish.js        # Smart publish with dependency resolution
│   ├── publish-all-drafts.js     # Brute force publish all drafts
│   ├── tag-drafts.js             # Tag/untag draft entries
│   ├── publish-assets.js         # Publish all draft assets
│   ├── strip-validations.js      # Remove content type validations
│   └── restore-validations.js    # Restore content type validations
├── docs/                          # Documentation
│   ├── EXPORT-GUIDE.md           # Detailed export instructions
│   ├── IMPORT-GUIDE.md           # Detailed import instructions
│   ├── RATE-LIMITING.md          # Rate limiting details
│   └── TROUBLESHOOTING.md        # Common issues and solutions
├── batch-config.json              # Batch import configuration
├── batch-config.example.json      # Batch import config template
├── cascade-config.json            # Publishing configuration
├── cascade-config.example.json    # Publishing config template
├── package.json                   # Dependencies and scripts
├── README.md                      # This file
├── CONTRIBUTING.md                # Contribution guidelines
├── LICENSE                        # MIT License
└── contentful-export/             # Your exported data (not in repo)
    ├── exported-space.json
    └── [asset directories]
```

## 🎬 Example Migrations

### Example 1: Standard Migration (No Circular Dependencies)

**Scenario**: Migrate 4,100 assets and 11,900 entries

```bash
# 1. Export from US space
npx contentful-export \
  --space-id us-space-123 \
  --management-token US_TOKEN \
  --export-dir ./contentful-export \
  --download-assets

# 2. Clean invalid drafts (optional)
npm run cleanup-drafts

# 3. Configure target (EU space)
cp batch-config.example.json batch-config.json
# Edit batch-config.json with EU space credentials
# Set "skipContentPublishing": true

# 4. Split into batches
npm run split
# Output: 7 batches created

# 5. Import to EU space (as drafts)
npm run import
# Takes ~3-5 hours with rate limiting

# 6. Validate
npm run validate
# All checks pass ✅

# 7. Publish assets
npm run publish-assets
# ~10 minutes for 4,100 assets

# 8. Publish entries with cascade
npm run cascade-publish
# ~30 minutes for 11,900 entries
```

**Result**: Successfully migrated and published 16,000 items!

### Example 2: Migration with Circular Dependencies

**Scenario**: Migrate with 4,000 entries having circular dependencies

```bash
# 1-6. Same as Example 1 (export, clean, import, validate)

# 7. Publish assets first
npm run publish-assets

# 8. Try cascade publish first
npm run cascade-publish
# ⚠️ Skipped 4,000 entries with circular dependencies

# 9. Use brute force for circular dependencies
npm run publish-all
# Run 1: Published 1,200, Failed 2,800

npm run publish-all
# Run 2: Published 1,500, Failed 1,300

npm run publish-all
# Run 3: Published 900, Failed 400

npm run publish-all
# Run 4: Published 350, Failed 50

npm run publish-all
# Run 5: Published 50, Failed 0
# ✅ All done!
```

**Result**: All 4,000 circular dependency entries published after 5 iterations!

### Example 3: Selective Publishing with Tags

**Scenario**: Mark problematic entries and publish clean ones first

```bash
# 1-6. Same as Example 1 (export, clean, import, validate)

# 7. Identify and tag problematic entries
# After investigating failed-entries.json from a test run
# Manually tag ~500 problematic entries in Contentful UI with 'skip-publish'

# 8. Publish assets
npm run publish-assets

# 9. Cascade publish (skipping tagged - respects dependencies)
npm run cascade-publish -- --skip-tag skip-publish
# Published 11,400 entries in dependency order
# Skipped 500 tagged + circular ones

# 10. Brute force remaining circular deps (except tagged)
npm run publish-all -- --skip-tag skip-publish
# Run 1: Published 50, Failed 35
npm run publish-all -- --skip-tag skip-publish
# Run 2: Published 30, Failed 5
npm run publish-all -- --skip-tag skip-publish
# Run 3: Published 5, Failed 0

# 11. Eventually handle the 500 tagged ones
npm run tag-drafts skip-publish -- --remove
npm run publish-all
# Run several times until complete
```

**Result**: Clean entries published efficiently with cascade, circular deps resolved with brute force, problematic ones handled separately!

## 🐛 Troubleshooting

### Rate Limiting (429 Errors)

**Solution**: Increase delay between batches

```json
{
  "importOptions": {
    "delayBetweenBatches": 300000  // 5 minutes instead of 3
  }
}
```

### Import Failures Due to Invalid Drafts

**Solution**: Clean invalid drafts before importing

```bash
npm run cleanup-drafts
# Review draft-cleanup-report.json
# Update batch-config.json to use cleaned file
```

### Import Failures

1. Check logs: `batches/logs/batch-XX-errors.log`
2. Resume import: `npm run resume`
3. If persists, reduce batch size

### Validation Mismatches

1. Check failed batches: `batches/import-state.json`
2. Review error logs
3. Retry failed batches: `npm run resume`

### Need to Start Fresh or Re-import

**Problem**: Migration is too broken to fix, or you want to start over

**Solution**: Use the built-in space cleanup script

```bash
# Clean everything except assets (fastest way to retry)
npm run clean-space -- --content-types

# Then re-import
npm run import
```

**When to use:**
- Import created corrupted data
- Want to test different import strategies
- Content model changes require fresh import
- Migration failed multiple times and recovery is too complex

**Features:**
- ✅ Supports EU & US API endpoints (reads from cascade-config.json)
- ✅ Shows space details before deletion (org, space name, space ID, environment)
- ✅ Requires Y/N confirmation prompt
- ✅ Dry-run mode for safety
- ✅ Selective cleanup (entries, content types, assets)
- ✅ Auto-unpublish before deletion

**See:** Step 7 in Usage section for detailed cleanup options

### Publishing Issues

#### Circular Dependencies Won't Resolve

**Problem**: `publish-all` keeps failing with same entries after many runs

**Solutions**:
```bash
# 1. Check failed-entries.json for patterns
cat failed-entries.json | grep "error" | sort | uniq -c

# 2. Tag problematic entries and skip them temporarily
npm run tag-drafts circular-dep
npm run publish-all -- --skip-tag circular-dep

# 3. Manually investigate and fix in Contentful UI
# - Break circular references
# - Publish dependencies manually
# - Then retry: npm run publish-all
```

#### All Entries Failing to Publish

**Problem**: 100% failure rate in `publish-all`

**Possible causes**:
1. Assets not published yet → Run `npm run publish-assets` first
2. Wrong configuration → Verify `cascade-config.json` credentials
3. Permissions issue → Check management token has publish permissions
4. Network/API issues → Wait and retry

#### Tags Not Working

**Problem**: `tag-drafts` fails or tags not appearing

**Solution**:
```bash
# 1. Verify the tag was created
# Check in Contentful UI → Settings → Tags

# 2. Ensure tag ID doesn't have special characters
# Use simple names: skip-publish, circular-dep, problematic

# 3. Check metadata in Contentful API
# Tags should appear in entry.metadata.tags
```

#### Publishing Too Slow

**Problem**: Publishing takes hours

**Solutions**:
1. **Skip analysis**: Use `publish-all` instead of `cascade-publish` (no dependency analysis overhead)
2. **Filter by tag**: Tag and skip entries you know will fail
3. **Parallel runs**: If you have multiple environments, publish them in parallel
4. **Rate limiting**: The 100ms delay (10 req/sec) is safe but you can reduce it to 50ms (20 req/sec) in the code if needed

📚 **Full guide**: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

## 🧪 Testing

Test with a small batch first:

```json
{
  "batchSize": 100  // Small batch for testing
}
```

Then monitor the first batch import closely before proceeding with full migration.

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Quick Contribution Guide

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built for handling large-scale Contentful migrations
- Uses [contentful-import](https://github.com/contentful/contentful-import) and [contentful-management](https://github.com/contentful/contentful-management.js)
- Inspired by real-world migration challenges

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/faisalbasra/contentful-batch-migrator/issues)
- **Discussions**: [GitHub Discussions](https://github.com/faisalbasra/contentful-batch-migrator/discussions)
- **Contentful Support**: [Contentful Help Center](https://www.contentful.com/help/)

## 🔗 Related Projects

- [contentful-import](https://github.com/contentful/contentful-import) - Official Contentful import tool
- [contentful-export](https://github.com/contentful/contentful-export) - Official Contentful export tool
- [contentful-cli](https://github.com/contentful/contentful-cli) - Contentful command line tools

## 📊 Stats & Performance

**Tested with:**
- ✅ 4,100 assets (4.6GB)
- ✅ 11,900 entries
- ✅ 60 content types
- ✅ 440 tags
- ✅ 4,000 circular dependency entries

**Import Performance:**
- Average batch import: 20-30 minutes (with rate limiting)
- Full migration (7 batches): 3-5 hours (with rate limiting)
- Success rate: 100% (with retries)

**Publishing Performance:**
- Asset publishing: ~7 minutes for 4,100 assets (10 req/sec)
- Cascade publish: ~20 minutes for 11,900 entries (10 req/sec)
- Brute force publish: 5-10 iterations for 4,000 circular dependencies (~7 min per iteration)
- Tagging: ~7 minutes for 4,000 entries (10 req/sec)

## 🗺️ Roadmap

- [x] **Client-side rate limiting** - Token bucket algorithm to respect API limits
- [x] **Draft cleanup utility** - Identify and remove invalid/orphan drafts before migration
- [x] **Cascade publish** - Smart publishing with dependency resolution
- [x] **Brute force publish** - Handle circular dependencies through repetition
- [x] **Tag management** - Tag and filter draft entries for selective publishing
- [ ] **Webhook integration** - Trigger notifications on migration completion
- [ ] **Parallel batch imports** - Import multiple batches simultaneously
- [ ] **Incremental migrations** - Sync only changed content

## ⚠️ Important Notes

1. **Management Token**: Keep your CMA token secure, never commit it
2. **Test First**: Always test on a staging environment
3. **Backup**: Create a space snapshot before importing
4. **Rate Limits**: Respect Contentful's API rate limits (10 req/sec, 36K req/hour)
5. **Asset Files**: Ensure all asset files are downloaded locally
6. **Publishing Configuration**: Create `cascade-config.json` for publishing scripts (separate from `batch-config.json`)
7. **Circular Dependencies**: Use brute force publish for entries with circular references
8. **Draft Publishing**: Always set `skipContentPublishing: true` during import, then publish separately
9. **Space Cleanup**: Use `npm run clean-space` for selective cleanup (supports EU & US endpoints)
10. **Cleanup is Destructive**: Space cleanup operations cannot be undone - always use dry-run first

---

## 📋 Quick Reference

### Space Cleanup Commands

```bash
# Clean entries only (keep content types & assets)
npm run clean-space:dry-run
npm run clean-space

# Clean entries + content types (keep assets)
npm run clean-space -- --dry-run --content-types
npm run clean-space -- --content-types

# Clean everything (entries + content types + assets)
npm run clean-space -- --content-types --assets
```

### Publishing Commands

#### Basic Publishing
```bash
# Publish assets (always do this first)
npm run publish-assets

# Publish entries with smart dependency resolution
npm run cascade-publish

# Cascade publish with tag filtering
npm run cascade-publish -- --skip-tag skip-publish

# Preview before publishing (dry run)
npm run cascade-publish:dry-run
```

### For Circular Dependencies
```bash
# Brute force - run repeatedly until all published
npm run publish-all
npm run publish-all  # Run multiple times

# Check progress
cat failed-entries.json | wc -l  # Count remaining failures
```

### Tag Management
```bash
# Tag all drafts
npm run tag-drafts skip-publish

# Publish everything except tagged
npm run publish-all -- --skip-tag skip-publish

# Remove tag when ready
npm run tag-drafts skip-publish -- --remove
npm run publish-all  # Publish the previously tagged ones
```

### Common Workflows

#### Publishing Workflows
```bash
# Workflow 1: Standard (no circular deps)
npm run publish-assets && npm run cascade-publish

# Workflow 2: With circular deps
npm run publish-assets
npm run cascade-publish
# Some will be skipped, use brute force for remaining
npm run publish-all  # Repeat until failures = 0

# Workflow 3: Selective with cascade (tag problematic ones first)
npm run tag-drafts problematic
npm run publish-assets
npm run cascade-publish -- --skip-tag problematic
# Clean entries published, now handle problematic ones
npm run tag-drafts problematic -- --remove
npm run publish-all  # Brute force for remaining

# Workflow 4: Selective with brute force only
npm run tag-drafts problematic
npm run publish-assets
npm run publish-all -- --skip-tag problematic
# Handle problematic ones separately later
```

#### Cleanup & Re-import Workflows
```bash
# Workflow 5: Clean and re-import (keep assets)
npm run clean-space -- --content-types
npm run import
npm run publish-assets
npm run cascade-publish

# Workflow 6: Complete fresh start
npm run clean-space -- --content-types --assets
npm run import
npm run publish-all

# Workflow 7: Clean content only, keep model
npm run clean-space
npm run import:direct  # Import without splitting
```

---

**Made with ❤️ for the Contentful community**

If this tool helped you, please ⭐ star the repo!
