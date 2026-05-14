import { Order, pipe } from "effect";
import * as Arr from "effect/Array";
import { describe, expect, it } from "vitest";

import { formatFeedback } from "../src/audit/format/claude-hook.ts";
import type { Pattern } from "../src/patterns/types.ts";

const make = (over: Partial<Pattern>): Pattern => ({
  name: "p",
  description: "desc",
  event: "after",
  toolRegex: ".*",
  level: "warning",
  detector: { kind: "regex", pattern: "x", matchInComments: false },
  guidance: "guidance body",
  sourcePath: "/x",
  ...over
});

describe("formatFeedback", () => {
  it("orders matches by severity then name", () => {
    const out = formatFeedback(
      [
        make({ name: "b-warn", level: "warning" }),
        make({ name: "a-crit", level: "critical" }),
        make({ name: "a-warn", level: "warning" }),
        make({ name: "a-info", level: "info" })
      ],
      "/some/file.ts"
    );
    const order = ["a-crit", "a-warn", "b-warn", "a-info"];
    const positions = order.map((n) => out.indexOf(`- ${n} `));
    expect(positions, "severity ordering broken").toEqual(pipe(positions, Arr.sort(Order.Number)));
  });

  it("dedupes by name", () => {
    const p = make({ name: "dup" });
    const out = formatFeedback([p, p, p], "/f.ts");
    const occurrences = out.split("- dup [").length - 1;
    expect(occurrences).toBe(1);
  });

  it("appends suggested-references hint when present", () => {
    const out = formatFeedback(
      [make({ name: "p1", suggestedReferences: ["references/errors.md"] })],
      "/f.ts"
    );
    expect(out).toContain("references/errors.md");
    expect(out).toMatch(/For depth, see/);
  });

  it("omits references hint when no suggestions", () => {
    const out = formatFeedback([make({ name: "p1" })], "/f.ts");
    expect(out).not.toContain("For depth, see");
  });

  it("embeds the file path", () => {
    const out = formatFeedback([make({ name: "p1" })], "/abs/path/to/file.ts");
    expect(out).toContain("/abs/path/to/file.ts");
  });
});
