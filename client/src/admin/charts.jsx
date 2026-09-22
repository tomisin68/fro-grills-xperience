import { Table2, ChartColumn } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, cx } from '../components/ui';

// Categorical slots, validated for colour-blind separation on the white card surface
// (dataviz validate_palette: all checks pass). Slot order is fixed: never cycle or re-rank.
export const SERIES = ['#e0450c', '#2a78d6'];
const INK_MUTED = '#8a8580';
const GRID = '#ebe8e4';
const AXIS = '#d6d3ce';

/** A card that can flip between its chart and a plain table of the same numbers. */
export function ChartCard({ title, subtitle, legend, table, children, className, dim }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={cx('p-4 sm:p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-coal-950">{title}</h2>
          {subtitle && <p className="text-sm text-stone-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4">
          {legend && !asTable && (
            <ul className="flex flex-wrap gap-3 text-xs text-stone-600">
              {legend.map((l) => (
                <li key={l.label} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px]" style={{ background: l.color }} />
                  {l.label}
                </li>
              ))}
            </ul>
          )}
          {table && (
            <button
              onClick={() => setAsTable(!asTable)}
              className="no-print inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-stone-500 ring-1 ring-stone-200 hover:text-coal-950"
            >
              {asTable ? <ChartColumn className="size-3.5" /> : <Table2 className="size-3.5" />}
              {asTable ? 'Chart' : 'Table'}
            </button>
          )}
        </div>
      </div>
      <div className={cx('transition-opacity', dim && 'opacity-50')}>
        {asTable ? (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {table.columns.map((c, i) => (
                    <th key={c} className={cx('border-b border-stone-200 py-2 text-xs font-semibold text-stone-500', i ? 'text-right' : 'text-left')}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, i) => (
                      <td key={i} className={cx('border-b border-stone-100 py-1.5', i ? 'text-right tabular-nums' : '')}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

function ChartTooltip({ active, payload, label, formatLabel, formatValue, extra }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-xl bg-white px-3 py-2.5 text-sm shadow-lg ring-1 ring-stone-200">
      <p className="mb-1 text-xs text-stone-500">{formatLabel(label)}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="h-0.5 w-3 rounded-full" style={{ background: p.color }} />
          <span className="font-semibold text-coal-950">{formatValue(p.value)}</span>
          <span className="text-stone-500">{p.name}</span>
        </p>
      ))}
      {extra && <div className="mt-1 border-t border-stone-100 pt-1 text-xs text-stone-500">{extra(payload[0].payload)}</div>}
    </div>
  );
}

/**
 * Vertical columns sharing one y-axis. series: [{ key, label }] (max two, colours by slot).
 * All series must share a unit - never two scales on one plot.
 */
export function ColumnChart({ data, xKey, series, formatX = String, formatLabel = formatX, formatValue = String, formatAxis = formatValue, extra, height = 260 }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey={xKey}
            tickFormatter={formatX}
            tick={{ fill: INK_MUTED, fontSize: 11 }}
            axisLine={{ stroke: AXIS }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tickFormatter={formatAxis}
            tick={{ fill: INK_MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={64}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(20,17,15,0.04)' }}
            content={<ChartTooltip formatLabel={formatLabel} formatValue={formatValue} extra={extra} />}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={SERIES[i]}
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              activeBar={{ fillOpacity: 0.8 }}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranked horizontal bars for one measure across named categories. Values are always written out. */
export function BarList({ rows, formatValue = String, empty = 'No data yet' }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-stone-500">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${formatValue(r.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-coal-900">{r.label}</span>
            <span className="shrink-0 font-semibold text-coal-950 tabular-nums">
              {formatValue(r.value)}
              {r.note && <span className="ml-1.5 text-xs font-normal text-stone-500">{r.note}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-stone-100">
            <div className="h-2 rounded-full" style={{ width: `${Math.max((r.value / max) * 100, 1.5)}%`, background: SERIES[0] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
