export function spreadsheetSafeCell(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/^[\t\r\n]/.test(text) || /^\s*[=+\-@]/.test(text)) {
    return `'${text}`;
  }
  return text;
}

export function recordsToCsv(rows: Array<Record<string, unknown>>, columns?: string[]) {
  const headers = columns?.length
    ? columns
    : Array.from(
        rows.reduce<Set<string>>((set, row) => {
          Object.keys(row).forEach((key) => set.add(key));
          return set;
        }, new Set())
      );
  return [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = spreadsheetSafeCell(row[header]);
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(",")
    )
  ].join("\n");
}
