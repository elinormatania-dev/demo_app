const VALID_UNITS = ['YEAR', 'QUARTER', 'MONTH'];

/**
 * Validates and normalises a timeUnit query param.
 * Returns the uppercased value or throws with a clear message.
 */
export function parseTimeUnit(raw = 'MONTH') {
  const unit = String(raw).toUpperCase();
  if (!VALID_UNITS.includes(unit)) {
    throw new Error(`Invalid timeUnit "${raw}". Must be one of: ${VALID_UNITS.join(', ')}`);
  }
  return unit;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Extracts optional filter params from a query object.
 * Returns a plain object — only includes keys that were actually provided.
 *
 * Supported: serviceName, dateFrom, dateTo
 */
export function parseDateFilters(query = {}) {
  const filters = {};
  if (query.serviceName) filters.serviceName = String(query.serviceName);
  if (query.dateFrom) {
    if (!DATE_RE.test(query.dateFrom)) throw new Error('dateFrom must be in YYYY-MM-DD format');
    filters.dateFrom = query.dateFrom;
  }
  if (query.dateTo) {
    if (!DATE_RE.test(query.dateTo)) throw new Error('dateTo must be in YYYY-MM-DD format');
    filters.dateTo = query.dateTo;
  }
  return filters;
}

/**
 * Throws a descriptive error if `value` is null/undefined/empty.
 */
export function requireParam(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required parameter: "${name}"`);
  }
  return value;
}
