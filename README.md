# Contentful Batch Migrator

"queryEntries": [
    "sys.updatedAt[gte]=2025-10-01T00:00:00Z",
    "sys.updatedAt[lte]=2025-10-31T23:59:59Z"
  ],
  "queryAssets": [
    "sys.updatedAt[gte]=2025-10-01T00:00:00Z",
    "sys.updatedAt[lte]=2025-10-31T23:59:59Z"
  ],

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

> A robust solution for migrating large Contentful spaces without hitting rate limits.

Migrate thousands of assets and entries between Contentful spaces by intelligently splitting them into manageable batches. Perfect for moving content between regions, environments, or organizations.

## 🚀 Features

- **Batch Processing**: Automatically split large exports into configurable batch sizes
- **Client-Side Rate Limiting**: Token bucket algorithm enforces API rate limits (10 req/sec, 36K req/hour)
- **Draft Cleanup**: Identify and remove invalid/orphan draft entries before migration
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
# Clone the repository
git clone https://github.com/faisalbasra/contentful-batch-migrator.git
cd contentful-batch-migrator

# Install dependencies
npm install

# See all available commands
npm run help

# Configure your migration
cp batch-config.example.json batch-config.json
# Edit batch-config.json with your credentials

# Run the migration
npm run split    # Step 1: Split export
npm run import   # Step 2: Import batches
npm run validate # Step 3: Validate migration
```

### 📚 Available Commands

```bash
npm run help           # Show all available commands
npm run cleanup-drafts # Analyze and remove invalid drafts
npm run split          # Split export into batches
npm run import         # Import all batches
npm run validate       # Validate migration
npm run resume         # Resume failed import
npm run clean          # Remove batches directory
npm run clean:all      # Remove batches and export
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
│   ├── split.js                  # Split large exports into batches
│   ├── import.js                 # Import batches with rate limiting
│   ├── validate.js               # Validate migration success
│   └── resume.js                 # Resume interrupted migrations
├── docs/                          # Documentation
│   ├── EXPORT-GUIDE.md           # Detailed export instructions
│   ├── IMPORT-GUIDE.md           # Detailed import instructions
│   ├── RATE-LIMITING.md          # Rate limiting details
│   └── TROUBLESHOOTING.md        # Common issues and solutions
├── batch-config.json              # Configuration (create from example)
├── batch-config.example.json      # Configuration template
├── package.json                   # Dependencies and scripts
├── README.md                      # This file
├── CONTRIBUTING.md                # Contribution guidelines
├── LICENSE                        # MIT License
└── contentful-export/             # Your exported data (not in repo)
    ├── exported-space.json
    └── [asset directories]
```

## 🎬 Example Migration

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

# 4. Split into batches
npm run split
# Output: 7 batches created

# 5. Import to EU space
npm run import
# Takes ~3-5 hours with rate limiting

# 6. Validate
npm run validate
# All checks pass ✅
```

**Result**: Successfully migrated 16,111 items without rate limiting!

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

**Performance:**
- Average batch import: 20-30 minutes (with rate limiting)
- Full migration (7 batches): 3-5 hours (with rate limiting)
- Success rate: 100% (with retries)

## 🗺️ Roadmap

- [x] **Client-side rate limiting** - Token bucket algorithm to respect API limits
- [x] **Draft cleanup utility** - Identify and remove invalid/orphan drafts before migration

## ⚠️ Important Notes

1. **Management Token**: Keep your CMA token secure, never commit it
2. **Test First**: Always test on a staging environment
3. **Backup**: Create a space snapshot before importing
4. **Rate Limits**: Respect Contentful's API rate limits
5. **Asset Files**: Ensure all asset files are downloaded locally

---

**Made with ❤️ for the Contentful community**

If this tool helped you, please ⭐ star the repo!
