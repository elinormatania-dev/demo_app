export default function KpiCard({ label, value, format = 'number', subtext, currencySymbol = '$' }) {
  let display;
  if (format === 'currency') {
    display = currencySymbol + Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (format === 'currency-int') {
    display = currencySymbol + Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
  } else {
    display = Number(value).toLocaleString();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{display}</p>
      {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
  );
}
