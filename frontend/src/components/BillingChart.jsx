import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const CURRENCY_SYMBOL = { USD: '$', ILS: '₪' };
const formatCount = v => Number(v).toLocaleString();

export default function BillingChart({ rows, currency = 'USD' }) {
  if (!rows.length) return null;
  const formatCurrency = v =>
    (CURRENCY_SYMBOL[currency] ?? currency) + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-sm">
        <p className="font-semibold text-gray-700 mb-2">{label}</p>
        {payload.map(p => (
          <p key={p.dataKey} style={{ color: p.color }} className="text-xs">
            {p.name}: {p.dataKey === 'payment' ? formatCurrency(p.value) : formatCount(p.value)}
          </p>
        ))}
      </div>
    );
  };

  const data = rows.map(r => ({
    period: r.time_label,
    payment: Number(r.total_payment),
    transactions: Number(r.transaction_count),
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Revenue &amp; Transactions Over Time
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <YAxis
            yAxisId="left"
            tickFormatter={formatCurrency}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={formatCount}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={v => (v === 'payment' ? 'Revenue' : 'Transactions')}
            wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
          />
          <Bar
            yAxisId="left"
            dataKey="payment"
            name="payment"
            fill="#4f46e5"
            radius={[4, 4, 0, 0]}
            opacity={0.85}
            maxBarSize={52}
          />
          <Line
            yAxisId="right"
            dataKey="transactions"
            name="transactions"
            type="monotone"
            stroke="#f59e0b"
            strokeWidth={2.5}
            dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
