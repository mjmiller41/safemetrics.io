import type { ReactNode } from 'react'

/**
 * Every chart ships a table twin. Tooltips enhance; they never gate — the table
 * is where a screen reader, a keyboard, or a print-out gets the same numbers.
 */
export function TableView({
  columns,
  rows,
  caption,
}: {
  columns: string[]
  rows: (string | number)[][]
  caption: string
}) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-slate-800">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            {columns.map((column, i) => (
              <th key={column} scope="col" className={`px-3 py-2 font-medium ${i === 0 ? '' : 'text-right'}`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-1.5 ${
                    j === 0 ? 'text-slate-300' : 'text-right tabular-nums text-slate-200'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ChartFrame({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export function ViewToggle({ table, onChange }: { table: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!table)}
      aria-pressed={table}
      className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      {table ? 'Chart' : 'Table'}
    </button>
  )
}
