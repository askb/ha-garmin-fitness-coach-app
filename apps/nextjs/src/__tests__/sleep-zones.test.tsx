/**
 * Tests for sleep stage computation and display logic.
 */

describe("Sleep Stage Analysis", () => {
  interface SleepData {
    totalSleepMinutes: number;
    deepSleepMinutes: number;
    remSleepMinutes: number;
    lightSleepMinutes: number;
    awakeMinutes: number;
  }

  const mockSleep: SleepData = {
    totalSleepMinutes: 420,   // 7h
    deepSleepMinutes: 90,     // 1.5h
    remSleepMinutes: 90,      // 1.5h
    lightSleepMinutes: 210,   // 3.5h
    awakeMinutes: 30,
  };

  it("sleep stages sum to approximate total", () => {
    const stagesSum =
      mockSleep.deepSleepMinutes +
      mockSleep.remSleepMinutes +
      mockSleep.lightSleepMinutes +
      mockSleep.awakeMinutes;
    // Should be within 5 minutes of total (Garmin rounding)
    expect(Math.abs(stagesSum - mockSleep.totalSleepMinutes)).toBeLessThanOrEqual(5);
  });

  it("deep sleep percentage is within healthy range", () => {
    const deepPct = (mockSleep.deepSleepMinutes / mockSleep.totalSleepMinutes) * 100;
    // Normal: 13-23% deep sleep (Hirshkowitz et al. 2015)
    expect(deepPct).toBeGreaterThanOrEqual(10);
    expect(deepPct).toBeLessThanOrEqual(30);
  });

  it("REM percentage is within healthy range", () => {
    const remPct = (mockSleep.remSleepMinutes / mockSleep.totalSleepMinutes) * 100;
    // Normal: 20-25% REM
    expect(remPct).toBeGreaterThanOrEqual(15);
    expect(remPct).toBeLessThanOrEqual(30);
  });

  it("classifies sleep duration correctly", () => {
    const classifySleep = (minutes: number): string => {
      if (minutes >= 480) return "optimal";       // 8h+
      if (minutes >= 420) return "adequate";      // 7h+
      if (minutes >= 360) return "fair";          // 6h+
      return "insufficient";
    };

    expect(classifySleep(420)).toBe("adequate");
    expect(classifySleep(490)).toBe("optimal");
    expect(classifySleep(370)).toBe("fair");
    expect(classifySleep(300)).toBe("insufficient");
  });
});
