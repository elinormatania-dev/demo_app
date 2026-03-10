/**
 * Pure pricing calculator — no BQ, no cache, no side effects.
 *
 * Supports three pricing models (set via company.billing_rules.pricing_model):
 *
 *   flat            — txCount × SingalActionCost, floored at minMonthlyCost
 *   tiered_volume   — find the tier bracket that contains txCount, price ALL units at that rate
 *   tiered_marginal — each unit priced at the rate of its own bracket (progressive / tax-bracket style)
 */

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

  } else if (pricingModel === 'flat_with_deduction') {
    const baseDeduction = company.billing_rules?.base_deduction ?? 0;
    payment = txCount * SingalActionCost - baseDeduction;

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
export function applyPricing(rows, company) {
  return rows.map(row => ({
    ...row,
    total_payment: calculateMonthlyPayment(Number(row.transaction_count), company),
    currency: company.currency ?? 'USD',
  }));
}
