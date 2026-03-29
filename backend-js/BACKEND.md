# Backend Architecture

## Overview

The server is an Express app running on port `3001`. It is split into layered folders so that adding a new metric type (usage, errors, revenue) means copying a folder and changing the SQL — nothing else.

```
server/
  index.js            # Mount routers only (~15 lines)
  queries/            # Pure SQL generators — no BQ client, no side effects
  dummy/              # JS implementations used when USE_DUMMY_DATA=true
  services/           # Business logic: cache + BigQuery client + pricing
  routes/             # Express routers: HTTP parsing only
  middleware/         # Shared validation and caching helpers
  data/               # JSON files (companies, eventCompanies)
  cache/              # Auto-generated persistent cache files (gitignored)
```

---

## Starting the Server

```bash
npm run dev      # starts server (port 3001) + Vite client (port 5173) in parallel
npm start        # server only
```

Environment variables (`.env`):

| Variable                      | Description                                      | Example                          |
|-------------------------------|--------------------------------------------------|----------------------------------|
| `GCP_PROJECT_ID`              | Google Cloud project for BigQuery                | `development-432214`             |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service-account key JSON              | `./bigQuery.json`                |
| `USE_DUMMY_DATA`              | Skip BQ and run against local dummy data         | `true`                           |
| `CACHE_TTL_SECONDS`           | Cache time-to-live (default: 300)                | `60`                             |

---

## API Endpoints

### Companies — `/api/companies`

Billing contract records stored in `server/data/companies.json`.
Each record is validated against a Zod schema (`companisZod.js`).

| Method | Path                  | Description                  |
|--------|-----------------------|------------------------------|
| GET    | `/api/companies`      | List all companies           |
| GET    | `/api/companies/:id`  | Get one company by `companyID` |
| POST   | `/api/companies`      | Create a new company         |
| PUT    | `/api/companies/:id`  | Replace a company record     |
| DELETE | `/api/companies/:id`  | Remove a company             |

### Billing — `/api/billing`

Event data queried from BigQuery (or dummy data).
Companies with BQ event data are listed separately in `server/data/eventCompanies.json`.

| Method | Path                              | Required params              | Optional params                        |
|--------|-----------------------------------|------------------------------|----------------------------------------|
| GET    | `/api/billing/companies`          | —                            | —                                      |
| GET    | `/api/billing/:companyId`         | `timeUnit`                   | `serviceName`, `dateFrom`, `dateTo`    |
| GET    | `/api/billing/:companyId/breakdown` | `timeUnit`, `period`       | `serviceName`                          |

**`timeUnit`** — `MONTH` (default) \| `QUARTER` \| `YEAR`
**`period`** — period start date in `YYYY-MM-DD` format (e.g. `2026-01-01` for January 2026)
**`dateFrom` / `dateTo`** — inclusive date range filter in `YYYY-MM-DD` format. Both must be `YYYY-MM-DD` or the request is rejected with a 400.

**Example requests:**
```
GET /api/billing/67e3d43ef4c0fe53abbbda6a?timeUnit=MONTH
GET /api/billing/67e3d43ef4c0fe53abbbda6a?timeUnit=QUARTER&dateFrom=2025-01-01&dateTo=2025-12-31
GET /api/billing/67e3d43ef4c0fe53abbbda6a/breakdown?period=2026-01-01&timeUnit=MONTH&serviceName=ocr
```

**Billing response shape:**
```json
[
  {
    "period_start": "2026-01-01",
    "time_label": "2026-01",
    "transaction_count": 1243,
    "total_payment": 3107.50,
    "currency": "USD"
  }
]
```

**Breakdown response shape:**
```json
[
  { "service_name": "ocr", "action_count": 812 },
  { "service_name": "liveness", "action_count": 431 }
]
```

---

## Layer Details

### `routes/` — HTTP parsing only

Each route file:
1. Parses and validates query params using helpers from `middleware/validate.js`
2. Calls the corresponding service function
3. Sends the result as JSON (errors → 400)

The `/companies` literal route is registered **before** `/:companyId` to prevent Express treating the word "companies" as a company ID.

### `middleware/validate.js` — Shared param validation

| Function | What it does |
|---|---|
| `parseTimeUnit(raw)` | Validates against `['YEAR','QUARTER','MONTH']`, returns uppercase. Throws on invalid input. |
| `parseDateFilters(query)` | Extracts `serviceName`, `dateFrom`, `dateTo`. Validates dates are `YYYY-MM-DD`. Returns only keys that are present. |
| `requireParam(value, name)` | Throws a descriptive error if a required param is missing. |

### `services/billing.js` — Business logic

