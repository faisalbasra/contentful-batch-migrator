# Contentful Import Guide

Complete guide for importing content using the batch migration approach.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Step-by-Step Process](#step-by-step-process)
- [Understanding Batches](#understanding-batches)
- [Monitoring Progress](#monitoring-progress)
- [Handling Failures](#handling-failures)
- [Post-Import Validation](#post-import-validation)

## Prerequisites

Before starting the import:

- ✅ Completed export (see [EXPORT-GUIDE.md](EXPORT-GUIDE.md))
- ✅ Target Contentful space created
- ✅ Management token for target space
- ✅ `contentful-export/` directory with exported data
- ✅ Installed dependencies (`npm install`)
- ✅ Sufficient time (2-3 hours for large imports)

### 📚 Quick Reference - Available Commands

If you're new to the tool, you can always see all available commands:

```bash
npm run help
```

This will display:
- `npm run split` - Split export into batches
- `npm run import` - Import all batches
- `npm run validate` - Validate migration
- `npm run resume` - Resume failed import
- `npm run clean` - Remove batches directory
- `npm run clean:all` - Remove batches and export

## Configuration

### Step 1: Create Configuration File

Copy the example configuration:

```bash
cp batch-config.example.json batch-config.json
```

### Step 2: Edit Configuration

Open `batch-config.json` and update:

```json
{
  "batchSize": 600,
  "sourceFile": "./contentful-export/exported-space.json",
  "sourceAssetsDir": "./contentful-export",
  "outputDir": "./batches",
  "targetSpace": {
    "spaceId": "YOUR_TARGET_SPACE_ID",        // ← Update this
    "environmentId": "master",                 // ← Update this
    "managementToken": "YOUR_CMA_TOKEN",       // ← Update this
    "host": "api.contentful.com"               // ← or api.eu.contentful.com
  },
  "importOptions": {
    "uploadAssets": true,
    "skipContentPublishing": false,
    "delayBetweenBatches": 180000,             // 3 minutes
    "maxRetries": 3,
    "retryDelay": 5000
  }
}
```

### Configuration Fields Explained

#### Target Space Configuration

| Field | Description | Example |
|-------|-------------|---------|
| `spaceId` | Target space ID | `abc123xyz456` |
| `environmentId` | Target environment | `master`, `staging`, `test` |
| `managementToken` | CMA token for target | `CFPAT-xxxxx` |
| `host` | API host (region-specific) | `api.contentful.com` (US)<br>`api.eu.contentful.com` (EU) |

#### Import Options

| Option | Description | Recommended |
|--------|-------------|-------------|
| `batchSize` | Assets per batch | 500-700 |
| `delayBetweenBatches` | Wait between batches (ms) | 180000-300000 |
| `maxRetries` | Retry attempts per batch | 3-5 |
| `retryDelay` | Initial retry delay (ms) | 5000-10000 |
| `uploadAssets` | Upload asset files | `true` |
| `skipContentPublishing` | Skip auto-publish | `false` |

### Choosing Batch Size

| Total Assets | Recommended Batch Size | Estimated Batches | Total Time |
|--------------|----------------------|-------------------|------------|
| < 1,000 | 500 | 2 | 30-45 min |
| 1,000-3,000 | 600 | 3-5 | 1-1.5 hours |
| 3,000-5,000 | 600-700 | 5-8 | 2-3 hours |
| > 5,000 | 500 | 10+ | 3-5 hours |

**Lower batch size** = Slower but safer (fewer rate limit issues)
**Higher batch size** = Faster but more risk of rate limiting

### Choosing Delay Between Batches

| Rate Limit Risk | Delay (seconds) | Delay (ms) |
|----------------|----------------|------------|
| Low (< 2,000 assets) | 120-180 | 120000-180000 |
| Medium (2,000-5,000) | 180-240 | 180000-240000 |
| High (> 5,000) | 240-300 | 240000-300000 |

## Step-by-Step Process

### Step 1: Split the Export

Split your large export into manageable batches:

```bash
npm run split
```

#### What Happens:

1. ✅ Reads `contentful-export/exported-space.json`
2. ✅ Analyzes asset-entry relationships
3. ✅ Splits assets into batches (600 each)
4. ✅ Groups related entries with their assets
5. ✅ Copies asset files to batch directories
6. ✅ Creates `batches/` directory structure
7. ✅ Generates `batches/manifest.json`

#### Expected Output:

```
🚀 Starting Contentful Export Splitter...

Configuration:
  - Batch size: 600 assets
  - Source file: ./contentful-export/exported-space.json
  - Output directory: ./batches

📖 Reading source export file...

📊 Source data summary:
  - Content Types: 60
  - Entries: 11985
  - Assets: 4126
  - Tags: 446
  - Locales: 1
  - Editor Interfaces: 60

🔗 Building asset-entry relationship map...
  - Found 3850 assets with entry references
  - Found 276 entries without asset references

📦 Splitting into batches of 600 assets...
  - Created 7 batches

📂 Processing Batch 01...
  - Assets: 600
  - Entries: 1850
  ✅ Created: batches/batch-01/exported-space.json
  📁 Copying asset files...
  ✅ Copied 598 asset files
  ⚠️  Skipped 2 missing files

📂 Processing Batch 02...
  - Assets: 600
  - Entries: 1920
  ✅ Created: batches/batch-02/exported-space.json
  📁 Copying asset files...
  ✅ Copied 600 asset files

[... continues for all batches ...]

📦 Processing orphaned entries (276 entries)...
  ✅ Created: batches/batch-08/exported-space.json

✅ Splitting completed successfully!

📋 Summary:
  - Total batches created: 8
  - Manifest saved to: batches/manifest.json

Next steps:
  1. Review the batches in: batches
  2. Run: npm run import
```

#### Verify Batches

```bash
# Check batch structure
ls -la batches/

# Should see:
# batch-01/
# batch-02/
# ...
# manifest.json
```

### Step 2: Review Batch Manifest

Check `batches/manifest.json` to understand your batches:

```bash
cat batches/manifest.json
```

Example output:

```json
{
  "totalBatches": 8,
  "totalAssets": 4126,
  "totalEntries": 11985,
  "batchSize": 600,
  "createdAt": "2025-01-15T10:30:00.000Z",
  "batches": [
    {
      "batchNumber": 1,
      "batchId": "batch-01",
      "assets": 600,
      "entries": 1850,
      "hasContentModel": true
    },
    {
      "batchNumber": 2,
      "batchId": "batch-02",
      "assets": 600,
      "entries": 1920,
      "hasContentModel": false
    }
    // ... more batches
  ]
}
```

### Step 3: Import Batches

Start the batch import process:

```bash
npm run import
```

#### What Happens:

**For Batch 1:**
1. ✅ Imports content model (content types, locales, tags)
2. ✅ Imports 600 assets
3. ✅ Uploads asset files
4. ✅ Imports 1850 entries
5. ✅ Waits 3 minutes

**For Batches 2-N:**
1. ✅ Skips content model (already imported)
2. ✅ Imports assets
3. ✅ Uploads asset files
4. ✅ Imports entries
5. ✅ Waits 3 minutes

#### Expected Output:

```
🚀 Starting Contentful Batch Import...

📋 Found 8 batches to import

📊 Import state:
  - Completed batches: 0
  - Failed batches: 0
  - Starting from batch: 1

============================================================
📦 Importing Batch 01 of 8
============================================================

Batch info:
  - Assets: 600
  - Entries: 1850
  - Has content model: Yes
  - Directory: batches/batch-01

┌─────────────────────────────┐
│ The following entities are  │
│ going to be imported:       │
├─────────────────────────────┤
│ Content Types │         60  │
│ Tags          │        446  │
│ Locales       │          1  │
│ Assets        │        600  │
│ Entries       │       1850  │
└─────────────────────────────┘

[contentful-import progress output...]

✅ Batch 01 imported successfully!

⏳ Waiting 180 seconds before next batch...

============================================================
📦 Importing Batch 02 of 8
============================================================

[... continues for all batches ...]

============================================================
📊 Import Summary
============================================================
Total batches: 8
✅ Successful: 8
❌ Failed: 0

Logs saved to: batches/logs
State saved to: batches/import-state.json

🎉 All batches imported successfully!

Next steps:
  1. Run validation: npm run validate
  2. Test your content in: test
```

### Step 4: Validate Migration

Verify all content was imported correctly:

```bash
npm run validate
```

#### What It Checks:

1. ✅ Content type count
2. ✅ Entry count
3. ✅ Asset count
4. ✅ Tag count
5. ✅ Locale count
6. ✅ Published vs draft status

#### Expected Output:

```
🔍 Starting Migration Validation...

📖 Reading source export file...
📊 Source data counts:
  - Content Types: 60
  - Entries: 11985
  - Assets: 4126
  - Tags: 446
  - Locales: 1

🔗 Connecting to target space...
📊 Fetching target space data...
  - Counting entries...
    Total entries: 11985
  - Counting assets...
    Total assets: 4126

📊 Target space counts:
  - Content Types: 60
  - Entries: 11985 (11850 published)
  - Assets: 4126 (4100 published)
  - Tags: 446
  - Locales: 1

🔍 Validation Results:
============================================================
✅ Content Types         Source:     60 | Target:     60 | Diff: 0 (0.00%)
✅ Entries               Source:  11985 | Target:  11985 | Diff: 0 (0.00%)
✅ Assets                Source:   4126 | Target:   4126 | Diff: 0 (0.00%)
✅ Tags                  Source:    446 | Target:    446 | Diff: 0 (0.00%)
✅ Locales               Source:      1 | Target:      1 | Diff: 0 (0.00%)
============================================================

📋 Import State:
  - Completed batches: 8
  - Failed batches: 0

📊 Validation Summary:
  ✅ Passed: 5
  ❌ Failed: 0
  ⚠️  Warnings: 0

🎉 Validation passed! All data migrated successfully.
```

## Understanding Batches

### Batch Structure

Each batch directory contains:

```
batches/batch-01/
├── exported-space.json       # Batch data
├── import-config.json        # Generated config
├── assets.ctfassets.net/     # Asset files
├── downloads.ctfassets.net/
├── images.ctfassets.net/
└── videos.ctfassets.net/
```

### Batch Content

**Batch 1 (Special):**
```json
{
  "contentTypes": [...all 60...],
  "tags": [...all 446...],
  "locales": [...1...],
  "editorInterfaces": [...60...],
  "assets": [...600...],
  "entries": [...1850...]
}
```

**Batch 2-N:**
```json
{
  "contentTypes": [],
  "tags": [],
  "locales": [],
  "editorInterfaces": [],
  "assets": [...600...],
  "entries": [...entries referencing these assets...]
}
```

### Why First Batch is Special

The first batch includes the content model because:
- Content types must be created before entries
- Locales must exist before content
- Tags are referenced by entries
- Editor interfaces configure the UI

Subsequent batches skip these to avoid:
- Duplicate content type errors
- Unnecessary API calls
- Longer import times

## Monitoring Progress

### Real-time Monitoring

Watch logs during import:

```bash
# In another terminal
tail -f batches/logs/batch-01.log
```

### Check Import State

```bash
cat batches/import-state.json
```

Example:

```json
{
  "startedAt": "2025-01-15T10:45:00.000Z",
  "completedBatches": ["01", "02", "03"],
  "failedBatches": [],
  "currentBatch": "04"
}
```

### Monitor Target Space

Check Contentful UI during import:
1. Go to target space
2. Navigate to **Content**
3. Watch entries appear
4. Check **Media** for assets

## Handling Failures

### Scenario 1: Single Batch Fails

```
❌ Error importing batch 04: Rate limit exceeded
❌ Batch 04 failed after 3 retries. Moving to next batch...
```

**Solution:**

```bash
# Resume will retry failed batches
npm run resume
```

### Scenario 2: Import Interrupted

```
^C  # User pressed Ctrl+C
```

**Solution:**

```bash
# Resume from where it stopped
npm run resume
```

Output:

```
🔄 Resume Import Script

📊 Current Import State:
  - Completed batches: 3
  - Failed batches: 0
  - Current batch: 04

🔄 Detected interrupted batch: 04
🔄 Will resume from batch: batch-04

⚠️  This will continue the import process.
Press Ctrl+C to cancel, or wait 5 seconds to continue...

🚀 Resuming import...
```

### Scenario 3: Rate Limiting

```
❌ Error: 429 Too Many Requests
```

**Solution 1:** Increase delay

Edit `batch-config.json`:

```json
{
  "importOptions": {
    "delayBetweenBatches": 300000  // 5 minutes
  }
}
```

**Solution 2:** Reduce batch size

```json
{
  "batchSize": 400
}
```

Then re-split and import:

```bash
rm -rf batches/
npm run split
npm run import
```

### Scenario 4: Validation Fails

```
❌ Validation failed! Please review the differences above.
❌ Assets                Source:   4126 | Target:   4000 | Diff: -126
```

**Investigation:**

1. Check failed batches:
   ```bash
   cat batches/import-state.json
   ```

2. Review error logs:
   ```bash
   ls -la batches/logs/*-errors.log
   cat batches/logs/batch-05-errors.log
   ```

3. Retry failed batches:
   ```bash
   npm run resume
   ```

## Post-Import Validation

### 1. Count Verification

```bash
npm run validate
```

### 2. Manual Spot Checks

In Contentful UI:

- ✅ Check a few entries from different content types
- ✅ Verify asset files are viewable
- ✅ Test entry-asset references
- ✅ Check published status
- ✅ Verify localized content

### 3. Content Testing

- ✅ Preview entries in web app
- ✅ Test with your application
- ✅ Verify API responses
- ✅ Check content relationships

### 4. Performance Check

- ✅ Queries respond quickly
- ✅ Assets load correctly
- ✅ No broken references

## Advanced Import Options

### Import Specific Batches

```bash
# Import only batches 3-5
npm run import --start-from 3
# Then stop manually after batch 5
```

### Dry Run (Test First)

1. Create a test space
2. Update `batch-config.json` with test space
3. Import batch 1 only
4. Verify before proceeding

### Skip Publishing

If you want to review before publishing:

```json
{
  "importOptions": {
    "skipContentPublishing": true
  }
}
```

Then publish manually or via API after verification.

## Troubleshooting Import

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed solutions.

### Quick Fixes

| Problem | Quick Fix |
|---------|-----------|
| Rate limiting | Increase `delayBetweenBatches` |
| Import fails | Check error logs, run `resume-import.js` |
| Validation fails | Check `import-state.json`, retry failed batches |
| Out of memory | Run with `node --max-old-space-size=4096` |
| Asset upload fails | Verify files exist, check permissions |

## Import Checklist

- [ ] Configuration file created and verified
- [ ] Target space created and accessible
- [ ] Management token valid and has permissions
- [ ] Export data verified (Step 1 complete)
- [ ] Batches created successfully
- [ ] Batch manifest reviewed
- [ ] Sufficient time allocated (2-3 hours)
- [ ] Monitoring setup ready
- [ ] Backup plan in place

## Next Steps After Import

1. ✅ Run validation
2. ✅ Test content in target space
3. ✅ Update application configurations
4. ✅ Update DNS/URLs (if applicable)
5. ✅ Monitor for issues
6. ✅ Clean up old space (after verification)

---

**Need help?** Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) or open an issue on [GitHub](https://github.com/faisalbasra/contentful-batch-migrator/issues)
