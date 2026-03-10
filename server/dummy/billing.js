import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load once at startup — supports both NDJSON (BQ export, one object per line) and JSON array
const ALL_EVENTS = (() => {
  const raw = readFileSync(join(__dirname, '../../dummyData.json'), 'utf-8').trim();
  if (raw.startsWith('[')) return JSON.parse(raw);
  return raw.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
})();

const VALID_UNITS = ['YEAR', 'QUARTER', 'MONTH'];
const DEFAULT_EVENT_NAME = 'send_create_session_request';

function toMonthStart(eventTimestamp) {
  const d = new Date(eventTimestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function toPeriodStart(monthStart, timeUnit) {
  const [y, m] = monthStart.split('-').map(Number);
  if (timeUnit === 'YEAR')    return `${y}-01-01`;
  if (timeUnit === 'QUARTER') return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  return monthStart; // MONTH
}

function toTimeLabel(periodStart, timeUnit) {
  const [y, m] = periodStart.split('-').map(Number);
  if (timeUnit === 'YEAR')    return String(y);
  if (timeUnit === 'QUARTER') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function matchesFilters(event, filters) {
  if (filters.serviceName && event.service_name !== filters.serviceName) return false;
  if (filters.dateFrom) {
    const d = new Date(event.event_timestamp).toISOString().slice(0, 10);
    if (d < filters.dateFrom) return false;
  }
  if (filters.dateTo) {
    const d = new Date(event.event_timestamp).toISOString().slice(0, 10);
    if (d > filters.dateTo) return false;
  }
  return true;
}

/**
 * Returns action counts per service_name for a single time period.
 * Output: [{ service_name, action_count }] sorted by count desc.
 *
 * @param {string} companyId
 * @param {string} periodStart  - 'YYYY-MM-DD'
 * @param {string} timeUnit     - 'YEAR' | 'QUARTER' | 'MONTH'
 * @param {object} filters      - { serviceName? }
 * @param {object} rules        - { event_name_filter? }
 */
export function getDummyBreakdown(companyId, periodStart, timeUnit, filters = {}, rules = {}) {
  if (!VALID_UNITS.includes(timeUnit)) {
    throw new Error(`Invalid timeUnit "${timeUnit}". Must be one of: ${VALID_UNITS.join(', ')}`);
  }

  const INTERNAL_SERVICES = new Set(['gateway', 'client_api', 'onboarding']);
  const serviceSessions = new Map(); // service_name → Set<session_id>
  const serviceNameFilters = rules.service_name_filters;
  const weightedEvents     = rules.weighted_events;

  if (serviceNameFilters) {
    for (const event of ALL_EVENTS) {
      if (event.company_id !== companyId) continue;
      if (!serviceNameFilters.includes(event.service_name)) continue;
      if (!matchesFilters(event, filters)) continue;
      const evtPeriod = toPeriodStart(toMonthStart(event.event_timestamp), timeUnit);
      if (evtPeriod !== periodStart) continue;
      const svc = event.service_name || 'unknown';
      if (!serviceSessions.has(svc)) serviceSessions.set(svc, new Set());
      serviceSessions.get(svc).add(event.session_id);
    }
  } else if (weightedEvents) {
    const billableNames = new Set(Object.keys(weightedEvents));
    for (const event of ALL_EVENTS) {
      if (event.company_id !== companyId) continue;
      if (!billableNames.has(event.event_name)) continue;
      if (!matchesFilters(event, filters)) continue;
      const evtPeriod = toPeriodStart(toMonthStart(event.event_timestamp), timeUnit);
      if (evtPeriod !== periodStart) continue;
      const svc = event.service_name || 'unknown';
      if (!serviceSessions.has(svc)) serviceSessions.set(svc, new Set());
      serviceSessions.get(svc).add(event.session_id);
    }
  } else {
    for (const event of ALL_EVENTS) {
      if (event.company_id !== companyId) continue;
      if (INTERNAL_SERVICES.has(event.service_name)) continue;
      if (!matchesFilters(event, filters)) continue;
      const evtPeriod = toPeriodStart(toMonthStart(event.event_timestamp), timeUnit);
      if (evtPeriod !== periodStart) continue;
      const svc = event.service_name || 'unknown';
      if (!serviceSessions.has(svc)) serviceSessions.set(svc, new Set());
      serviceSessions.get(svc).add(event.session_id);
    }
  }

  return Array.from(serviceSessions.entries())
    .map(([service_name, sessions]) => ({ service_name, action_count: sessions.size }))
    .sort((a, b) => b.action_count - a.action_count);
}

/**
 * Mirrors the two-CTE BigQuery billing logic in JS.
 * Returns raw transaction counts only — pricing is applied in the service layer.
 * Output: [{ period_start, time_label, transaction_count }]
 *
 * @param {string} companyId
 * @param {string} timeUnit   - 'YEAR' | 'QUARTER' | 'MONTH'
 * @param {object} filters    - { serviceName?, dateFrom?, dateTo? }
 * @param {object} rules      - { event_name_filter? }
 */
export function getDummyBillingData(companyId, timeUnit, filters = {}, rules = {}) {
  if (!VALID_UNITS.includes(timeUnit)) {
    throw new Error(`Invalid timeUnit "${timeUnit}". Must be one of: ${VALID_UNITS.join(', ')}`);
  }

  const serviceNameFilters = rules.service_name_filters;
  const weightedEvents     = rules.weighted_events;
  const periodMap = new Map(); // periodStart → txCount

  if (weightedEvents) {
    // Weighted event counting: distinct sessions per event_name, multiplied by their weight
    const monthEventSessions = new Map(); // `${monthStart}:${event_name}` → Set<session_id>

    for (const event of ALL_EVENTS) {
      if (event.company_id !== companyId) continue;
      if (weightedEvents[event.event_name] === undefined) continue;
      if (!matchesFilters(event, filters)) continue;
      const monthStart = toMonthStart(event.event_timestamp);
      const key        = `${monthStart}::${event.event_name}`;
      if (!monthEventSessions.has(key)) monthEventSessions.set(key, new Set());
      monthEventSessions.get(key).add(event.session_id);
    }

    for (const [key, sessions] of monthEventSessions) {
      const [monthStart, eventName] = key.split('::');
      const weight      = weightedEvents[eventName];
      const periodStart = toPeriodStart(monthStart, timeUnit);
      periodMap.set(periodStart, (periodMap.get(periodStart) ?? 0) + sessions.size * weight);
    }

  } else if (serviceNameFilters) {
    // Service-based counting: count distinct sessions per service, sum across services.
    // A session that used both ocr and liveness counts as 2 actions (intentional).
    const monthServiceSessions = new Map(); // `${monthStart}:${service_name}` → Set<session_id>

    for (const event of ALL_EVENTS) {
      if (event.company_id !== companyId) continue;
      if (!serviceNameFilters.includes(event.service_name)) continue;
      if (!matchesFilters(event, filters)) continue;
      const key = `${toMonthStart(event.event_timestamp)}:${event.service_name}`;
      if (!monthServiceSessions.has(key)) monthServiceSessions.set(key, new Set());
      monthServiceSessions.get(key).add(event.session_id);
    }

    for (const [key, sessions] of monthServiceSessions) {
      const monthStart = key.split(':')[0];
      const periodStart = toPeriodStart(monthStart, timeUnit);
      periodMap.set(periodStart, (periodMap.get(periodStart) ?? 0) + sessions.size);
    }
  } else {
    // Event-name based counting: count distinct sessions per month
    const monthSessions = new Map(); // monthStart → Set<session_id>
    const eventNameFilter = rules.event_name_filter ?? DEFAULT_EVENT_NAME;

    for (const event of ALL_EVENTS) {
      if (event.company_id !== companyId) continue;
      if (event.event_name !== eventNameFilter) continue;
      if (!matchesFilters(event, filters)) continue;
      const monthStart = toMonthStart(event.event_timestamp);
      if (!monthSessions.has(monthStart)) monthSessions.set(monthStart, new Set());
      monthSessions.get(monthStart).add(event.session_id);
    }

    for (const [monthStart, sessions] of monthSessions) {
      const periodStart = toPeriodStart(monthStart, timeUnit);
      periodMap.set(periodStart, (periodMap.get(periodStart) ?? 0) + sessions.size);
    }
  }

  return Array.from(periodMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodStart, txCount]) => ({
      period_start: periodStart,
      time_label: toTimeLabel(periodStart, timeUnit),
      transaction_count: txCount,
    }));
}
