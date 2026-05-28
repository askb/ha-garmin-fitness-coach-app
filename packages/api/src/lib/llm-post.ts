// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Normalize markdown ordered-list blocks emitted by LLMs.
 *
 * Only line-starting ordered-list markers are rewritten. Separate list blocks
 * restart at 1 so paragraphs can safely divide independent lists.
 */
export function renumberOrderedLists(
  text: string,
  options?: { resetEachBlock?: boolean },
): string {
  const { resetEachBlock = true } = options ?? {};
  const lines = text.split("\n");
  const topLevelOrderedLine = /^(\d+)\.\s+(.*)$/;
  const orderedItems = lines
    .map((line, index) => {
      const match = topLevelOrderedLine.exec(line);
      return match ? { index, content: match[2] } : null;
    })
    .filter(
      (item): item is { index: number; content: string } => item !== null,
    );

  let expected = 1;
  for (let i = 0; i < orderedItems.length; i += 1) {
    const current = orderedItems[i]!;
    const previous = orderedItems[i - 1];

    if (previous) {
      const bridge = lines.slice(previous.index + 1, current.index);
      const nonEmptyBridgeLines = bridge.filter(
        (line) => line.trim() !== "" && !/^\s+/.test(line),
      );
      const shouldReset =
        nonEmptyBridgeLines.length >= 3 ||
        (resetEachBlock && nonEmptyBridgeLines.length > 0);
      if (shouldReset) {
        expected = 1;
      }
    }

    lines[current.index] = `${expected}. ${current.content}`;
    expected += 1;
  }

  return lines.join("\n");
}
