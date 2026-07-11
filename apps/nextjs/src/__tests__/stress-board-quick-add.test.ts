import {
  DURATION_CHIPS,
  END_CHOICES,
  endIsoFromChoice,
  fmtEnd,
} from "../app/stress-board/quick-add-lib";

describe("endIsoFromChoice", () => {
  const now = new Date("2026-07-11T10:00:00.000Z");

  it("returns undefined for 'just now' so the server stamps the time", () => {
    expect(endIsoFromChoice("now", now)).toBeUndefined();
  });

  it("computes relative timestamps for each ago choice", () => {
    expect(endIsoFromChoice("30m", now)).toBe("2026-07-11T09:30:00.000Z");
    expect(endIsoFromChoice("1h", now)).toBe("2026-07-11T09:00:00.000Z");
    expect(endIsoFromChoice("2h", now)).toBe("2026-07-11T08:00:00.000Z");
    expect(endIsoFromChoice("4h", now)).toBe("2026-07-11T06:00:00.000Z");
  });

  it("covers every non-now choice in END_CHOICES", () => {
    for (const c of END_CHOICES) {
      const iso = endIsoFromChoice(c.key, now);
      if (c.key === "now") expect(iso).toBeUndefined();
      else expect(iso).toBeDefined();
    }
  });
});

describe("fmtEnd", () => {
  const now = new Date("2026-07-11T22:00:00");

  it("shows time only for same-day ends", () => {
    expect(fmtEnd("2026-07-11T14:15:00", now)).toMatch(/2:15/);
    expect(fmtEnd("2026-07-11T14:15:00", now)).not.toMatch(/Jul/);
  });

  it("adds the date for older ends", () => {
    expect(fmtEnd("2026-07-09T14:15:00", now)).toMatch(/Jul 9/);
  });

  it("falls back to the raw string when unparseable", () => {
    expect(fmtEnd("garbage", now)).toBe("garbage");
  });
});

describe("constants", () => {
  it("duration chips are sane meeting lengths", () => {
    expect(DURATION_CHIPS).toEqual([15, 30, 45, 60]);
  });
});
