# Client-Side Rate Limiting

## Overview

The `feat/clientside-ratelimiter` branch introduces **client-side rate limiting** to ensure your migration respects Contentful's API rate limits without triggering 429 errors.

## Why Rate Limiting?

### The Problem

Without rate limiting, the tool would make API requests as fast as possible:

```
Importing 400 assets:
- Each asset needs ~4 API calls (create, process, check status, publish)
- 400 × 4 = 1,600 API calls
- If completed in 1 minute = ~26.7 requests/second
- ❌ EXCEEDS Contentful's 10 req/sec limit!
```

### The Solution

Client-side rate limiter enforces 10 requests/second DURING each batch import:

```
With rate limiting:
- 1,600 API calls ÷ 10 req/sec = 160 seconds minimum
- Each batch takes ~3 minutes instead of 1 minute
- ✅ STAYS UNDER 10 req/sec limit!
```

## Multi-Layer Protection

The tool uses a **6-layer defensive strategy**:

| Layer | Type | What It Does | Time Scale |
|-------|------|--------------|------------|
| 1. Batch Splitting | Macro | Splits 4000 assets into 400-asset batches | Per migration |
| 2. Sequential Processing | Macro | Processes one batch at a time | Per migration |
| 3. Inter-batch Delays | Macro | 3-minute wait between batches | Minutes |
| 4. **Rate Limiter** ⭐ | **Micro** | **10 req/sec within each batch** | **Seconds** |
| 5. Retry with Backoff | Safety | 3 retries with exponential delays | Per failure |
| 6. State Persistence | Recovery | Resume from last successful batch | Per run |

## Configuration

### Enable Rate Limiting

Add to your `batch-config.json`:

```json
{
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
| `enabled` | Enable/disable rate limiting | `true` | `true` |
| `requestsPerSecond` | Max requests per second | `10` | `10` |
| `requestsPerHour` | Max requests per hour | `36000` | `36000` |
| `verbose` | Log throttling messages | `true` | `true` for debugging |

### Disable Rate Limiting

If you want to disable rate limiting (not recommended):

```json
{
  "rateLimits": {
    "enabled": false
  }
}
```

## How It Works

### Token Bucket Algorithm

The rate limiter uses a **token bucket algorithm**:

1. **Buckets**: Two buckets (per-second and per-hour)
2. **Capacity**: Each bucket holds max tokens (10 and 36,000)
3. **Refill**: Tokens refill continuously based on rate
4. **Consume**: Each API call consumes 1 token from BOTH buckets
5. **Wait**: If no tokens available, waits until refilled

### Example Flow

```javascript
// Create rate limiter
const rateLimiter = new RateLimiter({
  requestsPerSecond: 10,
  requestsPerHour: 36000
});

// Wrap API calls
await rateLimiter.throttle(async () => {
  return await environment.createAsset(asset);
});

// Automatically enforces limits:
// - First 10 calls: Instant (use initial tokens)
// - Calls 11-20: Wait ~1 second (bucket refills)
// - Calls 21-30: Wait ~1 second
// - ... and so on
```

### Visual Example

```
Time (seconds)    Tokens Available    Action
-------------------------------------------------
0.0               10 tokens           ✅ Call 1-10 (instant)
0.1               0 tokens            ⏳ Wait for refill
1.0               10 tokens           ✅ Call 11-20
2.0               10 tokens           ✅ Call 21-30
3.0               10 tokens           ✅ Call 31-40
...
```

## Performance Impact

### With Rate Limiting (Safer)

```
Per Batch (400 assets):
- API calls: ~1,600 (assets) + ~800 (entries) = ~2,400 calls
- Time: 2,400 ÷ 10 = 240 seconds = 4 minutes minimum
- Actual: ~20-30 minutes (includes processing time, retries)

Full Migration (7 batches):
- Batch time: 7 × 25 minutes = 175 minutes (~3 hours)
- Inter-batch delays: 6 × 3 minutes = 18 minutes
- Total: ~3-5 hours
- Success rate: ~100% ✅
```

### Without Rate Limiting (Risky)

```
Per Batch (400 assets):
- API calls: ~2,400 calls as fast as possible
- Time: ~1-2 minutes (burst)
- Result: Likely 429 errors ❌

Full Migration:
- High chance of failures
- Requires manual retries
- Unpredictable completion time
- Success rate: Variable 📉
```

## Monitoring

### Console Output

With `verbose: true`, you'll see throttling messages:

```
⏱️  Rate Limiter: 10 req/sec, 36000 req/hour
🔌 Connecting to Contentful...
✅ Connected to space: abc123, environment: master

📐 Importing Content Model...
  📋 Importing 60 content types...
    ✅ Content Type: Article
  ⏳ Rate limit (per-second): waiting 100ms...
    ✅ Content Type: Author
    ✅ Content Type: Category
  ⏳ Rate limit (per-second): waiting 50ms...
