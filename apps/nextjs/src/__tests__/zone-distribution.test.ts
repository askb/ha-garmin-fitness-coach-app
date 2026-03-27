/**
 * Tests for HR zone distribution calculations.
 */

describe("HR Zone Distribution", () => {
  interface ZoneMinutes {
    zone1: number;
    zone2: number;
    zone3: number;
    zone4: number;
    zone5: number;
  }

  function computeZonePct(zones: ZoneMinutes): Record<string, number> {
    const total = Object.values(zones).reduce((a, b) => a + b, 0);
    if (total === 0)
      return { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 };
    return Object.fromEntries(
      Object.entries(zones).map(([k, v]) => [k, Math.round((v / total) * 100)]),
    );
  }

  it("zone percentages sum to approximately 100", () => {
    const zones: ZoneMinutes = {
      zone1: 30,
      zone2: 60,
      zone3: 20,
      zone4: 15,
      zone5: 5,
    };
    const pct = computeZonePct(zones);
    const total = Object.values(pct).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(2); // allow rounding
  });

  it("polarized training has >70% in zones 1-2", () => {
    const polarized: ZoneMinutes = {
      zone1: 100,
      zone2: 80,
      zone3: 10,
      zone4: 10,
      zone5: 5,
    };
    const pct = computeZonePct(polarized);
    const lowIntensity = pct.zone1! + pct.zone2!;
    expect(lowIntensity).toBeGreaterThanOrEqual(70);
  });

  it("handles all-zero zones gracefully", () => {
    const empty: ZoneMinutes = {
      zone1: 0,
      zone2: 0,
      zone3: 0,
      zone4: 0,
      zone5: 0,
    };
    const pct = computeZonePct(empty);
    expect(Object.values(pct).every((v) => v === 0)).toBe(true);
  });

  it("classifies training distribution type", () => {
    const classifyDistribution = (zones: ZoneMinutes): string => {
      const pct = computeZonePct(zones);
      const lowPct = (pct.zone1 ?? 0) + (pct.zone2 ?? 0);
      const highPct = (pct.zone4 ?? 0) + (pct.zone5 ?? 0);
      if (lowPct >= 75 && highPct >= 10) return "polarized";
      if (lowPct >= 60 && highPct < 10) return "pyramidal";
      if ((pct.zone3 ?? 0) + (pct.zone4 ?? 0) >= 40) return "threshold";
      return "mixed";
    };
    const polarized: ZoneMinutes = {
      zone1: 80,
      zone2: 20,
      zone3: 5,
      zone4: 10,
      zone5: 5,
    };
    expect(classifyDistribution(polarized)).toBe("polarized");
  });
});
