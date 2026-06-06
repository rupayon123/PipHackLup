export type CsvRow = Record<string, string>;

export function toCsv(rows: CsvRow[], columns = inferColumns(rows)): string {
  const header = columns.map(escapeCsvCell).join(",");
  const body = rows.map((row) => columns.map((column) => escapeCsvCell(row[column] ?? "")).join(","));
  return [header, ...body].join("\n");
}

export function fromCsv(csv: string): CsvRow[] {
  const records = parseCsvRecords(csv.trim());
  const [header, ...rows] = records;
  if (!header) return [];

  return rows.map((row) =>
    Object.fromEntries(header.map((column, index) => [column, row[index] ?? ""]))
  );
}

function inferColumns(rows: CsvRow[]): string[] {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))];
}

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function parseCsvRecords(input: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      record.push(cell);
      cell = "";
    } else if (char === "\n") {
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  record.push(cell);
  records.push(record);
  return records;
}
