// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { renumberOrderedLists } from "../llm-post";

describe("renumberOrderedLists", () => {
  it("renumbers skipped ordered-list markers consecutively", () => {
    expect(renumberOrderedLists("1. a\n2. b\n10. c\n18. d")).toBe(
      "1. a\n2. b\n3. c\n4. d",
    );
  });

  it("renumbers multiple ordered-list blocks independently", () => {
    expect(renumberOrderedLists("4. first\n9. second\n\nIntro\n7. next")).toBe(
      "1. first\n2. second\n\nIntro\n1. next",
    );
  });

  it("keeps list numbering over blank separators within a block", () => {
    expect(renumberOrderedLists("1. first\n\n9. second\n\n10. third")).toBe(
      "1. first\n\n2. second\n\n3. third",
    );
  });

  it("supports continuous numbering through short bridge paragraphs", () => {
    expect(
      renumberOrderedLists("1. first\n\nBridge text\n\n9. second", {
        resetEachBlock: false,
      }),
    ).toBe("1. first\n\nBridge text\n\n2. second");
  });

  it("preserves nested ordered-list counters", () => {
    expect(renumberOrderedLists("1. Main\n   1. Sub\n2. Next")).toBe(
      "1. Main\n   1. Sub\n2. Next",
    );
  });

  it("leaves bulleted lists untouched", () => {
    expect(renumberOrderedLists("* foo\n- bar\n1. baz")).toBe(
      "* foo\n- bar\n1. baz",
    );
  });

  it("leaves mid-paragraph numbers untouched", () => {
    expect(renumberOrderedLists("Training in 2026 matters.\n10. Start")).toBe(
      "Training in 2026 matters.\n1. Start",
    );
  });
});
