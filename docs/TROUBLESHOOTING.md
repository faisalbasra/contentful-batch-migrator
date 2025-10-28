# Troubleshooting Guide

Common issues and solutions for Contentful Batch Migrator.

## 📋 Table of Contents

- [Rate Limiting Issues](#rate-limiting-issues)
- [Import Failures](#import-failures)
- [Asset Upload Problems](#asset-upload-problems)
- [Validation Errors](#validation-errors)
- [Memory Issues](#memory-issues)
- [Configuration Problems](#configuration-problems)
- [Network Issues](#network-issues)
- [Data Issues](#data-issues)

## Rate Limiting Issues

### Issue: 429 Too Many Requests

**Symptoms:**
```
Error: Rate limit exceeded (429)
Failed to import batch: Request limit reached
```

**Causes:**
- Batch size too large
- Delay between batches too short
- Contentful API rate limits hit

**Solutions:**

**Solution 1: Increase Delay Between Batches**

Edit `batch-config.json`:

```json
{
  "importOptions": {
    "delayBetweenBatches": 300000  // 5 minutes (was 3 minutes)
  }
}
```

**Solution 2: Reduce Batch Size**

```json
{
  "batchSize": 400  // Reduced from 600
}
```

Then re-split and import:

```bash
rm -rf batches/
npm run split
npm run import
```

**Solution 3: Increase Max Retries**

```json
{
  "importOptions": {
    "maxRetries": 5,       // Increased from 3
    "retryDelay": 10000    // 10 seconds
  }
}
```

**Recommended Configuration for Large Imports:**

```json
{
  "batchSize": 500,
  "importOptions": {
    "delayBetweenBatches": 240000,  // 4 minutes
    "maxRetries": 5,
    "retryDelay": 8000
  }
}
```

### Issue: API Rate Limit Headers Warning

**Symptoms:**
```
Warning: Approaching rate limit (X-Contentful-RateLimit-Second-Remaining: 5)
```

**Solution:**

The scripts automatically implement exponential backoff. If you see this frequently:

1. Increase delays
2. Reduce batch size
3. Run imports during off-peak hours

## Import Failures

### Issue: Single Batch Import Fails

**Symptoms:**
```
❌ Error importing batch 04: Import process exited with code 1
❌ Batch 04 failed after 3 retries
```

**Investigation:**

1. **Check Error Logs:**
   ```bash
   cat batches/logs/batch-04-errors.log
   ```

2. **Check Import State:**
   ```bash
   cat batches/import-state.json
   ```

**Common Causes & Solutions:**

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `Validation error` | Invalid data | Check asset URLs, fix data |
| `Entry not found` | Missing reference | Import in different order |
| `Asset processing failed` | Asset file issue | Verify file exists |
| `Network error` | Connection problem | Check network, retry |

**Solution: Resume Import**

```bash
npm run resume
```

### Issue: Import Hangs/Freezes

**Symptoms:**
- Import stops progressing
- No output for > 30 minutes
- Process appears stuck

**Solution:**

1. **Stop the Process:**
   ```bash
   # Press Ctrl+C
   ^C
   ```

2. **Check What Imported:**
   ```bash
   cat batches/import-state.json
   ```

3. **Resume:**
   ```bash
   npm run resume
   ```

4. **If Still Hangs:**
   ```bash
   # Manually import problematic batch
   cd batches/batch-04
   npx contentful-import --config import-config.json
   ```

### Issue: All Batches Fail

**Symptoms:**
```
❌ Failed: 8
All batches failed to import
```

**Likely Causes:**
- Invalid management token
- Wrong space ID
- Network/firewall issues
- Contentful API outage

**Investigation:**

1. **Verify Credentials:**
   ```bash
   # Test management token
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://api.contentful.com/spaces/YOUR_SPACE_ID
   ```

2. **Check Contentful Status:**
   - Visit: https://www.contentfulstatus.com

3. **Verify Configuration:**
   ```bash
   cat batch-config.json
   ```

4. **Test Small Import:**
   ```bash
   # Try importing just batch 1
   npm run import --start-from 1
   # Stop after batch 1 completes
   ```

## Asset Upload Problems

### Issue: Assets Not Uploading

**Symptoms:**
```
⚠️ Asset upload failed: File not found
Asset processing incomplete
```

**Investigation:**

1. **Check Asset Files Exist:**
   ```bash
   ls -la batches/batch-01/images.ctfassets.net/
   ```

2. **Verify File Paths in JSON:**
   ```bash
   # Check asset URLs in batch JSON
   jq '.assets[0].fields.file' batches/batch-01/exported-space.json
   ```

**Solutions:**

**Solution 1: Verify Files Copied**

```bash
# Check if asset files were copied during split
find batches/batch-01 -type f -name "*" | wc -l
```

If count is low, re-run split:

```bash
rm -rf batches/
npm run split
```

**Solution 2: Check Asset URLs**

```bash
# Find assets with empty URLs
jq '.assets[] | select(.fields.file["nb-NO"].url == "")' \
  contentful-export/exported-space.json
```

Fix in source or skip these assets.

**Solution 3: Manual Asset Upload**

For specific failed assets:

1. Find asset in Contentful UI
2. Upload file manually
3. Continue import

### Issue: Asset Processing Timeout

**Symptoms:**
```
Asset upload timed out
Asset still processing after 10 minutes
```

**Solution:**

1. **Wait and Retry:**
   ```bash
   # Contentful may still be processing
   # Wait 15-30 minutes
   npm run resume
   ```

2. **Check Asset in UI:**
   - Go to target space
   - Navigate to Media
   - Check asset status

3. **Re-upload if Failed:**
   - Delete failed asset
   - Re-import batch

### Issue: Large Asset Upload Fails

**Symptoms:**
```
Error uploading asset: File too large
Request entity too large (413)
```

**Causes:**
- Asset exceeds Contentful limits
- Network timeout on large files

**Solution:**

1. **Check Contentful Limits:**
   - Max file size: Usually 50MB
   - Varies by plan

2. **Split Large Assets:**
   - Compress images/videos
   - Use external CDN for very large files
   - Reference via URL instead of upload

## Validation Errors

### Issue: Count Mismatch

**Symptoms:**
```
❌ Assets    Source: 4126 | Target: 4000 | Diff: -126
Validation failed!
```

**Investigation:**

1. **Check Failed Batches:**
   ```bash
   jq '.failedBatches' batches/import-state.json
   ```

2. **Review Error Logs:**
   ```bash
   ls -la batches/logs/*-errors.log
   grep -i "error" batches/logs/*.log
   ```

3. **Manually Count in Contentful:**
   - Go to target space
   - Count assets/entries manually
   - Compare with source

**Solutions:**

**Solution 1: Retry Failed Batches**

```bash
npm run resume
```

**Solution 2: Identify Missing Items**

```bash
# Compare source vs target
# Get all asset IDs from source
jq '.assets[].sys.id' contentful-export/exported-space.json > source-assets.txt

# Get all asset IDs from target (manual API call needed)
# Then compare files
```

**Solution 3: Re-import Missing Batches**

If specific batches failed:

```bash
# Manually import failed batch
cd batches/batch-05
npx contentful-import --config import-config.json
```

### Issue: Entries Exist but Assets Missing

**Symptoms:**
```
✅ Entries    Source: 11985 | Target: 11985 | Diff: 0
❌ Assets     Source: 4126  | Target: 3800  | Diff: -326
```

**Cause:** Asset upload failures

**Solution:**

1. **Find Failed Asset Batches:**
   ```bash
   grep -i "asset" batches/logs/*-errors.log
   ```

2. **Re-import Asset-Heavy Batches:**
   ```bash
   # Identify which batches had most assets
   cat batches/manifest.json

   # Re-import those batches
   npm run import --start-from 3  # Example
   ```

## Memory Issues

### Issue: Out of Memory During Split

**Symptoms:**
```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

**Solution:**

```bash
# Increase Node.js memory limit
node --max-old-space-size=4096 split-contentful-export.js

# For very large exports (>100MB)
node --max-old-space-size=8192 split-contentful-export.js
```

### Issue: Out of Memory During Import

**Solution:**

```bash
node --max-old-space-size=4096 import-batches.js
```

### Issue: System Running Out of Disk Space

**Symptoms:**
```
Error: ENOSPC: no space left on device
```

**Check Disk Space:**

```bash
# macOS/Linux
df -h .

# Windows
dir
```

**Solution:**

1. **Free Up Space:**
   - Delete old exports
   - Remove temporary files
   - Clean up Docker images (if using)

2. **Use External Drive:**
   ```bash
   # Move export to external drive
   mv contentful-export /Volumes/External/
   ln -s /Volumes/External/contentful-export .
   ```

## Configuration Problems

### Issue: Invalid Management Token

**Symptoms:**
```
Error: Unauthorized (401)
Invalid credentials
```

**Solution:**

1. **Verify Token:**
   ```bash
   # Test token with curl
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://api.contentful.com/spaces
   ```

2. **Generate New Token:**
   - Go to Contentful UI
   - Settings → API Keys → Content management tokens
   - Generate new token
   - Update `batch-config.json`

### Issue: Wrong Space ID

**Symptoms:**
```
Error: Space not found (404)
```

**Solution:**

1. **Verify Space ID:**
   - Contentful UI → Settings → General settings
   - Copy correct Space ID

2. **Update Configuration:**
   ```json
   {
     "targetSpace": {
       "spaceId": "CORRECT_SPACE_ID"
     }
   }
   ```

### Issue: Wrong Environment

**Symptoms:**
```
Error: Environment 'staging' not found
```

**Solution:**

1. **List Environments:**
   ```bash
   npx contentful space environment list \
     --space-id YOUR_SPACE_ID \
     --management-token YOUR_TOKEN
   ```

2. **Create Environment (if needed):**
   ```bash
   npx contentful space environment create \
     --space-id YOUR_SPACE_ID \
     --environment-id staging \
     --name "Staging" \
     --source master
   ```

### Issue: Wrong API Host (Region)

**Symptoms:**
```
Error: getaddrinfo ENOTFOUND api.eu.contentful.com
Import very slow or failing
```

**Solution:**

Verify correct host for your space:

- US spaces: `api.contentful.com`
- EU spaces: `api.eu.contentful.com`

Update `batch-config.json`:

```json
{
  "targetSpace": {
    "host": "api.contentful.com"  // or api.eu.contentful.com
  }
}
```

## Network Issues

### Issue: Connection Timeout

**Symptoms:**
```
Error: ETIMEDOUT
Connection timeout
```

**Solutions:**

1. **Check Internet Connection**
2. **Verify Firewall Settings**
3. **Try Different Network**
4. **Increase Timeout (if configurable)**

### Issue: SSL/TLS Errors

**Symptoms:**
```
Error: unable to verify the first certificate
SSL error
```

**Solution:**

```bash
# Temporary fix (not recommended for production)
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Better: Update Node.js or system certificates
npm update -g
```

### Issue: Proxy Problems

**Symptoms:**
```
Error: Proxy connection failed
```

**Solution:**

```bash
# Set proxy environment variables
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080

# Or configure in .npmrc
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080
```

## Data Issues

### Issue: Empty Asset URLs

**Symptoms:**
```
Validation error: "assets[933].fields.file.nb-NO.url" is not allowed to be empty
```

**Cause:** Assets in source space have no uploaded file

**Solution:**

1. **Find Empty Asset URLs:**
   ```bash
   jq '.assets[] | select(.fields.file["nb-NO"].url == "") | .sys.id' \
     contentful-export/exported-space.json
   ```

2. **Fix in Source Space:**
   - Upload files to these assets
   - Re-export

3. **Or Skip These Assets:**
   - Manually remove from export JSON
   - Document which assets were skipped

### Issue: Circular References

**Symptoms:**
```
Error: Maximum call stack size exceeded
Circular reference detected
```

**Solution:**

The splitter handles most circular references automatically. If you encounter this:

1. **Check Entry References:**
   ```bash
   # Find entries referencing themselves
   jq '.entries[] | select(.fields.relatedEntry["nb-NO"].sys.id == .sys.id)' \
     contentful-export/exported-space.json
   ```

2. **Break Circular References:**
   - Import content model first
   - Import entries without references
   - Update references in second pass

### Issue: Missing Content Types

**Symptoms:**
```
Error: Content type 'blogPost' not found
Cannot create entry: content type missing
```

**Cause:** Content type not imported in batch 1

**Solution:**

1. **Verify Batch 1:**
   ```bash
   jq '.contentTypes | length' batches/batch-01/exported-space.json
   ```

2. **Re-split if Needed:**
   ```bash
   rm -rf batches/
   npm run split
   ```

3. **Ensure Batch 1 Imports First:**
   ```bash
   npm run import --start-from 1
   ```

## Getting Help

### Collect Diagnostic Information

When reporting issues, include:

```bash
# 1. Node version
node --version

# 2. Package versions
npm list contentful-import contentful-management

# 3. Configuration (remove token!)
cat batch-config.json | sed 's/"managementToken": ".*"/"managementToken": "REDACTED"/'

# 4. Error logs
cat batches/logs/*-errors.log

# 5. Import state
cat batches/import-state.json

# 6. Manifest
cat batches/manifest.json
```

### Where to Get Help

1. **Documentation:**
   - [README.md](../README.md)
   - [EXPORT-GUIDE.md](EXPORT-GUIDE.md)
   - [IMPORT-GUIDE.md](IMPORT-GUIDE.md)

2. **GitHub:**
   - [Issues](https://github.com/faisalbasra/contentful-batch-migrator/issues)
   - [Discussions](https://github.com/faisalbasra/contentful-batch-migrator/discussions)

3. **Contentful:**
   - [Documentation](https://www.contentful.com/developers/docs/)
   - [Support](https://www.contentful.com/support/)
   - [Status Page](https://www.contentfulstatus.com)

## Common Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| `401 Unauthorized` | Invalid token | Check token in config |
| `404 Not Found` | Wrong space/environment ID | Verify IDs |
| `429 Too Many Requests` | Rate limit hit | Increase delays, reduce batch size |
| `413 Payload Too Large` | File too large | Compress or split assets |
| `500 Internal Server Error` | Contentful API issue | Wait and retry, check status |
| `ECONNREFUSED` | Network issue | Check connection |
| `ETIMEDOUT` | Request timeout | Check network, retry |
| `ENOSPC` | Out of disk space | Free up space |
| `Heap out of memory` | Out of RAM | Increase Node memory |

## Prevention Tips

1. **Test First:**
   - Start with small batch (100 items)
   - Test on staging environment
   - Verify before full migration

2. **Monitor During Import:**
   - Watch logs in real-time
   - Check Contentful UI
   - Monitor system resources

3. **Have Backup Plan:**
   - Keep source export safe
   - Document process
   - Know how to rollback

4. **Regular Validation:**
   - Validate after each batch (manual check)
   - Full validation at end
   - Spot-check content

---

**Still stuck?** Open an issue with full diagnostic info: [GitHub Issues](https://github.com/faisalbasra/contentful-batch-migrator/issues)
