// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";

import {
  cosineSim,
  isMemoryEnabled,
  isoWeekKey,
  monthKey,
  renderHistoryBlock,
} from "../memory";

describe("cosineSim", () => {
  it("is 1 for identical vectors and 0 for orthogonal", () => {
    expect(cosineSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it("guards against empty / mismatched / zero vectors", () => {
    expect(cosineSim([], [])).toBe(0);
    expect(cosineSim([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSim([0, 0], [0, 0])).toBe(0);
  });
});

describe("period keys", () => {
  it("computes ISO week keys", () => {
    // 2026-01-01 is a Thursday → ISO week 2026-W01
    expect(isoWeekKey(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
    expect(monthKey(new Date("2026-03-15T00:00:00Z"))).toBe("2026-03");
  });
});

describe("renderHistoryBlock", () => {
  it("returns empty string when nothing to add (no noise when disabled)", () => {
    expect(renderHistoryBlock({ summaries: [], rollup: null })).toBe("");
  });
  it("wraps rollup + summaries in a delimited block", () => {
    const out = renderHistoryBlock({
      summaries: ["Week 2026-W01: 3 activities"],
      rollup: "Year 2026: 120 activities",
    });
    expect(out.startsWith("[HISTORY]")).toBe(true);
    expect(out.trimEnd().endsWith("[/HISTORY]")).toBe(true);
    expect(out).toContain("Year 2026");
    expect(out).toContain("Week 2026-W01");
  });
});

describe("isMemoryEnabled", () => {
  const prev = { ...process.env };
  afterEach(() => {
    process.env.COACH_MEMORY_ENABLED = prev.COACH_MEMORY_ENABLED;
    process.env.OLLAMA_URL = prev.OLLAMA_URL;
  });
  it("explicit flag overrides", () => {
    process.env.COACH_MEMORY_ENABLED = "false";
    process.env.OLLAMA_URL = "http://x:11434";
    expect(isMemoryEnabled()).toBe(false);
    process.env.COACH_MEMORY_ENABLED = "true";
    delete process.env.OLLAMA_URL;
    expect(isMemoryEnabled()).toBe(true);
  });
  it("defaults on when OLLAMA_URL set, off otherwise", () => {
    delete process.env.COACH_MEMORY_ENABLED;
    process.env.OLLAMA_URL = "http://x:11434";
    expect(isMemoryEnabled()).toBe(true);
    delete process.env.OLLAMA_URL;
    expect(isMemoryEnabled()).toBe(false);
  });
});
