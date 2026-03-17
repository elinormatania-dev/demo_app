import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseTimeUnit, parseDateFilters, requireParam } from '../middleware/validate.js';
import { getBillingData, getBreakdown } from '../services/billing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPANIES_FILE = join(__dirname, '../data/companies.json');

const router = Router();

// GET /api/billing/companies — companies with a bqCompanyId (have BQ event data)
router.get('/companies', (req, res) => {
  const all = JSON.parse(readFileSync(COMPANIES_FILE, 'utf-8'));
  res.json(
    all
      .filter(c => c.bqCompanyId)
      .map(c => ({ name: c.companyname, companyId: c.bqCompanyId }))
  );
});

// GET /api/billing/:companyId/breakdown?period=2026-01-01&timeUnit=MONTH[&serviceName=ocr]
router.get('/:companyId/breakdown', async (req, res) => {
  try {
    const { companyId } = req.params;
    const timeUnit     = parseTimeUnit(req.query.timeUnit);
    const periodStart  = requireParam(req.query.period, 'period');
    const filters      = parseDateFilters(req.query);
    const rows = await getBreakdown(companyId, periodStart, timeUnit, filters);
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/billing/:companyId?timeUnit=MONTH[&serviceName=ocr&dateFrom=2026-01-01&dateTo=2026-03-31]
router.get('/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const timeUnit  = parseTimeUnit(req.query.timeUnit);
    const filters   = parseDateFilters(req.query);
    const rows = await getBillingData(companyId, timeUnit, filters);
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
