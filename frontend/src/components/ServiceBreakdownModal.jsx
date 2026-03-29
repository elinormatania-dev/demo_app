import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getBreakdown } from '../api.js';

const BAR_COLOR = '#4f46e5'; // indigo-600

export default function ServiceBreakdownModal({ company, row, timeUnit, onClose }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getBreakdown(company.companyId, row.period_start, timeUnit)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [company.companyId, row.period_start, timeUnit]);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      {/* Card — stop click propagation so clicking inside doesn't close */}
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              {company.name} — {row.time_label}
            </h2>
            <p className="text-sm text-gray-500">Actions per service</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        {loading && (
          <div className="h-64 flex items-center justify-center text-gray-400">Loading…</div>
        )}

        {error && (
          <div className="h-64 flex items-center justify-center text-red-500 text-sm">{error}</div>
        )}

        {!loading && !error && data.length === 0 && (
          <div className="h-64 flex items-center justify-center text-gray-400">No actions found.</div>
        )}

        {!loading && !error && data.length > 0 && (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="service_name" tick={{ fontSize: 13 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value) => [value.toLocaleString(), 'Actions']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="action_count" radius={[4, 4, 0, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={BAR_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
