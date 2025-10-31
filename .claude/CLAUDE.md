# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Name**: contentful-batch-migrator
**Version**: 1.0.0
**Author**: Faisal Basra <faisal.basra@gmail.com>
**License**: MIT
**Node Version**: >=18.0.0
**Repository**: https://github.com/faisalbasra/contentful-batch-migrator

### Purpose
A robust solution for migrating large Contentful spaces (1,000+ assets, entries) without hitting API rate limits. Intelligently splits large exports into manageable batches and imports them sequentially with built-in retry logic and progress tracking.

### Key Features
- Batch processing with configurable batch sizes (default: 400 assets)
- Rate limit protection with delays and exponential backoff
- Smart asset-entry relationship preservation across batches
- Automatic resume support for failed/interrupted migrations
- Progress tracking and detailed logging
- Post-migration validation
- Configurable retry attempts (default: 3 retries)

### Use Cases
- Migrating 1,000+ assets and entries between Contentful spaces
- Moving content between regions (US → EU)
- Copying content between organizations
- Environment cloning with large datasets
- Avoiding "429 Too Many Requests" errors

## Project Structure

```
contentful-batch-migrator/
├── bin/                           # Executable scripts (main logic)
│   ├── rateLimiter.js            # Token bucket rate limiter (utility class)
│   ├── split.js                  # Splits large exports into batches
│   ├── import.js                 # Imports batches with rate limiting
│   ├── validate.js               # Validates migration success
│   ├── resume.js                 # Resumes interrupted migrations
│   └── cleanup-drafts.js         # Removes invalid/orphan draft entries
├── docs/                          # Documentation
│   ├── EXPORT-GUIDE.md           # Detailed export instructions
│   ├── IMPORT-GUIDE.md           # Detailed import instructions
│   └── TROUBLESHOOTING.md        # Common issues and solutions
├── .claude/                       # Claude Code configuration
│   └── CLAUDE.md                 # This file
├── batch-config.json              # User configuration (not in repo)
├── batch-config.example.json      # Configuration template
├── package.json                   # Dependencies and scripts
├── README.md                      # Main documentation
├── CONTRIBUTING.md                # Contribution guidelines
├── LICENSE                        # MIT License
├── contentful-export/             # Export directory (not in repo)
└── batches/                       # Generated batches (not in repo)
    ├── batch-01/
    ├── batch-02/
    ├── manifest.json              # Batch metadata
    ├── import-state.json          # Import progress tracking
    └── logs/                      # Import logs
```

## Key Technologies & Dependencies

### Production Dependencies
- **contentful-import** (^9.4.123): Official Contentful import tool
- **contentful-management** (^11.61.1): Contentful Management API client

### Built-in Node.js Modules
- fs: File system operations
- path: Path manipulation

## Configuration

### batch-config.json Structure
```json
{
  "batchSize": 400,                          // Assets per batch (400-700 recommended)
  "sourceFile": "./contentful-export/exported-space.json",
  "sourceAssetsDir": "./contentful-export",
  "outputDir": "./batches",
  "preserveStructure": true,
  "targetSpace": {
    "spaceId": "YOUR_TARGET_SPACE_ID",
    "environmentId": "master",
    "managementToken": "YOUR_CMA_TOKEN",
    "host": "api.contentful.com"            // or "api.eu.contentful.com" for EU
  },
  "importOptions": {
    "uploadAssets": true,
    "skipContentPublishing": false,
    "skipAssetUpdates": false,
    "skipContentUpdates": false,
    "delayBetweenBatches": 180000,         // 3 minutes (180000ms)
    "maxRetries": 3,                        // Number of retry attempts
    "retryDelay": 5000                      // Initial retry delay (5s)
  },
  "rateLimits": {
    "enabled": true,                        // Enable client-side rate limiting
    "requestsPerSecond": 10,               // Max 10 requests per second
    "requestsPerHour": 36000,              // Max 36,000 requests per hour
    "verbose": true                         // Log rate limit throttling
  }
}
```

