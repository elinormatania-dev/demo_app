import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getBillingCompanies, getBillingData, getCompanies } from '../api.js';
import KpiCard from './KpiCard.jsx';
import BillingChart from './BillingChart.jsx';
import FilterBar from './FilterBar.jsx';
import ServiceBreakdownModal from './ServiceBreakdownModal.jsx';
import CompanyFormModal from './CompanyFormModal.jsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export default function BillingDashboard() {
  const [companies, setCompanies] = useState([]);
  const [allCompanies, setAllCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [timeUnit, setTimeUnit] = useState('MONTH');
  const [appliedFilters, setAppliedFilters] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit' | null
  const [editCompany, setEditCompany] = useState(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const reportRef = useRef(null);

  const refreshCompanies = useCallback(() => {
    getBillingCompanies()
      .then(list => {
        setCompanies(list);
        setSelectedCompany(prev => list.find(c => c.companyId === prev?.companyId) ?? list[0] ?? null);
      })
      .catch(err => setError(err.message));
  }, []);

  // Fetch company list once on mount
  useEffect(() => {
    refreshCompanies();
    getCompanies().then(setAllCompanies).catch(() => {});
  }, [refreshCompanies]);

  async function handleEditClick(e) {
    e.stopPropagation();
    try {
      // Load full company data from the companies API (billing tabs only have name+companyId)
      const all = await getCompanies();
      const full = all.find(c => c.bqCompanyId === selectedCompany.companyId);
      setEditCompany(full ?? null);
      setModalMode('edit');
    } catch {
      setError('Failed to load company data for editing.');
    }
  }

  async function handleExportPDF() {
    console.log('[PDF] starting export, ref:', reportRef.current);
    if (!reportRef.current) { alert('Report ref not found'); return; }
    setPdfExporting(true);
    try {
      console.log('[PDF] calling html2canvas...');
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
      console.log('[PDF] canvas size:', canvas.width, 'x', canvas.height);
      const imgData = canvas.toDataURL('image/png');

      console.log('[PDF] creating jsPDF instance, jsPDF=', jsPDF);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 32;

      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text(selectedCompany.name, margin, 40);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100);
      pdf.text(
        `Monthly Billing Report  •  ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`,
        margin, 56
      );
      pdf.setDrawColor(200);
      pdf.line(margin, 64, pageW - margin, 64);
      pdf.setTextColor(0);

      const contentY = 76;
      const contentH = pageH - contentY - margin;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height / canvas.width) * imgW;
      const finalH = Math.min(imgH, contentH);
      pdf.addImage(imgData, 'PNG', margin, contentY, imgW, finalH);

      console.log('[PDF] saving...');
      pdf.save(`${selectedCompany.name}_billing_report.pdf`);
      console.log('[PDF] done');
    } catch (err) {
      console.error('[PDF] error:', err);
      alert(`PDF export failed: ${err.message}`);
    } finally {
      setPdfExporting(false);
    }
  }

  // Fetch billing data whenever company, time unit, or filters change
  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);
    setError(null);
    getBillingData(selectedCompany.companyId, timeUnit, appliedFilters)
      .then(setRows)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedCompany?.companyId, timeUnit, appliedFilters]);

  const kpis = useMemo(() => {
    const totalTransactions = rows.reduce((s, r) => s + Number(r.transaction_count), 0);
    const totalPayment = rows.reduce((s, r) => s + Number(r.total_payment), 0);
    const avgPerPeriod = rows.length ? totalPayment / rows.length : 0;
    return { totalTransactions, totalPayment, avgPerPeriod };
  }, [rows]);

  const serviceOptions = allCompanies.find(c => c.bqCompanyId === selectedCompany?.companyId)?.service_options ?? [];

  const timeUnitLabel = timeUnit.charAt(0) + timeUnit.slice(1).toLowerCase();
  const currency = rows[0]?.currency ?? 'USD';
  const currencySymbol = { USD: '$', ILS: '₪' }[currency] ?? currency;

  if (!selectedCompany) {
    return <div className="text-center py-16 text-gray-400">Loading…</div>;
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="text-sm text-gray-500 mt-0.5">Transaction volume and revenue by period</p>
      </div>

      {/* Company tabs */}
      <div className="flex items-end border-b border-gray-200 mb-6">
        {companies.map(company => {
          const isActive = selectedCompany.companyId === company.companyId;
          return (
            <button
              key={company.companyId}
              onClick={() => setSelectedCompany(company)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {company.name}
              {isActive && (
                <span
                  onClick={handleEditClick}
                  title="Edit company"
                  className="text-gray-400 hover:text-indigo-600 cursor-pointer leading-none"
                >
                  ✎
                </span>
              )}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2 mb-0.5">
          <button
            onClick={handleExportPDF}
            disabled={pdfExporting || loading}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {pdfExporting ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Generating…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a1 1 0 001 1h16a1 1 0 001-1v-3" />
                </svg>
                Download PDF
              </>
            )}
          </button>
          <button
            onClick={() => setModalMode('create')}
            className="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            + Add Company
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-6">
        <FilterBar
          key={selectedCompany?.companyId}
          timeUnit={timeUnit}
          onTimeUnitChange={setTimeUnit}
          onFiltersApply={setAppliedFilters}
          serviceOptions={serviceOptions}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm mb-6">
          {error}
        </div>
      )}

      {/* Report content (captured for PDF export) */}
      <div ref={reportRef}>

      {/* KPI cards */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <KpiCard
            label="Total Transactions"
            value={kpis.totalTransactions}
            format="number"
            subtext={`across ${rows.length} period${rows.length !== 1 ? 's' : ''}`}
          />
          <KpiCard label="Total Revenue" value={kpis.totalPayment} format="currency" currencySymbol={currencySymbol} />
          <KpiCard
            label={`Avg Revenue / ${timeUnitLabel}`}
            value={kpis.avgPerPeriod}
            format="currency"
            currencySymbol={currencySymbol}
          />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-16 text-gray-400">Loading billing data…</div>
      )}

      {/* Chart */}
      {!loading && !error && <BillingChart rows={rows} currency={currency} />}

      {/* Table */}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-gray-600">Period</th>
                <th className="px-6 py-3 text-right font-semibold text-gray-600">Transactions</th>
                <th className="px-6 py-3 text-right font-semibold text-gray-600">Total Payment</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-gray-400">
                    No data found.
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr
                    key={row.time_label}
                    onClick={() => setSelectedRow(row)}
                    className="hover:bg-indigo-50 cursor-pointer transition-colors"
                    title="Click to see service breakdown"
                  >
                    <td className="px-6 py-3 font-medium text-gray-800">{row.time_label}</td>
                    <td className="px-6 py-3 text-right text-gray-700">
                      {Number(row.transaction_count).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-700">
                      {currencySymbol}{Number(row.total_payment).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      </div>{/* end reportRef */}

      {selectedRow && (
        <ServiceBreakdownModal
          company={selectedCompany}
          row={selectedRow}
          timeUnit={timeUnit}
          onClose={() => setSelectedRow(null)}
        />
      )}

      {modalMode && (
        <CompanyFormModal
          mode={modalMode}
          company={modalMode === 'edit' ? editCompany : null}
          onClose={() => { setModalMode(null); setEditCompany(null); }}
          onSaved={refreshCompanies}
        />
      )}
    </div>
  );
}
