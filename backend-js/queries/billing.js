const VALID_UNITS = ['YEAR', 'QUARTER', 'MONTH'];

const DEFAULT_ACTION_EXPR =
  "COUNT(DISTINCT CASE WHEN event_name = 'send_create_session_request' THEN session_id END)";

/**
 * Builds a BigQuery COUNT expression from a weighted_actions array.
 * e.g. COUNT(DISTINCT CASE WHEN event_name = 'A' THEN session_id END)
 *    + 0.5 * COUNT(DISTINCT CASE WHEN event_name = 'B' THEN session_id END)
 */
function buildActionExpr(weightedActions) {
  return weightedActions
    .map(({ event_name, weight }) => {
      const c = `COUNT(DISTINCT CASE WHEN event_name = '${event_name}' THEN session_id END)`;
      return weight === 1 ? c : `${weight} * ${c}`;
    })
    .join('\n    + ');
}

/** Builds AND event_name IN (...) from a weighted_actions array. */
function buildEventFilter(weightedActions) {
  const names = weightedActions.map(a => `'${a.event_name}'`).join(', ');
  return `AND event_name IN (${names})`;
}

/** Resolves actionExpr + extraFilter, preferring weighted_actions over legacy fields. */
function resolveExpr(rules) {
  if (rules.weighted_actions?.length) {
    return {
      actionExpr:  buildActionExpr(rules.weighted_actions),
      extraFilter: buildEventFilter(rules.weighted_actions),
    };
  }
  return {
    actionExpr:  rules.action_expression  ?? DEFAULT_ACTION_EXPR,
    extraFilter: rules.additional_filters ?? '',
  };
}

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
  const { actionExpr, extraFilter } = resolveExpr(rules);
  const serviceFilter = filters.serviceName ? `AND service_name = @serviceName` : '';
  const periodFilter = `DATE_TRUNC(DATE(TIMESTAMP(event_timestamp)), ${timeUnit}) = DATE(@periodStart)`;
  return `
SELECT
  b.service_name,
  b.action_count,
  d.active_days
FROM (
  SELECT
    service_name,
    ${actionExpr} AS action_count
  FROM \`events.all_events\`
  WHERE company_id = @companyId
    AND ${periodFilter}
    ${extraFilter}
    ${serviceFilter}
  GROUP BY service_name
  HAVING action_count > 0
) b
CROSS JOIN (
  SELECT COUNT(DISTINCT DATE(TIMESTAMP(event_timestamp))) AS active_days
  FROM \`events.all_events\`
  WHERE company_id = @companyId
    AND ${periodFilter}
    ${extraFilter}
    ${serviceFilter}
) d
ORDER BY b.action_count DESC
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
  const { actionExpr, extraFilter } = resolveExpr(rules);
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

/**
 * Generates a BigQuery SQL string for per-service billing counts.
 * Used when company.billing_rules.service_pricing is defined.
 * Returns raw [{period_start, service_name, service_count}] rows —
 * pricing (summing service_count × price) is applied in JS.
 *
 * @param {string} timeUnit      - 'YEAR' | 'QUARTER' | 'MONTH'
 * @param {object} filters       - { serviceName?, dateFrom?, dateTo? }
 * @param {object} servicePricing - { [service_name]: cost }
 */
export function generateServiceCountsQuery(timeUnit, filters = {}, servicePricing = {}) {
  if (!VALID_UNITS.includes(timeUnit)) {
    throw new Error(`Invalid timeUnit "${timeUnit}". Must be one of: ${VALID_UNITS.join(', ')}`);
  }
  const serviceNames   = Object.keys(servicePricing).map(s => `'${s}'`).join(', ');
  const svcNameFilter  = filters.serviceName ? `AND service_name = @serviceName` : '';
  const dateFromFilter = filters.dateFrom
    ? `AND DATE(TIMESTAMP(event_timestamp)) >= DATE(@dateFrom)` : '';
  const dateToFilter   = filters.dateTo
    ? `AND DATE(TIMESTAMP(event_timestamp)) <= DATE(@dateTo)` : '';

  return `
WITH monthly_service_counts AS (
  SELECT
    DATE_TRUNC(DATE(TIMESTAMP(event_timestamp)), MONTH) AS month_start,
    service_name,
    COUNT(DISTINCT session_id) AS service_count
  FROM \`events.all_events\`
  WHERE company_id = @companyId
    AND service_name IN (${serviceNames})
    ${svcNameFilter}
    ${dateFromFilter}
    ${dateToFilter}
  GROUP BY month_start, service_name
),

aggregated AS (
  SELECT
    DATE_TRUNC(month_start, ${timeUnit}) AS period_start,
    service_name,
    SUM(service_count) AS service_count
  FROM monthly_service_counts
  GROUP BY period_start, service_name
)

SELECT
  period_start,
  service_name,
  service_count
FROM aggregated
ORDER BY period_start ASC, service_name ASC
  `.trim();
}