### Important Configuration Notes
- **batchSize**: Recommended 400-700 assets per batch (400 is more conservative)
- **delayBetweenBatches**: 180000ms (3 minutes) to avoid rate limits
- **maxRetries**: 3 attempts with exponential backoff
- **rateLimits.enabled**: Enables client-side rate limiting (uses bin/rateLimiter.js)
- **rateLimits.requestsPerSecond**: 10 req/sec enforced via token bucket algorithm
- **rateLimits.requestsPerHour**: 36,000 req/hour enforced via token bucket algorithm
- Content model (contentTypes, locales, tags, etc.) only imported in first batch

## Core Scripts & Functionality

### 0. bin/rateLimiter.js (NEW)
**Purpose**: Token bucket rate limiter for Contentful API calls

**Key Features**:
- Implements token bucket algorithm for smooth rate limiting
- Dual-layer protection: per-second AND per-hour limits
- Automatic refill based on elapsed time
- Handles 429 errors gracefully (waits 60s and resets buckets)
- Can read Contentful rate limit headers for dynamic adjustment
- Provides statistics tracking (total requests, throttled requests, wait time, avg rate)

**Core Methods**:
- `throttle(fn)`: Main method - wraps any async function with rate limiting
- `refillBucket(bucket)`: Replenishes tokens based on time passed
- `waitForToken(bucket, bucketName)`: Waits if no tokens available
- `updateFromHeaders(headers)`: Updates token counts from Contentful API response headers
- `getStats()` / `printStats()`: Returns/displays rate limiter statistics

**Algorithm**:
- Token bucket capacity = rate limit (10 for per-second, 36000 for per-hour)
- Tokens refill continuously based on rate (10 tokens/sec, 10 tokens/sec for hourly bucket)
- Each API call consumes 1 token from BOTH buckets
- If tokens < 1, calculates wait time and sleeps
- Allows burst requests up to capacity while maintaining average rate

**Usage Example**:
```javascript
const rateLimiter = new RateLimiter({
  requestsPerSecond: 10,
  requestsPerHour: 36000,
  verbose: true
});

await rateLimiter.throttle(async () => {
  return await environment.createAsset(asset);
});
```

### 1. bin/split.js
**Purpose**: Splits large Contentful export into manageable batches

**Key Functions**:
- `getAssetReferencesFromEntry(entry)`: Traverses entry fields to find asset references (line 38-60)
- `splitExport()`: Main function that orchestrates the splitting process (line 63-270)

**Process**:
1. Reads source export file (sourceFile in config)
2. Builds asset-to-entry relationship map
3. Splits assets into batches based on batchSize
4. Assigns entries to batches based on asset references
5. Handles orphaned entries (entries without asset refs) in final batch
6. Copies asset files from source to batch directories
7. Creates manifest.json with batch metadata

**Output**:
- `batches/batch-01/`, `batch-02/`, etc.
- Each batch contains:
  - `exported-space.json`: Batch-specific export
  - Asset files organized by path
- `batches/manifest.json`: Metadata about all batches

**Important Logic**:
- Only first batch includes content model (contentTypes, locales, tags, editorInterfaces) (line 154-160)
- Tracks processed entries to avoid duplicates across batches (line 124, 139, 147)
- Preserves asset directory structure based on Contentful CDN URLs (line 184-196)

### 2. bin/import.js (REWRITTEN)
**Purpose**: Imports batches sequentially using SDK directly with client-side rate limiting

**Key Changes from Original**:
- ❌ No longer uses `contentful-import` CLI via spawn
- ✅ Uses `contentful-management` SDK directly
- ✅ Integrates RateLimiter for every API call
- ✅ Fine-grained control over each operation (create, process, publish)

**Key Functions**:
- `loadState()`: Loads or creates import state for resume capability
- `saveState(state)`: Persists import progress
- `log(message, logStream)`: Logs to both console and file
- `importBatch(batchDir, batchNum, isFirstBatch)`: Main import function using SDK + rate limiter
- `importAllBatches(startFromBatch)`: Main orchestration function

**State Management**:
- State file: `batches/import-state.json`
- Tracks: completedBatches, failedBatches, currentBatch
- Enables resume functionality

**Import Process**:
1. Loads manifest.json to get batch count
2. Loads import state (skips completed batches)
3. For each batch:
   - Initializes RateLimiter (if enabled)
   - Connects to Contentful Management API
   - **First batch only**: Imports locales → tags → content types → editor interfaces
   - Imports assets (create → process → publish) with rate limiting
   - Imports entries (create → publish) with rate limiting
   - Prints rate limiter statistics
   - Implements retry logic with exponential backoff
   - Logs output to `batches/logs/batch-XX.log`
   - Waits delayBetweenBatches before next batch