Each service function:
1. Looks up the company record from `companies.json` by `bqCompanyId`
2. Extracts `billing_rules` (what to count, any extra SQL filters)
3. Checks the cache — returns early if still valid
4. Otherwise: routes to dummy data **or** BigQuery depending on `USE_DUMMY_DATA`
5. Caches the raw count result
6. Applies pricing in JavaScript via `services/pricing.js` and returns the enriched rows

**Important:** the cache stores raw transaction counts only. Pricing is applied *after* the cache lookup. This means changing pricing tiers in `companies.json` takes effect immediately on the next request without any cache invalidation.

The BigQuery client is a singleton defined in `services/bigquery.js` and imported by all service files — never instantiated more than once.

### `services/pricing.js` — Pricing calculator

Pure functions, no imports, no side effects.

- `calculateMonthlyPayment(txCount, company)` — computes the payment for a single month using the company's `billing_rules.pricing_model` and `levels` tiers
- `applyPricing(rows, company)` — maps over count rows and adds `total_payment` + `currency` to each

**Pricing models** (set per company in `companies.json`):

| Model | Behaviour |
|---|---|
| `flat` | `txCount × SingalActionCost`, floored at `minMonthlyCost` |
| `tiered_volume` | Find the tier bracket that contains `txCount`, price **all** units at that rate, then floor |
| `tiered_marginal` | Each unit priced at the rate of its own bracket (progressive / tax-bracket style), then floor |

### `queries/billing.js` — SQL generation

Pure functions. No imports, no side effects.

- `generateBillingQuery(timeUnit, filters, rules)` — two-CTE query:
  - **CTE 1 `monthly_counts`**: counts billable actions per month using the company's `rules.action_expression`
  - **CTE 2 `aggregated`**: rolls monthly rows up to the requested `timeUnit`
  - Returns `transaction_count` only — no payment math in SQL
- `generateBreakdownQuery(timeUnit, filters, rules)` — counts actions per `service_name` within a single period

`companyId` and date values are always passed as `@parameters` (BigQuery parameterised queries — safe from injection).
`timeUnit` is validated against an allowlist before being inlined as a template literal (required because BigQuery does not support parameterised `DATE_TRUNC` arguments).
`rules.action_expression` and `rules.additional_filters` are injected from `companies.json` and never come from user input.

### `dummy/billing.js` — Local data mode

Mirrors the SQL logic entirely in JavaScript, running against `dummyData.json` loaded into memory at startup.
Used when `USE_DUMMY_DATA=true` so development works without a BigQuery connection.

Uses `rules.event_name_filter` (from `companies.json`) as the equivalent of the SQL `action_expression`.
Returns raw counts only — pricing is applied identically by the service layer for both dummy and real data.

### `middleware/cache.js` — Persistent file-based cache

- Cache files are stored as `server/cache/{domain}.json`
- Each entry is keyed by `{domain}:{sha256(params)[:16]}`
- TTL defaults to 5 minutes; override with `CACHE_TTL_SECONDS`
- `cache.wrap(key, fn)` — returns cached value or calls `fn`, stores result
- `cache.invalidate(domain)` — wipes an entire domain's cache file

---

## Data Files

### `server/data/companies.json` — Billing contracts

One record per customer. Validated against `companisZod.js` (project root) on every POST/PUT.

```json
{
  "companyname": "string",
  "companyID": "string",
  "bqCompanyId": "string (optional — links to BQ event data)",
  "services": ["string"],
  "annualFixedPayment": 0,
  "minimumMonthlyActions": 0,
  "SingalActionCost": 0,
  "currency": "ILS | USD | EUR",
  "minMonthlyCost": 0,
  "levels": [
    { "level": 1, "from": 0, "to": 3500, "actionCost": 3.4, "actionCurrency": "ILS | USD | EUR" }
  ],
  "typeOfAction": {
    "sessionReturnToCustomer": false,
    "oneComponentWorkedWithoutReturn": false,
    "chargeRegardlessOfReturn": false,
    "anyTouchAnyCharge": false,
    "comboDependent": false,
    "usingOneServiceOrMore": false,
    "openAccount": false,
    "notDetailedInAgreement": false
  },
  "billing_rules": {
    "action_expression": "COUNT(DISTINCT CASE WHEN event_name = 'send_create_session_request' THEN session_id END)",
    "additional_filters": "",
    "event_name_filter": "send_create_session_request",
    "service_name_filters": ["ocr", "liveness"],
    "pricing_model": "flat | tiered_volume | tiered_marginal"
  }
}
```

