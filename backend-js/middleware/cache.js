import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '../cache');
const TTL_MS = (Number(process.env.CACHE_TTL_SECONDS) || 300) * 1000; // default 5 min

function cacheFile(domain) {
  return join(CACHE_DIR, `${domain}.json`);
}

function readStore(domain) {
  const file = cacheFile(domain);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return {};
  }
}

function writeStore(domain, store) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cacheFile(domain), JSON.stringify(store));
}

/**
 * Builds a stable cache key string.
 *
 * @param {string} domain  - e.g. 'billing'
 * @param {object} params  - any serialisable params object
 * @returns {string}       - "{domain}:{hash}"
 */
export function key(domain, params) {
  const hash = createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex')
    .slice(0, 16);
  return `${domain}:${hash}`;
}

/**
 * Returns the cached value if still valid, otherwise calls `fn`, caches the result, and returns it.
 *
 * @param {string}   cacheKey  - from cache.key()
 * @param {Function} fn        - async function that fetches the real data
 */
export async function wrap(cacheKey, fn) {
  const [domain] = cacheKey.split(':');
  const store = readStore(domain);
  const entry = store[cacheKey];

  if (entry && entry.expiresAt > Date.now()) {
    return entry.value;
  }

  const value = await fn();
  store[cacheKey] = { value, expiresAt: Date.now() + TTL_MS };
  writeStore(domain, store);
  return value;
}

/**
 * Wipes all cached entries for a domain.
 */
export function invalidate(domain) {
  writeStore(domain, {});
}