4. Updates state after each batch
5. Provides summary and next steps

**Rate Limiting Integration**:
- Every SDK call wrapped in `rateLimiter.throttle(async () => { ... })`
- If rate limiter disabled (config), calls SDK directly
- Rate limiter automatically enforces 10 req/sec and 36,000 req/hour
- Handles 429 errors by waiting 60s and resetting buckets

**Important Logic**:
- Content model only imported in first batch (line 108)
- Asset processing: create → processForAllLocales → poll until ready → publish
- Polling for asset processing uses rate-limited getAsset calls (line 261-267)
- Progress logged every 10 assets and 50 entries
- Errors logged but don't stop batch (continues with other items)
- Rate limiter stats printed at end of each batch (line 360-362)

### 3. bin/validate.js
**Purpose**: Validates migration by comparing source and target counts

**Expected Validations**:
- Content Types count
- Entries count
- Assets count
- Reports differences and validation status

### 4. bin/resume.js
**Purpose**: Resumes failed or interrupted imports

**Process**:
- Reads import-state.json
- Determines next batch to process
- Calls importAllBatches with correct starting point

### 5. bin/cleanup-drafts.js
**Purpose**: Analyzes and removes problematic draft entries/assets from exports before migration

**Key Functions**:
- Analyzes export file for draft entries and assets
- Identifies invalid drafts (missing required fields)
- Identifies orphan drafts (content type doesn't exist)
- Identifies invalid asset drafts (missing file)
- Generates detailed report of issues found
- Creates cleaned export file with problematic items removed
- Updates references in remaining entries (removes links to deleted items)

**Output**:
- `draft-cleanup-report.json`: Detailed analysis report with all invalid items
- `contentful-export/exported-space-cleaned.json`: Cleaned export file ready for import

**Usage**:
Run this BEFORE splitting if you suspect your export contains invalid drafts:
```bash
npm run cleanup-drafts
# Then use the cleaned file in batch-config.json:
# "sourceFile": "./contentful-export/exported-space-cleaned.json"
```

**Report Contents**:
- Summary statistics (total entries, assets, drafts, invalid items)
- List of invalid drafts with missing required fields
- List of orphan drafts (content type not found)
- List of invalid asset drafts (missing file)

**Important Logic**:
- Draft detection: no publishedVersion OR version > publishedVersion + 1
- Content type validation: checks if referenced content type exists in export
- Required field validation: verifies all required fields have values
- Asset file validation: ensures asset has file object with content
- Link cleanup: removes references to deleted entries/assets from remaining entries (line 213-241)

## NPM Scripts

```bash
npm run help           # Show all available commands
npm run split          # Run bin/split.js
npm run import         # Run bin/import.js
npm run validate       # Run bin/validate.js
npm run resume         # Run bin/resume.js
npm run cleanup-drafts # Run bin/cleanup-drafts.js
npm run clean          # Remove batches/ directory
npm run clean:all      # Remove batches/ and contentful-export/
```

## Typical Workflow

### Standard Workflow
1. **Export from source** (manual step using contentful-export CLI)
2. **Configure**: Copy batch-config.example.json → batch-config.json
3. **Split**: `npm run split` (splits export into batches)
4. **Import**: `npm run import` (imports sequentially with delays)
5. **Validate**: `npm run validate` (verifies migration success)

### Workflow with Draft Cleanup
If your export contains invalid drafts or if imports are failing due to validation errors:

1. **Export from source** (manual step using contentful-export CLI)
2. **Cleanup drafts**: `npm run cleanup-drafts` (optional but recommended)
   - Review `draft-cleanup-report.json` to see what was found
   - Update `batch-config.json` to use cleaned file if needed
3. **Configure**: Copy batch-config.example.json → batch-config.json
4. **Split**: `npm run split` (splits export into batches)
5. **Import**: `npm run import` (imports sequentially with delays)
6. **Validate**: `npm run validate` (verifies migration success)

### Recovery from Failures
If import fails:
- Review logs in `batches/logs/`
- Check `batches/import-state.json`
- Run `npm run resume` to continue from last successful batch

## Key Algorithms & Logic

### Asset-Entry Relationship Preservation
The splitter builds bidirectional maps:
- `assetToEntries`: Map<assetId, [entryIds]> - tracks which entries reference each asset
- `entryToAssets`: Map<entryId, [assetIds]> - tracks which assets each entry references

When splitting:
- Each batch gets a set of assets
- Entries are assigned to batches if they reference ANY asset in that batch
- Processed entries are tracked to prevent duplicates
- Orphaned entries (no asset refs) go in final batch

### Rate Limit Protection (4-Layer Strategy)
Multiple defensive layers work together:

1. **Batch splitting** (Layer 1 - Macro):
   - Limits assets per import operation (400 assets/batch)
   - Reduces per-operation size and memory footprint

2. **Sequential batch processing** (Layer 2 - Macro):
   - One batch at a time, no parallelism
   - Ensures predictable load on API

3. **Inter-batch delays** (Layer 3 - Macro):
   - 180000ms (3 minutes) between batches
   - Gives API server resources time to recover

4. **Client-side rate limiter** (Layer 4 - Micro) ⭐ NEW:
   - Enforces 10 requests/second WITHIN each batch
   - Token bucket algorithm prevents bursts
   - Also enforces 36,000 requests/hour cumulative
   - Wraps every single SDK API call
   - Example: 400 assets × 4 calls/asset = 1600 calls
     - Without limiter: ~1600 calls in 1 minute = 26.7 req/sec ❌
     - With limiter: 1600 calls in 160 seconds = 10 req/sec ✅

5. **Retry with exponential backoff** (Layer 5 - Safety Net):
   - Delays increase with each retry
   - Handles transient failures and network issues

6. **State persistence** (Layer 6 - Recovery):
   - Can pause/resume without losing progress
   - Failed batches tracked separately

### Error Handling
- Per-batch retry logic (up to maxRetries attempts)
- Failed batches logged but don't block subsequent batches
- All logs saved for debugging
- State file enables resumption from failures

## Performance Characteristics

**Tested Scale**:
- 4,126 assets (4.6GB)
- 11,985 entries
- 60 content types
- 446 tags

**Timing** (with current config + rate limiter):
- Average batch import: **20-30 minutes** (increased due to rate limiting)
- Full migration (7 batches): **3-5 hours** (longer but safer)
- Success rate: 100% (with retries)

**Current Configuration Impact**:
- batchSize=400: ~10-11 batches for 4,126 assets
- delayBetweenBatches=180000ms: 30 minutes of waiting for 10 batches
- **rateLimits=10 req/sec**: Each batch takes longer but respects API limits
- Example batch calculation:
  - 400 assets × 4 API calls (create, process, poll, publish) = 1,600 calls
  - 1,600 calls ÷ 10 req/sec = 160 seconds minimum = ~2.7 minutes
  - Add entries, retries, network latency → ~20-30 minutes/batch
- Total time = (rate-limited batch time × count) + (inter-batch delays × count)

## Important Implementation Details

### File Path Handling
- Asset URLs format: `//images.ctfassets.net/{spaceId}/{assetId}/{hash}/{filename}`
- Source path: `{sourceAssetsDir}/{full-url-path}`
- Destination path: `{batchDir}/{full-url-path}`
- Directory structure preserved via `ensureDir()` (split.js:25-29, 33)

### Content Model Handling
- Only batch-01 includes: contentTypes, tags, locales, editorInterfaces, webhooks
- All other batches have these as empty arrays (split.js:154-160)
- This prevents duplicate content model imports

### State File Format (import-state.json)
```json
{
  "startedAt": "ISO-8601 timestamp",
  "completedBatches": ["01", "02", "03"],
  "failedBatches": [
    {
      "batch": "04",
      "error": "Error message",
      "timestamp": "ISO-8601 timestamp"
    }
  ],
  "currentBatch": "05"  // or null if not actively importing
}
```

## Known Issues & Considerations

### Potential Issues
1. **Rate limiting**: Can still occur if batch size too large or delays too short
2. **Asset file availability**: Missing asset files are skipped with warnings
3. **Memory usage**: Large exports loaded entirely into memory during split
4. **Network interruptions**: Can cause batch failures (mitigated by retry logic)

### Solutions/Mitigations
1. Adjust batchSize (reduce to 300-400) and increase delays (300000ms)
2. Ensure all assets downloaded with `--download-assets` flag
3. Process extremely large exports in chunks or on machines with more RAM
4. Retry logic handles transient failures; resume capability for longer interruptions

## Documentation Files

- **EXPORT-GUIDE.md**: Detailed instructions for exporting from source space
- **IMPORT-GUIDE.md**: Detailed import process and troubleshooting
- **TROUBLESHOOTING.md**: Common issues, error messages, and solutions
- **CONTRIBUTING.md**: Guidelines for contributing to the project

## Development Notes

### Code Style
- Pure Node.js (no TypeScript, no build step)
- Executable scripts with shebang: `#!/usr/bin/env node`
- Uses native Node.js modules (fs, path, child_process)
- Minimal dependencies (only Contentful official packages)

### Testing Recommendations
- Start with small batch size (100) for testing
- Test on staging/non-production environments first
- Monitor first batch import closely before proceeding
- Keep CMA token secure (never commit batch-config.json)

## Security Considerations

1. **Management Token**: Keep secure, never commit
2. **batch-config.json**: In .gitignore (contains credentials)
3. **Rate limits**: Respect Contentful API limits
4. **Space snapshots**: Create backup before importing

## Future Enhancements (from README Roadmap)

- [ ] Interactive CLI wizard for configuration
- [ ] Progress bar for batch imports
- [ ] Parallel batch processing (with rate limit awareness)
- [ ] Web UI for monitoring migrations
- [ ] Docker support
- [ ] CI/CD integration examples

## Quick Reference Commands

```bash
# Initial setup
npm install
cp batch-config.example.json batch-config.json
# Edit batch-config.json with credentials

# Full migration flow
npm run split     # Step 1: Split
npm run import    # Step 2: Import
npm run validate  # Step 3: Validate

# Recovery
npm run resume    # Resume failed import

# Cleanup
npm run clean     # Remove batches/
npm run clean:all # Remove batches/ and contentful-export/
```

## Important File Locations

- **Configuration**: `./batch-config.json` (not in repo, create from example)
- **Source export**: `./contentful-export/exported-space.json`
- **Cleaned export**: `./contentful-export/exported-space-cleaned.json` (after cleanup-drafts)
- **Draft report**: `./draft-cleanup-report.json` (after cleanup-drafts)
- **Batches output**: `./batches/batch-01/`, etc.
- **Manifest**: `./batches/manifest.json`
- **Import state**: `./batches/import-state.json`
- **Logs**: `./batches/logs/batch-XX.log`
- **Error logs**: `./batches/logs/batch-XX-errors.log`

## Common Development Patterns

### Adding New Features to Import Process
When modifying `bin/import.js`:
- Wrap all Contentful API calls with `rateLimiter.throttle(() => {...})` if rate limiting is enabled
- Use the pattern: `const result = rateLimitEnabled ? await rateLimiter.throttle(async () => await apiCall()) : await apiCall()`
- Log progress regularly (every 10 items for assets, 50 for entries)
- Always handle errors gracefully - log but continue processing
- Update import state after completing each batch

### Working with Export Data Structure
All Contentful exports follow this structure:
```javascript
{
  contentTypes: [],      // Content model definitions
  entries: [],          // Content entries
  assets: [],           // Media assets
  locales: [],          // Space locales
  tags: [],             // Tags
  editorInterfaces: [], // UI configuration
  webhooks: []          // Webhooks (usually empty)
}
```

Each item has a `sys` object with metadata:
- `sys.id`: Unique identifier
- `sys.type`: Resource type
- `sys.version`: Current version
- `sys.publishedVersion`: Last published version (undefined if draft)
- `sys.contentType`: Reference to content type (entries only)

### Debugging Import Issues
1. Check the specific batch log: `batches/logs/batch-XX.log`
2. Look for error patterns in error logs: `batches/logs/batch-XX-errors.log`
3. Check import state: `batches/import-state.json`
4. Verify rate limiter stats at end of batch output
5. If validation fails, compare counts in source export vs. target space

---

*Last updated: 2025-10-31*
