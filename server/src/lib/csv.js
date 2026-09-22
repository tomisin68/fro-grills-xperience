function cell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Stop spreadsheet apps from executing text that looks like a formula.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** columns: [label, (row) => value][] */
export function toCsv(rows, columns) {
  const lines = [columns.map(([label]) => cell(label)).join(',')];
  for (const row of rows) lines.push(columns.map(([, get]) => cell(get(row))).join(','));
  return lines.join('\r\n');
}

export function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`﻿${csv}`);
}

export const major = (minor) => (minor / 100).toFixed(2);
