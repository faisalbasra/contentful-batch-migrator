#!/usr/bin/env node

/**
 * Token Bucket Rate Limiter for Contentful API
 *
 * Implements a token bucket algorithm to respect Contentful's rate limits:
 * - 10 requests per second (default)
 * - 36,000 requests per hour (default)
 *
 * The token bucket allows burst requests up to the capacity while maintaining
 * the average rate over time.
 */

class RateLimiter {
  constructor(options = {}) {
    // Rate limits
    this.requestsPerSecond = options.requestsPerSecond || 10;
    this.requestsPerHour = options.requestsPerHour || 36000;

    // Token buckets for per-second and per-hour limits
    this.secondBucket = {
      capacity: this.requestsPerSecond,
      tokens: this.requestsPerSecond,
      refillRate: this.requestsPerSecond, // tokens per second
      lastRefill: Date.now()
    };

    this.hourBucket = {
      capacity: this.requestsPerHour,
      tokens: this.requestsPerHour,
      refillRate: this.requestsPerHour / 3600, // tokens per second
      lastRefill: Date.now()
    };

    // Statistics
    this.stats = {
      totalRequests: 0,
      totalWaitTime: 0,
      throttledRequests: 0,
      startTime: Date.now()
    };

    // Enable/disable logging
    this.verbose = options.verbose !== false;
  }

  /**
   * Refill tokens in a bucket based on time passed
   */
  refillBucket(bucket) {
    const now = Date.now();
    const timePassed = (now - bucket.lastRefill) / 1000; // seconds
    const tokensToAdd = timePassed * bucket.refillRate;

    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  /**
   * Wait until a token is available in the bucket
   */
  async waitForToken(bucket, bucketName) {
    this.refillBucket(bucket);

    if (bucket.tokens < 1) {
      // Calculate wait time
      const tokensNeeded = 1 - bucket.tokens;
      const waitTime = Math.ceil((tokensNeeded / bucket.refillRate) * 1000);

      if (this.verbose) {
        console.log(`  ⏳ Rate limit (${bucketName}): waiting ${waitTime}ms...`);
      }

      this.stats.throttledRequests++;
      this.stats.totalWaitTime += waitTime;

      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Refill after waiting
      this.refillBucket(bucket);
    }

    // Consume one token
    bucket.tokens -= 1;
  }

  /**
   * Throttle a function call to respect rate limits
   *
   * @param {Function} fn - Async function to execute
   * @returns {Promise} - Result of the function
   */
  async throttle(fn) {
    // Wait for both per-second and per-hour tokens
    await this.waitForToken(this.secondBucket, 'per-second');
    await this.waitForToken(this.hourBucket, 'per-hour');

    // Track stats
    this.stats.totalRequests++;

    // Execute the function
    try {
      return await fn();
    } catch (error) {
      // If we get a 429 (rate limit error), we should wait longer
      if (error.status === 429 || error.statusCode === 429) {
        if (this.verbose) {
          console.warn('  ⚠️  Received 429 (rate limit exceeded), waiting 60 seconds...');
        }
        await new Promise(resolve => setTimeout(resolve, 60000));

        // Reset buckets to be conservative
        this.secondBucket.tokens = 0;
        this.hourBucket.tokens = Math.min(this.hourBucket.tokens, this.hourBucket.capacity * 0.5);
      }
      throw error;
    }
  }

  /**
   * Get current rate limiter statistics
   */
  getStats() {
    const runtimeSeconds = (Date.now() - this.stats.startTime) / 1000;
    const avgRequestsPerSecond = this.stats.totalRequests / runtimeSeconds;

    return {
      totalRequests: this.stats.totalRequests,
      totalWaitTime: this.stats.totalWaitTime,
      throttledRequests: this.stats.throttledRequests,
      runtime: runtimeSeconds,
      avgRequestsPerSecond: avgRequestsPerSecond.toFixed(2),
      secondBucketTokens: this.secondBucket.tokens.toFixed(2),
      hourBucketTokens: Math.floor(this.hourBucket.tokens)
    };
  }

  /**
   * Print statistics to console
   */
  printStats() {
    const stats = this.getStats();
    console.log('\n📊 Rate Limiter Statistics:');
    console.log(`  - Total requests: ${stats.totalRequests}`);
    console.log(`  - Throttled requests: ${stats.throttledRequests}`);
    console.log(`  - Total wait time: ${(stats.totalWaitTime / 1000).toFixed(1)}s`);
    console.log(`  - Runtime: ${stats.runtime.toFixed(1)}s`);
    console.log(`  - Avg rate: ${stats.avgRequestsPerSecond} req/s`);
    console.log(`  - Remaining tokens (second): ${stats.secondBucketTokens}`);
    console.log(`  - Remaining tokens (hour): ${stats.hourBucketTokens}`);
  }

  /**
   * Update rate limits from Contentful response headers
   * This allows dynamic adjustment based on actual API limits
   */
  updateFromHeaders(headers) {
    // Contentful returns these headers:
    // X-Contentful-RateLimit-Second-Limit: 10
    // X-Contentful-RateLimit-Second-Remaining: 7
    // X-Contentful-RateLimit-Hour-Limit: 36000
    // X-Contentful-RateLimit-Hour-Remaining: 35990

    const secondRemaining = parseInt(headers['x-contentful-ratelimit-second-remaining']);
    const hourRemaining = parseInt(headers['x-contentful-ratelimit-hour-remaining']);

    if (!isNaN(secondRemaining)) {
      this.secondBucket.tokens = Math.min(this.secondBucket.tokens, secondRemaining);
    }

    if (!isNaN(hourRemaining)) {
      this.hourBucket.tokens = Math.min(this.hourBucket.tokens, hourRemaining);
    }

    if (this.verbose && (secondRemaining < 3 || hourRemaining < 100)) {
      console.warn(`  ⚠️  Low rate limit: ${secondRemaining}/sec, ${hourRemaining}/hour remaining`);
    }
  }
}

module.exports = RateLimiter;