- `bqCompanyId` — present only for companies whose events are in BigQuery. Used by the service layer to look up billing rules when the route receives a BQ company ID.
- `billing_rules.action_expression` — injected into the SQL `SELECT` clause. Defines what counts as one billable action.
- `billing_rules.additional_filters` — injected into the SQL `WHERE` clause. Empty string means no extra filter.
- `billing_rules.event_name_filter` — used by the JS dummy layer as the equivalent of `action_expression`.
- `billing_rules.service_name_filters` — optional array; filters events to only these service names (used by the dummy layer and breakdown query).
- `billing_rules.pricing_model` — see pricing models table above.
- `levels` — max 7 tiers; `to: null` means unbounded (highest bracket). Each tier's `actionCurrency` can differ from the company's top-level `currency`.

### `server/data/eventCompanies.json` — BQ company registry

| Field | Description |
|---|---|
| `name` | Display name shown in the UI |
| `companyId` | MongoDB-style UUID used as `company_id` in BigQuery events |

### `dummyData.json` (root)

~10k synthetic event records used when `USE_DUMMY_DATA=true`.

---

## CORS

The server sets `Access-Control-Allow-Origin: http://localhost:5173` (hardcoded in `server/index.js`).

Vite is configured to run on port `5173`. If that port is already occupied, Vite auto-increments to `5174`, etc. When this happens:
- Requests routed through Vite's proxy still work (the proxy is server-side, not a browser request).
- Any direct browser request to the server would be blocked by CORS.

**Fix:** kill the stale process holding `5173` before starting dev:
```bash
lsof -ti:5173 | xargs kill -9
npm run dev
```

---

## Frontend (Client)

```
client/
  vite.config.js        # Vite + React + Tailwind; proxies /api → http://localhost:3001
  src/
    main.jsx            # React entry point
    App.jsx             # BrowserRouter + layout (Sidebar + main content)
    index.css           # Global styles / Tailwind base
    api.js              # All fetch calls to the backend (single module)
    components/
      Sidebar.jsx             # Left nav: Billing (active), Usage/Errors/Revenue (soon)
      BillingDashboard.jsx    # Main page: tabs, KPI cards, chart, table, modals
      FilterBar.jsx           # Time-unit toggle + date range + service filter
      KpiCard.jsx             # Single metric card (number or currency format)
      BillingChart.jsx        # Recharts line/bar chart of billing rows
      ServiceBreakdownModal.jsx  # Bar chart of actions-per-service for a clicked period
      CompanyFormModal.jsx    # Create/edit company form (react-hook-form + useFieldArray)
```

### Routing

Only one route is active: `/` → `BillingDashboard`.
The sidebar shows placeholders for Usage, Errors, and Revenue (marked "Soon") — no routes are registered for them yet.

### `client/src/api.js` — Frontend API module

All HTTP calls go through this module. Functions:

| Function | Method | Endpoint |
|---|---|---|
| `getCompanies()` | GET | `/api/companies` |
| `getCompany(id)` | GET | `/api/companies/:id` |
| `createCompany(data)` | POST | `/api/companies` |
| `updateCompany(id, data)` | PUT | `/api/companies/:id` |
| `deleteCompany(id)` | DELETE | `/api/companies/:id` |
| `getBillingCompanies()` | GET | `/api/billing/companies` |
| `getBillingData(companyId, timeUnit, filters)` | GET | `/api/billing/:companyId` |
| `getBreakdown(companyId, periodStart, timeUnit)` | GET | `/api/billing/:companyId/breakdown` |

### BillingDashboard data flow

1. On mount: `getBillingCompanies()` → populates company tabs (from `eventCompanies.json`)
2. On company/timeUnit/filter change: `getBillingData()` → populates KPI cards + chart + table
3. On table row click: `ServiceBreakdownModal` opens and calls `getBreakdown()` for that period
4. Edit button (✎ next to active tab): calls `getCompanies()` to load the full record, then opens `CompanyFormModal` in edit mode (matches on `bqCompanyId`)
5. "+ Add Company": opens `CompanyFormModal` in create mode
6. After save: `refreshCompanies()` re-fetches the tab list

### CompanyFormModal notes

- `companyID` is read-only in edit mode (used as the PUT `:id` param)
- `services` and `billing_rules.service_name_filters` are entered as comma-separated strings in the form and converted to arrays on submit
- `billing_rules` is omitted from the payload entirely if all its fields are empty
- `bqCompanyId` is omitted if blank

---

## Adding a New Metric (e.g. Usage)

1. Copy `server/queries/billing.js` → `server/queries/usage.js`, write the SQL
2. Copy `server/dummy/billing.js` → `server/dummy/usage.js`, implement the JS logic
3. Copy `server/services/billing.js` → `server/services/usage.js`, update imports
4. Copy `server/routes/billing.js` → `server/routes/usage.js`, update imports + mount path
5. In `server/index.js`: add one line — `app.use('/api/usage', usageRouter)`

No other files need to change.
