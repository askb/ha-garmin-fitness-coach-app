import {
  DURATION_CHIPS,
  END_CHOICES,
  endIsoFromChoice,
  fmtEnd,
  parseApiResponse,
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
  // Derive expectations with the same Intl options fmtEnd uses, so the
  // assertions hold in any CI locale / hour-cycle.
  const timeOf = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const dateOf = (d: Date) =>
    d.toLocaleDateString([], { month: "short", day: "numeric" });

  it("shows time only for same-day ends", () => {
    const end = new Date("2026-07-11T14:15:00");
    expect(fmtEnd("2026-07-11T14:15:00", now)).toBe(timeOf(end));
  });

  it("adds the date for older ends", () => {
    const end = new Date("2026-07-09T14:15:00");
    expect(fmtEnd("2026-07-09T14:15:00", now)).toBe(
      `${dateOf(end)} ${timeOf(end)}`,
    );
  });

  it("falls back to the raw string when unparseable", () => {
    expect(fmtEnd("garbage", now)).toBe("garbage");
  });
});

describe("parseApiResponse", () => {
  // jsdom has no global Response; a {json, status} stub is all it needs.
  it("returns the parsed body for JSON responses", async () => {
    const res = { status: 200, json: () => Promise.resolve({ success: true }) };
    await expect(parseApiResponse(res)).resolves.toEqual({ success: true });
  });

  it("degrades non-JSON bodies to an HTTP-status message", async () => {
    const res = {
      status: 500,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    };
    await expect(parseApiResponse(res)).resolves.toEqual({
      success: false,
      message: "Unexpected response (HTTP 500)",
    });
  });
});

describe("constants", () => {
  it("duration chips are sane meeting lengths", () => {
    expect(DURATION_CHIPS).toEqual([15, 30, 45, 60]);
  });
});