...
```

### Statistics

At the end of each batch:

```
📊 Rate Limiter Statistics:
  - Total requests: 2,438
  - Throttled requests: 2,428
  - Total wait time: 242.5s
  - Runtime: 243.1s
  - Avg rate: 10.00 req/s
  - Remaining tokens (second): 9.87
  - Remaining tokens (hour): 33562
```

## Advanced Features

### Dynamic Adjustment

The rate limiter can read Contentful's rate limit headers:

```javascript
// Contentful returns:
// X-Contentful-RateLimit-Second-Remaining: 7
// X-Contentful-RateLimit-Hour-Remaining: 35990

rateLimiter.updateFromHeaders(response.headers);
// Automatically adjusts tokens to match actual limits
```

### 429 Error Handling

If a 429 error occurs despite rate limiting:

```javascript
// Automatic behavior:
1. Catches 429 error
2. Waits 60 seconds
3. Resets token buckets to be conservative
4. Retries the operation
```

### Burst Allowance

The token bucket allows **controlled bursts**:

- First 10 requests can execute immediately (uses initial tokens)
- Useful for small operations (importing locales, tags)
- Still maintains average rate of 10 req/sec

## Troubleshooting

### Still Getting 429 Errors?

1. **Reduce rate limit**:
   ```json
   {
     "rateLimits": {
       "requestsPerSecond": 7
     }
   }
   ```

2. **Increase inter-batch delays**:
   ```json
   {
     "importOptions": {
       "delayBetweenBatches": 300000
     }
   }
   ```

3. **Reduce batch size**:
   ```json
   {
     "batchSize": 200
   }
   ```

### Rate Limiter Too Slow?

If you have higher rate limits (enterprise plan):

```json
{
  "rateLimits": {
    "requestsPerSecond": 20,
    "requestsPerHour": 72000
  }
}
```

Check your Contentful plan's rate limits before adjusting!

### Verbose Logging Too Noisy?

Disable verbose logging:

```json
{
  "rateLimits": {
    "verbose": false
  }
}
```

## Testing Rate Limiter

Test the rate limiter module directly:

```bash
node -e "
const RateLimiter = require('./bin/rateLimiter');

async function test() {
  const limiter = new RateLimiter({
    requestsPerSecond: 10,
    verbose: true
  });

  console.log('Testing 25 requests...');
  const start = Date.now();

  for (let i = 0; i < 25; i++) {
    await limiter.throttle(async () => {
      return new Promise(r => setTimeout(r, 10));
    });
  }

  const elapsed = (Date.now() - start) / 1000;
  console.log(\`Completed in \${elapsed}s (expected: ~2.5s)\`);
  limiter.printStats();
}

test();
"
```

## Implementation Details

### Files Changed

- **`bin/rateLimiter.js`** (NEW): Token bucket rate limiter module
- **`bin/import.js`** (REWRITTEN): Uses SDK directly with rate limiter
- **`batch-config.example.json`** (UPDATED): Added rateLimits configuration

### Key Code Changes

**Before** (import.js):
```javascript
// Spawned contentful-import CLI
const importProcess = spawn('npx', [
  'contentful-import',
  '--config',
  batchConfigPath
]);
```

**After** (import.js):
```javascript
// Uses SDK directly with rate limiter
const rateLimiter = new RateLimiter({ ... });

await rateLimiter.throttle(async () => {
  return await environment.createAsset(asset);
});
```

## Best Practices

1. **Always enable rate limiting** for production migrations
2. **Start with default settings** (10 req/sec)
3. **Monitor first batch** before running full migration
4. **Enable verbose logging** initially for visibility
5. **Adjust only if needed** based on actual results
6. **Keep inter-batch delays** even with rate limiting

## FAQ

**Q: Why keep inter-batch delays if we have rate limiting?**
A: Layers of defense. Rate limiting prevents bursts within a batch. Inter-batch delays give the API server resources time to recover.

**Q: Can I disable rate limiting?**
A: Yes, but not recommended. You'll likely hit 429 errors on large migrations.

**Q: Does rate limiting slow down migrations?**
A: Yes, by ~2-3x per batch. But it prevents failures, which saves time overall.

**Q: What if I have Contentful Enterprise with higher limits?**
A: Adjust `requestsPerSecond` and `requestsPerHour` to match your plan's limits.

**Q: Does the rate limiter account for other API clients?**
A: No. It only tracks requests from this tool. If you have other services using the same API, be more conservative.

**Q: Can I use rate limiting with contentful-import CLI?**
A: No. This implementation requires using the SDK directly to wrap each API call.

## Related Documentation

- [Contentful Rate Limits](https://www.contentful.com/developers/docs/references/content-management-api/#/introduction/rate-limits)
- [Token Bucket Algorithm](https://en.wikipedia.org/wiki/Token_bucket)
- [Import Guide](./IMPORT-GUIDE.md)
- [Troubleshooting](./TROUBLESHOOTING.md)

---

**Branch**: `feat/clientside-ratelimiter`
**Status**: Ready for testing
**Last Updated**: 2025-10-29
