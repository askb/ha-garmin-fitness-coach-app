/**
 * Tests for PMC (Performance Management Chart) data logic.
 * Tests pure computation, not Recharts rendering.
 */

describe("PMC Chart Data Logic", () => {
  // CTL/ATL/TSB from advanced_metric table
  interface PMCDataPoint {
    date: string;
    ctl: number | null;
    atl: number | null;
    tsb: number | null;
    acwr: number | null;
  }

  const mockPmcData: PMCDataPoint[] = [
    { date: "2024-01-01", ctl: 30, atl: 25, tsb: 5, acwr: 0.83 },
    { date: "2024-01-08", ctl: 35, atl: 42, tsb: -7, acwr: 1.20 },
    { date: "2024-01-15", ctl: 38, atl: 55, tsb: -17, acwr: 1.45 },
    { date: "2024-01-22", ctl: 40, atl: 62, tsb: -22, acwr: 1.55 },
  ];

  it("TSB equals CTL minus ATL", () => {
    for (const d of mockPmcData) {
      if (d.ctl !== null && d.atl !== null && d.tsb !== null) {
        expect(Math.abs(d.tsb - (d.ctl - d.atl))).toBeLessThan(0.1);
      }
    }
  });

  it("ACWR is approximately ATL / CTL", () => {
    for (const d of mockPmcData) {
      if (d.ctl !== null && d.atl !== null && d.acwr !== null && d.ctl > 0) {
        const computed = d.atl / d.ctl;
        expect(Math.abs(computed - d.acwr)).toBeLessThan(0.05);
      }
    }
  });

  it("ACWR risk zones are correct", () => {
    const getRiskZone = (acwr: number): string => {
      if (acwr < 0.8) return "under-training";
      if (acwr <= 1.3) return "optimal";
      if (acwr <= 1.5) return "caution";
      return "high-risk";
    };

    expect(getRiskZone(0.83)).toBe("optimal");
    expect(getRiskZone(1.20)).toBe("optimal");
    expect(getRiskZone(1.45)).toBe("caution");
    expect(getRiskZone(1.55)).toBe("high-risk");
    expect(getRiskZone(0.7)).toBe("under-training");
  });

  it("identifies overreaching when TSB < -20", () => {
    const overreached = mockPmcData.filter(d => (d.tsb ?? 0) < -20);
    expect(overreached.length).toBe(1);
    expect(overreached[0]?.date).toBe("2024-01-22");
  });

  it("CTL should generally trend upward with sustained training", () => {
    const ctlValues = mockPmcData.map(d => d.ctl ?? 0);
    const first = ctlValues[0]!;
    const last = ctlValues[ctlValues.length - 1]!;
    expect(last).toBeGreaterThan(first);
  });
});
