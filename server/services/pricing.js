/**
 * Pure pricing calculator — no BQ, no cache, no side effects.
 *
 * Supports three pricing models (set via company.billing_rules.pricing_model):
 *
 *   flat            — txCount × SingalActionCost, floored at minMonthlyCost
 *   tiered_volume   — find the tier bracket that contains txCount, price ALL units at that rate
 *   tiered_marginal — each unit priced at the rate of its own bracket (progressive / tax-bracket style)
 *
 * When company.billing_rules.service_pricing is defined, use applyServicePricing instead.
 * The SQL layer returns raw per-service counts; JS multiplies each by its specific price.
 */

function toTimeLabel(periodStart, timeUnit) {
  const [y, m] = periodStart.split('-').map(Number);
  if (timeUnit === 'YEAR')    return String(y);
  if (timeUnit === 'QUARTER') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Calculates the payment for a single month given a transaction count and company config.
 *
 * @param {number} txCount   - number of billable transactions in the month
 * @param {object} company   - entry from companies.json
 * @returns {number}         - total payment for the month (in company.currency)
 */
export function calculateMonthlyPayment(txCount, company) {
  const { levels = [], minMonthlyCost = 0, SingalActionCost = 0 } = company;
  const pricingModel = company.billing_rules?.pricing_model ?? (levels.length ? 'tiered_volume' : 'flat');

  let payment = 0;

  if (pricingModel === 'flat' || levels.length === 0) {
    payment = txCount * SingalActionCost;

  } else if (pricingModel === 'tiered_volume') {
    // Find the tier that contains txCount; price all units at that tier's rate
    const tier = levels.find(t => txCount >= t.from && (t.to === null || txCount <= t.to));
    if (tier) {
      payment = txCount * tier.actionCost;
    } else {
      // txCount is below the first tier — use SingalActionCost as fallback
      payment = txCount * SingalActionCost;
    }

  } else if (pricingModel === 'tiered_marginal') {
    // Each unit priced at the rate of its own bracket
    let remaining = txCount;
    for (const tier of levels) {
      if (remaining <= 0) break;
      const tierMax = tier.to ?? Infinity;
      const unitsInTier = Math.min(remaining, tierMax - tier.from + 1);
      if (unitsInTier > 0) {
        payment += unitsInTier * tier.actionCost;
        remaining -= unitsInTier;
      }
    }
  }

  return Math.max(minMonthlyCost, Math.round(payment * 100) / 100);
}

/**
 * Applies per-period pricing to an array of raw count rows.
 * Adds `total_payment` and `currency` to each row.
 *
 * For MONTH timeUnit: each row is one month → apply pricing directly.
 * For QUARTER/YEAR: each row aggregates multiple months. We cannot reconstruct
 * per-month counts from an already-aggregated row, so we apply pricing to the
 * total transaction_count of the period. This is an approximation for non-MONTH views.
 *
 * @param {Array}  rows     - [{ period_start, time_label, transaction_count }]
 * @param {object} company  - entry from companies.json
 * @returns {Array}         - same rows with total_payment and currency added
 */
/**
 * Applies per-service pricing to raw service count rows.
 * Used when company.billing_rules.service_pricing is defined.
 *
 * @param {Array}  serviceRows - [{ period_start, service_name, service_count }]
 * @param {object} company     - entry from companies.json
 * @param {string} timeUnit    - 'YEAR' | 'QUARTER' | 'MONTH' (for time_label generation)
 * @returns {Array}            - [{ period_start, time_label, transaction_count, total_payment, currency }]
 */
export function applyServicePricing(serviceRows, company, timeUnit) {
  const pricing        = company.billing_rules?.service_pricing ?? {};
  const { minMonthlyCost = 0, currency = 'USD' } = company;

  const periodMap = new Map();
  for (const row of serviceRows) {
    // BigQuery date objects arrive as { value: 'YYYY-MM-DD' }; dummy data as plain strings
    const ps = typeof row.period_start === 'object' ? row.period_start.value : String(row.period_start);
    if (!periodMap.has(ps)) periodMap.set(ps, { transaction_count: 0, payment: 0 });
    const p = periodMap.get(ps);
    p.transaction_count += Number(row.service_count);
    p.payment           += Number(row.service_count) * (pricing[row.service_name] ?? 0);
  }

  return Array.from(periodMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period_start, { transaction_count, payment }]) => ({
      period_start,
      time_label:        toTimeLabel(period_start, timeUnit),
      transaction_count: Math.round(transaction_count * 100) / 100,
      total_payment:     Math.max(minMonthlyCost, Math.round(payment * 100) / 100),
      currency,
    }));
}

export function applyPricing(rows, company) {
  return rows.map(row => ({
    ...row,
    total_payment: calculateMonthlyPayment(Number(row.transaction_count), company),
    currency: company.currency ?? 'USD',
  }));
}
