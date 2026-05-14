import { describe, expect, it } from "vitest";

import { patterns } from "../src/patterns/index.ts";

describe("patterns catalog (static index)", () => {
  it("contains 46 patterns", () => {
    expect(patterns.length).toBe(46);
  });

  it("every pattern has a name and a detector", () => {
    patterns.forEach((p) => {
      expect(p.name, `pattern at ${p.sourcePath} missing name`).not.toBe("");
      expect(p.detector, `pattern ${p.name} missing detector`).toBeDefined();
    });
  });

  it("every pattern has a non-empty guidance body", () => {
    patterns.forEach((p) => {
      expect(p.guidance.length, `${p.name} has empty guidance`).toBeGreaterThan(0);
    });
  });

  it("every pattern has a recognized severity", () => {
    const valid = new Set(["critical", "high", "medium", "warning", "info"]);
    patterns.forEach((p) => {
      expect(valid.has(p.level), `${p.name} has bogus level ${p.level}`).toBe(true);
    });
  });

  it("pattern names are unique", () => {
    const names = patterns.map((p) => p.name);
    expect(new Set(names).size, "duplicate pattern names").toBe(names.length);
  });
});
