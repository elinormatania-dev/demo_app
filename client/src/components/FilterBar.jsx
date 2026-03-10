import { useState } from 'react';

const TIME_UNITS = [
  { value: 'MONTH', label: 'Month' },
  { value: 'QUARTER', label: 'Quarter' },
  { value: 'YEAR', label: 'Year' },
];

export default function FilterBar({ timeUnit, onTimeUnitChange, onFiltersApply, serviceOptions = [] }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [serviceName, setServiceName] = useState('');

  function handleApply() {
    onFiltersApply({
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(serviceName.trim() && { serviceName: serviceName.trim() }),
    });
  }

  function handleClear() {
    setDateFrom('');
    setDateTo('');
    setServiceName('');
    onFiltersApply({});
  }

  const hasFilters = dateFrom || dateTo || serviceName.trim();

  return (
    <div className="flex items-center gap-3 flex-wrap bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
      {/* Time unit */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
        {TIME_UNITS.map(unit => (
          <button
            key={unit.value}
            onClick={() => onTimeUnitChange(unit.value)}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              timeUnit === unit.value
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {unit.label}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-gray-200" />

      {/* Date range */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 font-medium">From</label>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
        />
        <label className="text-xs text-gray-500 font-medium">To</label>
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
        />
      </div>

      {/* Service dropdown */}
      {serviceOptions.length > 0 && (
        <select
          value={serviceName}
          onChange={e => setServiceName(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
        >
          <option value="">All services</option>
          {serviceOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {/* Apply / Clear */}
      <button
        onClick={handleApply}
        className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
      >
        Apply
      </button>
      {hasFilters && (
        <button
          onClick={handleClear}
          className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}
