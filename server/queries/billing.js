const VALID_UNITS = ['YEAR', 'QUARTER', 'MONTH'];

const DEFAULT_ACTION_EXPR =
  "COUNT(DISTINCT CASE WHEN event_name = 'send_create_session_request' THEN session_id END)";

/**
 * Generates a BigQuery SQL string for service breakdown within a single time period.
 * companyId and periodStart are @parameters; timeUnit is a validated template literal.
 *
 * @param {string} timeUnit - 'YEAR' | 'QUARTER' | 'MONTH'
 * @param {object} filters  - { serviceName? }
 * @param {object} rules    - { action_expression?, additional_filters? }
 */
export function generateBreakdownQuery(timeUnit, filters = {}, rules = {}) {
  if (!VALID_UNITS.includes(timeUnit)) {
    throw new Error(`Invalid timeUnit "${timeUnit}". Must be one of: ${VALID_UNITS.join(', ')}`);
  }
  const actionExpr    = rules.action_expression  ?? DEFAULT_ACTION_EXPR;
  const extraFilter   = rules.additional_filters ?? '';
  const serviceFilter = filters.serviceName ? `AND service_name = @serviceName` : '';
  return `
SELECT
  service_name,
  ${actionExpr} AS action_count
FROM \`events.all_events\`
WHERE company_id = @companyId
  AND DATE_TRUNC(DATE(TIMESTAMP(event_timestamp)), ${timeUnit}) = DATE(@periodStart)
  ${extraFilter}
  ${serviceFilter}
GROUP BY service_name
HAVING action_count > 0
ORDER BY action_count DESC
  `.trim();
}

/**
 * Generates a BigQuery SQL string for billing analytics.
 * Returns raw transaction counts only — pricing is calculated in the service layer.
 * Monthly-first aggregation rolls up to the requested timeUnit.
 *
 * @param {string} timeUnit - 'YEAR' | 'QUARTER' | 'MONTH'
 * @param {object} filters  - { serviceName?, dateFrom?, dateTo? }
 * @param {object} rules    - { action_expression?, additional_filters? }
 */
export function generateBillingQuery(timeUnit, filters = {}, rules = {}) {
  if (!VALID_UNITS.includes(timeUnit)) {
    throw new Error(`Invalid timeUnit "${timeUnit}". Must be one of: ${VALID_UNITS.join(', ')}`);
  }
  const actionExpr     = rules.action_expression  ?? DEFAULT_ACTION_EXPR;
  const extraFilter    = rules.additional_filters ?? '';
  const serviceFilter  = filters.serviceName ? `AND service_name = @serviceName` : '';
  const dateFromFilter = filters.dateFrom
    ? `AND DATE(TIMESTAMP(event_timestamp)) >= DATE(@dateFrom)` : '';
  const dateToFilter   = filters.dateTo
    ? `AND DATE(TIMESTAMP(event_timestamp)) <= DATE(@dateTo)` : '';

  return `
WITH monthly_counts AS (
  SELECT
    DATE_TRUNC(DATE(TIMESTAMP(event_timestamp)), MONTH) AS month_start,
    ${actionExpr} AS tx_count
  FROM \`events.all_events\`
  WHERE company_id = @companyId
    ${extraFilter}
    ${serviceFilter}
    ${dateFromFilter}
    ${dateToFilter}
  GROUP BY month_start
),

aggregated AS (
  SELECT
    DATE_TRUNC(month_start, ${timeUnit}) AS period_start,
    SUM(tx_count) AS transaction_count
  FROM monthly_counts
  GROUP BY period_start
)

SELECT
  period_start,
  CASE
    WHEN '${timeUnit}' = 'YEAR'    THEN FORMAT_DATE('%Y',     period_start)
    WHEN '${timeUnit}' = 'QUARTER' THEN FORMAT_DATE('%Y-Q%Q', period_start)
    ELSE                                FORMAT_DATE('%Y-%m',   period_start)
  END AS time_label,
  transaction_count
FROM aggregated
ORDER BY period_start ASC
  `.trim();
}
