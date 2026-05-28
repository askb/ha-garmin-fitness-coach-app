// SPDX-FileCopyrightText: 2026 Anil Belur <askb23@gmail.com>
// SPDX-License-Identifier: Apache-2.0

/**
 * Normalize markdown ordered-list blocks emitted by LLMs.
 *
 * Only line-starting ordered-list markers are rewritten. Separate list blocks
 * restart at 1 so paragraphs can safely divide independent lists.
 */
export function renumberOrderedLists(text: string): string {
  const lines = text.split("\n");
  let expected = 1;
  let inList = false;

  return lines
    .map((line) => {
      const match = /^(\d+)\.\s+(.*)$/.exec(line);
      if (!match) {
        if (line.trim() === "" || !/^\s+/.test(line)) {
          inList = false;
          expected = 1;
        }
        return line;
      }

      const [, , content] = match;
      const number = inList ? expected : 1;
      inList = true;
      expected = number + 1;
      return `${number}. ${content}`;
    })
    .join("\n");
}
