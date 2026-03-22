/**
 * Tests for CSV export utility functions.
 */

// Pure function to test — extracted from export page logic
function exportToCSV(data: Record<string, unknown>[], filename: string): string {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]!);
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      if (typeof val === "string" && val.includes(",")) return `"${val}"`;
      return String(val);
    }).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

describe("CSV Export Utility", () => {
  it("produces correct headers from data keys", () => {
    const data = [{ date: "2024-01-01", hrv: 48, steps: 8000 }];
    const csv = exportToCSV(data, "test.csv");
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toBe("date,hrv,steps");
  });

  it("produces correct number of rows (header + data)", () => {
    const data = [
      { date: "2024-01-01", hrv: 48 },
      { date: "2024-01-02", hrv: 52 },
      { date: "2024-01-03", hrv: 45 },
    ];
    const csv = exportToCSV(data, "test.csv");
    const lines = csv.split("\n");
    expect(lines.length).toBe(4); // 1 header + 3 data rows
  });

  it("handles null values as empty strings", () => {
    const data = [{ date: "2024-01-01", hrv: null, steps: 8000 }];
    const csv = exportToCSV(data, "test.csv");
    const dataLine = csv.split("\n")[1]!;
    expect(dataLine).toBe("2024-01-01,,8000");
  });

  it("quotes strings containing commas", () => {
    const data = [{ name: "Running, Easy", value: 5 }];
    const csv = exportToCSV(data, "test.csv");
    const dataLine = csv.split("\n")[1]!;
    expect(dataLine).toContain('"Running, Easy"');
  });

  it("returns empty string for empty data", () => {
    const csv = exportToCSV([], "test.csv");
    expect(csv).toBe("");
  });
});
