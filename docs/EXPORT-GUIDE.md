# Contentful Export Guide

Complete guide for exporting content and assets from your Contentful space.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Management Token](#getting-management-token)
- [Export Methods](#export-methods)
- [Export Options](#export-options)
- [Best Practices](#best-practices)
- [Common Issues](#common-issues)

## Prerequisites

Before exporting, ensure you have:

- ✅ Contentful account with access to the source space
- ✅ Node.js >= 14.0.0 installed
- ✅ Contentful Management API Token (CMA)
- ✅ Space ID of the source space
- ✅ Sufficient disk space (export can be several GB)

## Getting Management Token

### Step 1: Login to Contentful

Go to [Contentful Web App](https://app.contentful.com)

### Step 2: Navigate to Settings

1. Select your organization
2. Go to **Settings** → **API keys**
3. Navigate to **Content management tokens**

### Step 3: Generate Token

1. Click **Generate personal token**
2. Enter a descriptive name (e.g., "Export Token for US Space")
3. Click **Generate**
4. **Copy the token immediately** (it won't be shown again!)

⚠️ **Security**: Keep this token secure. Anyone with it can modify your space.

### Finding Your Space ID

1. In Contentful Web App, open your space
2. Go to **Settings** → **General settings**
3. Copy the **Space ID** (format: `abc123xyz456`)

## Export Methods

### Method 1: Using Contentful CLI (Recommended)

#### Installation

```bash
npm install -g contentful-cli
```

#### Basic Export

```bash
contentful space export \
  --space-id YOUR_SPACE_ID \
  --management-token YOUR_TOKEN \
  --export-dir ./contentful-export \
  --download-assets
```

#### Full Export with All Options

```bash
contentful space export \
  --space-id YOUR_SPACE_ID \
  --environment-id master \
  --management-token YOUR_TOKEN \
  --export-dir ./contentful-export \
  --download-assets \
  --max-allowed-limit 1000 \
  --use-verbose-renderer
```

### Method 2: Using contentful-export (Programmatic)

#### Installation

```bash
npm install contentful-export
```

#### Create Export Script

Create `export-from-contentful.js`:

```javascript
const contentfulExport = require('contentful-export');

const options = {
  spaceId: 'YOUR_SPACE_ID',
  environmentId: 'master',
  managementToken: 'YOUR_TOKEN',
  exportDir: './contentful-export',
  contentFile: 'exported-space.json',
  downloadAssets: true,
  maxAllowedLimit: 1000,
  saveFile: true,
  useVerboseRenderer: true
};

contentfulExport(options)
  .then((result) => {
    console.log('✅ Export completed successfully!');
    console.log('Exported:', result);
  })
  .catch((err) => {
    console.error('❌ Export failed:', err);
  });
```

#### Run Export

```bash
node export-from-contentful.js
```

### Method 3: Using Configuration File

#### Create export-config.json

```json
{
  "spaceId": "YOUR_SPACE_ID",
  "environmentId": "master",
  "managementToken": "YOUR_TOKEN",
  "exportDir": "./contentful-export",
  "contentFile": "exported-space.json",
  "downloadAssets": true,
  "includeDrafts": false,
  "includeArchived": false,
  "skipContentModel": false,
  "skipContent": false,
  "maxAllowedLimit": 1000,
  "useVerboseRenderer": true
}
```

#### Run with Config

```bash
npx contentful-export --config export-config.json
```

## Export Options

### Essential Options

| Option | Description | Recommended |
|--------|-------------|-------------|
| `spaceId` | Source space ID | Required |
| `managementToken` | CMA token | Required |
| `exportDir` | Output directory | `./contentful-export` |
| `downloadAssets` | Download asset files | `true` |

### Content Options

| Option | Description | Default |
|--------|-------------|---------|
| `includeDrafts` | Include draft entries | `false` |
| `includeArchived` | Include archived entries | `false` |
| `skipContentModel` | Skip content types | `false` |
| `skipContent` | Skip entries and assets | `false` |
| `skipRoles` | Skip roles | `false` |
| `skipWebhooks` | Skip webhooks | `false` |

### Advanced Options

| Option | Description | Default |
|--------|-------------|---------|
| `maxAllowedLimit` | Items per request | `1000` |
| `useVerboseRenderer` | Detailed progress | `false` |
| `contentFile` | JSON filename | `contentful-export.json` |
| `saveFile` | Save to disk | `true` |

### Query Options

#### Export Specific Content Types

```json
{
  "queryEntries": {
    "content_type": "blogPost"
  }
}
```

#### Export by Date Range

```json
{
  "queryEntries": {
    "sys.createdAt[gte]": "2023-01-01",
    "sys.createdAt[lte]": "2023-12-31"
  }
}
```

#### Export Specific Locales

```json
{
  "queryEntries": {
    "locale": "en-US"
  }
}
```

## Export Structure

After export, you'll have:

```
contentful-export/
├── exported-space.json          # Main export file
├── assets.ctfassets.net/        # Downloaded assets
│   └── SPACE_ID/
│       └── ASSET_ID/
│           └── HASH/
│               └── filename.ext
├── downloads.ctfassets.net/     # More assets
├── images.ctfassets.net/        # Image assets
└── videos.ctfassets.net/        # Video assets
```

### exported-space.json Structure

```json
{
  "contentTypes": [...],      // Content type definitions
  "entries": [...],           // Content entries
  "assets": [...],            // Asset metadata
  "locales": [...],           // Locale configurations
  "tags": [...],              // Tags
  "editorInterfaces": [...],  // Editor UI configs
  "webhooks": [...]           // Webhooks (if included)
}
```

## Best Practices

### 1. Always Download Assets

```bash
--download-assets true
```

Without this, you'll only get asset metadata, not the files.

### 2. Use Verbose Mode for Large Exports

```bash
--use-verbose-renderer
```

Shows detailed progress for long-running exports.

### 3. Export to Dedicated Directory

```bash
--export-dir ./contentful-export
```

Keep exports organized and avoid mixing with other files.

### 4. Test Export First

Start with a smaller export:

```bash
contentful space export \
  --space-id YOUR_SPACE_ID \
  --management-token YOUR_TOKEN \
  --export-dir ./test-export \
  --max-allowed-limit 100
```

### 5. Check Disk Space

Large exports can be several GB:

```bash
# Check available space (macOS/Linux)
df -h .

# Check available space (Windows)
dir
```

### 6. Document Your Export

Create a summary file:

```bash
echo "Exported on: $(date)" > contentful-export/EXPORT-INFO.txt
echo "Space ID: YOUR_SPACE_ID" >> contentful-export/EXPORT-INFO.txt
echo "Environment: master" >> contentful-export/EXPORT-INFO.txt
```

## Real-World Examples

### Example 1: Full Production Export

```bash
contentful space export \
  --space-id prod-abc123 \
  --environment-id master \
  --management-token CFPAT-xxx \
  --export-dir ./exports/prod-$(date +%Y%m%d) \
  --download-assets \
  --max-allowed-limit 1000 \
  --use-verbose-renderer
```

### Example 2: Export Without Drafts

```bash
contentful space export \
  --space-id YOUR_SPACE_ID \
  --management-token YOUR_TOKEN \
  --export-dir ./contentful-export \
  --download-assets \
  --include-drafts false
```

### Example 3: Export Specific Environment

```bash
contentful space export \
  --space-id YOUR_SPACE_ID \
  --environment-id staging \
  --management-token YOUR_TOKEN \
  --export-dir ./contentful-export-staging \
  --download-assets
```

### Example 4: Export for Migration

Perfect for batch migration:

```bash
contentful space export \
  --space-id us-space-123 \
  --environment-id production \
  --management-token CFPAT-xxx \
  --export-dir ./contentful-export \
  --download-assets true \
  --include-drafts false \
  --include-archived false \
  --max-allowed-limit 1000 \
  --use-verbose-renderer
```

## Common Issues

### Issue 1: Rate Limiting During Export

**Symptom**: Export fails with "Too many requests"

**Solution**:
```bash
# Reduce request limit
--max-allowed-limit 500
```

### Issue 2: Asset Download Failures

**Symptom**: Some assets fail to download

**Causes**:
- Network timeout
- Asset URL expired
- Permissions issue

**Solution**:
1. Re-run export (it will skip existing files)
2. Check asset URLs in Contentful
3. Verify network connectivity

### Issue 3: Out of Memory

**Symptom**: Export crashes with memory error

**Solution**:
```bash
# Increase Node.js memory
node --max-old-space-size=4096 export-script.js
```

### Issue 4: Large Export Takes Too Long

**Tips**:
- Run during off-peak hours
- Use `--max-allowed-limit 1000`
- Check network speed
- Consider exporting in smaller chunks

### Issue 5: Empty Asset URLs

**Symptom**: Assets have empty URLs in JSON

**Check**:
```bash
# Verify assets in Contentful UI
# Some assets might be processing or failed to upload originally
```

## Export Checklist

Before running batch migration, verify:

- [ ] Export completed successfully (no errors)
- [ ] `exported-space.json` exists and is valid JSON
- [ ] Asset directories exist (e.g., `assets.ctfassets.net/`)
- [ ] Asset files downloaded (check file count)
- [ ] Export size matches expectations
- [ ] All content types exported
- [ ] All locales exported
- [ ] Backup created (optional but recommended)

## Verify Export

### Check Export Summary

```bash
# Count content types
jq '.contentTypes | length' contentful-export/exported-space.json

# Count entries
jq '.entries | length' contentful-export/exported-space.json

# Count assets
jq '.assets | length' contentful-export/exported-space.json

# Count downloaded files
find contentful-export -type f -name "*.*" | wc -l
```

### Check File Sizes

```bash
# Total export size
du -sh contentful-export/

# JSON file size
du -sh contentful-export/exported-space.json

# Asset files size
du -sh contentful-export/*.ctfassets.net/
```

## Next Steps

After successful export:

1. ✅ Verify export integrity
2. ✅ Create a backup copy
3. ✅ Configure `batch-config.json`
4. ✅ Proceed to [IMPORT-GUIDE.md](IMPORT-GUIDE.md)

## Additional Resources

- [Contentful Export CLI](https://github.com/contentful/contentful-export)
- [Contentful CLI Documentation](https://github.com/contentful/contentful-cli)
- [Contentful Management API](https://www.contentful.com/developers/docs/references/content-management-api/)
- [Contentful Rate Limits](https://www.contentful.com/developers/docs/references/content-management-api/#/introduction/rate-limits)

---

**Need help?** Open an issue on [GitHub](https://github.com/faisalbasra/contentful-batch-migrator/issues)
