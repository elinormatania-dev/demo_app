import { Router } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { BillingConfigSchema } from '../../companisZod.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '../data/companies.json');

const router = Router();

function readData() {
  return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
}

function writeData(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET all companies
router.get('/', (req, res) => {
  res.json(readData());
});

// GET one company
router.get('/:id', (req, res) => {
  const companies = readData();
  const company = companies.find(c => c.companyID === req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  res.json(company);
});

// POST new company
router.post('/', (req, res) => {
  const result = BillingConfigSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const companies = readData();
  if (companies.find(c => c.companyID === result.data.companyID)) {
    return res.status(409).json({ error: 'A company with this ID already exists' });
  }

  companies.push(result.data);
  writeData(companies);
  res.status(201).json(result.data);
});

// PUT update company
router.put('/:id', (req, res) => {
  const result = BillingConfigSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: result.error.flatten() });

  const companies = readData();
  const index = companies.findIndex(c => c.companyID === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Company not found' });

  companies[index] = result.data;
  writeData(companies);
  res.json(result.data);
});

// DELETE company
router.delete('/:id', (req, res) => {
  const companies = readData();
  const index = companies.findIndex(c => c.companyID === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Company not found' });

  companies.splice(index, 1);
  writeData(companies);
  res.sendStatus(204);
});

export default router;
