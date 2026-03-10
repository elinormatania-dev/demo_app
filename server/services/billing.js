import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { bigquery } from './bigquery.js';
import { generateBillingQuery, generateBreakdownQuery } from '../queries/billing.js';
import { getDummyBillingData, getDummyBreakdown } from '../dummy/billing.js';
import { applyPricing } from './pricing.js';
import * as cache from '../middleware/cache.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPANIES_FILE = join(__dirname, '../data/companies.json');

/**
 * Returns the companies.json entry for a given BQ company ID, or null if not found.
 */
function getCompany(bqCompanyId) {
  const companies = JSON.parse(readFileSync(COMPANIES_FILE, 'utf-8'));
  return companies.find(c => c.bqCompanyId === bqCompanyId) ?? null;
}

/**
 * Returns service-level action counts for a single time period.
 *
 * @param {string} companyId
 * @param {string} periodStart  - 'YYYY-MM-DD'
 * @param {string} timeUnit     - 'YEAR' | 'QUARTER' | 'MONTH'
 * @param {object} filters      - { serviceName? }
 */
export async function getBreakdown(companyId, periodStart, timeUnit, filters = {}) {
  const company = getCompany(companyId);
  const rules   = company?.billing_rules ?? {};

  const cacheKey = cache.key('billing-breakdown', { companyId, periodStart, timeUnit, ...filters });
  return cache.wrap(cacheKey, async () => {
    if (process.env.USE_DUMMY_DATA === 'true') {
      return getDummyBreakdown(companyId, periodStart, timeUnit, filters, rules);
    }
    const query = generateBreakdownQuery(timeUnit, filters, rules);
    const params = { companyId, periodStart, ...filters };
    const [rows] = await bigquery.query({ query, params, location: 'US' });
    return rows;
  });
}

/**
 * Returns aggregated billing data grouped by the requested time unit.
 * Raw counts are fetched (and cached), then pricing is applied in JS.
 *
 * @param {string} companyId
 * @param {string} timeUnit   - 'YEAR' | 'QUARTER' | 'MONTH'
 * @param {object} filters    - { serviceName?, dateFrom?, dateTo? }
 */
export async function getBillingData(companyId, timeUnit = 'MONTH', filters = {}) {
  const company = getCompany(companyId);
  const rules   = company?.billing_rules ?? {};

  // Cache stores raw counts so pricing changes don't require cache invalidation
  const cacheKey = cache.key('billing', { companyId, timeUnit, ...filters });
  const rawRows = await cache.wrap(cacheKey, async () => {
    if (process.env.USE_DUMMY_DATA === 'true') {
      return getDummyBillingData(companyId, timeUnit, filters, rules);
    }
    const query  = generateBillingQuery(timeUnit, filters, rules);
    const params = { companyId, ...filters };
    const [rows] = await bigquery.query({ query, params, location: 'US' });
    return rows;
  });

  // Apply pricing outside the cache — changing tiers takes effect immediately on restart
  return company ? applyPricing(rawRows, company) : rawRows;
}
