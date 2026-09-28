function escapeCsvCell(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(rows, columns) {
  const cols =
    columns ||
    (rows.length > 0
      ? Object.keys(rows[0])
      : []);
  const header = cols.map(escapeCsvCell).join(",");
  const body = rows.map((row) => cols.map((key) => escapeCsvCell(row[key])).join(","));
  return [header, ...body].join("\n");
}

export function csvFilename(reportKey, fromDate, toDate) {
  const from = fromDate ? String(fromDate).slice(0, 10) : "all";
  const to = toDate ? String(toDate).slice(0, 10) : "all";
  return `${reportKey}_${from}_${to}.csv`;
}

export function sendCsvReply(reply, { filename, csv }) {
  return reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .code(200)
    .send(csv);
}
