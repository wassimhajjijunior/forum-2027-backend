export const CSV_COLUMNS = Object.freeze([
  'id',
  'full_name',
  'email',
  'university',
  'created_at',
]);

export const CSV_HEADER_LINE = `${CSV_COLUMNS.join(',')}\r\n`;

export function escapeCsvField(value) {
  if (value === null || value === undefined) return '';

  let text = String(value);

  // Neutralize spreadsheet formula injection in exported cells.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function formatCsvRow(values) {
  return `${values.map(escapeCsvField).join(',')}\r\n`;
}

export function registrationCsvLine(row) {
  return formatCsvRow([
    row.id,
    row.full_name,
    row.email,
    row.university,
    row.created_at,
  ]);
}
