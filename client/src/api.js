const BASE = '/api/companies';

export async function getCompanies() {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error('Failed to fetch companies');
  return res.json();
}

export async function getCompany(id) {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Company not found');
  return res.json();
}

export async function createCompany(data) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.error));
  return json;
}

export async function updateCompany(id, data) {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json.error));
  return json;
}

export async function deleteCompany(id) {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete company');
}

// Returns [{ name, companyId }] — the companies that have BQ event data
export async function getBillingCompanies() {
  const res = await fetch('/api/billing/companies');
  if (!res.ok) throw new Error('Failed to fetch billing companies');
  return res.json();
}

export async function getBillingData(companyId, timeUnit = 'MONTH', filters = {}) {
  const params = new URLSearchParams({ timeUnit });
  if (filters.serviceName) params.set('serviceName', filters.serviceName);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  const res = await fetch(`/api/billing/${encodeURIComponent(companyId)}?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getBreakdown(companyId, periodStart, timeUnit) {
  const res = await fetch(
    `/api/billing/${encodeURIComponent(companyId)}/breakdown?period=${periodStart}&timeUnit=${timeUnit}`
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
