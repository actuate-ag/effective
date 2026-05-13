import { describe, expect, it } from "vitest";

import {
  bumpDepsRecord,
  bumpEffectDeps,
  detectIndent,
  detectTrailingNewline,
  isEffectDep,
  splitVersionPrefix
} from "../src/effect-version/deps.ts";

describe("isEffectDep", () => {
  it("matches the effect package", () => {
    expect(isEffectDep("effect")).toBe(true);
  });
  it("matches @effect/* scoped packages", () => {
    expect(isEffectDep("@effect/platform")).toBe(true);
    expect(isEffectDep("@effect/platform-bun")).toBe(true);
    expect(isEffectDep("@effect/vitest")).toBe(true);
  });
  it("does not match unrelated packages", () => {
    expect(isEffectDep("react")).toBe(false);
    expect(isEffectDep("@types/node")).toBe(false);
    expect(isEffectDep("effects")).toBe(false);
    expect(isEffectDep("@effects/something")).toBe(false);
  });
});

describe("splitVersionPrefix", () => {
  it("handles a bare version", () => {
    expect(splitVersionPrefix("4.0.0")).toEqual({ prefix: "", version: "4.0.0" });
  });
  it("preserves a caret prefix", () => {
    expect(splitVersionPrefix("^4.0.0")).toEqual({ prefix: "^", version: "4.0.0" });
  });
  it("preserves a tilde prefix", () => {
    expect(splitVersionPrefix("~4.0.0-beta.59")).toEqual({ prefix: "~", version: "4.0.0-beta.59" });
  });
  it("preserves comparison prefixes", () => {
    expect(splitVersionPrefix(">=4.0.0")).toEqual({ prefix: ">=", version: "4.0.0" });
  });
  it("returns empty for the empty string", () => {
    expect(splitVersionPrefix("")).toEqual({ prefix: "", version: "" });
  });
});

describe("detectIndent", () => {
  it("detects tabs", () => {
    expect(detectIndent('{\n\t"a": 1\n}')).toBe("\t");
  });
  it("detects 2 spaces", () => {
    expect(detectIndent('{\n  "a": 1\n}')).toBe("  ");
  });
  it("detects 4 spaces", () => {
    expect(detectIndent('{\n    "a": 1\n}')).toBe("    ");
  });
  it("defaults to 2 spaces when no indent is found", () => {
    expect(detectIndent('{"a":1}')).toBe("  ");
  });
});

describe("detectTrailingNewline", () => {
  it("detects a present trailing newline", () => {
    expect(detectTrailingNewline("foo\n")).toBe(true);
  });
  it("detects an absent trailing newline", () => {
    expect(detectTrailingNewline("foo")).toBe(false);
  });
});

describe("bumpDepsRecord", () => {
  it("bumps matching deps and counts changes", () => {
    const { record, changed } = bumpDepsRecord(
      { "effect": "4.0.0-beta.59", "@effect/platform-bun": "4.0.0-beta.59", "react": "18.0.0" },
      "4.0.0-beta.66"
    );
    expect(record).toEqual({
      "effect": "4.0.0-beta.66",
      "@effect/platform-bun": "4.0.0-beta.66",
      "react": "18.0.0"
    });
    expect(changed).toBe(2);
  });
  it("preserves prefixes when bumping", () => {
    const { record } = bumpDepsRecord({ "effect": "^4.0.0-beta.59", "@effect/cli": "~4.0.0-beta.59" }, "4.0.0-beta.66");
    expect(record).toEqual({ "effect": "^4.0.0-beta.66", "@effect/cli": "~4.0.0-beta.66" });
  });
  it("returns changed=0 when no effect deps are present", () => {
    const { record, changed } = bumpDepsRecord({ "react": "18.0.0" }, "4.0.0-beta.66");
    expect(record).toEqual({ "react": "18.0.0" });
    expect(changed).toBe(0);
  });
  it("returns changed=0 when effect deps already match", () => {
    const { record, changed } = bumpDepsRecord({ "effect": "4.0.0-beta.66" }, "4.0.0-beta.66");
    expect(record).toEqual({ "effect": "4.0.0-beta.66" });
    expect(changed).toBe(0);
  });
});

describe("bumpEffectDeps", () => {
  it("bumps both dependencies and devDependencies", () => {
    const input = JSON.stringify(
      {
        name: "demo",
        dependencies: { "effect": "4.0.0-beta.59", "react": "18.0.0" },
        devDependencies: { "@effect/vitest": "4.0.0-beta.59" }
      },
      null,
      "\t"
    );
    const { text, changed } = bumpEffectDeps(input, "4.0.0-beta.66");
    expect(changed).toBe(2);
    const parsed = JSON.parse(text) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(parsed.dependencies.effect).toBe("4.0.0-beta.66");
    expect(parsed.dependencies.react).toBe("18.0.0");
    expect(parsed.devDependencies["@effect/vitest"]).toBe("4.0.0-beta.66");
  });
  it("preserves tab indent", () => {
    const input = '{\n\t"dependencies": {\n\t\t"effect": "4.0.0-beta.59"\n\t}\n}';
    const { text } = bumpEffectDeps(input, "4.0.0-beta.66");
    expect(text).toMatch(/\n\t"dependencies"/);
    expect(text).toMatch(/\n\t\t"effect"/);
  });
  it("preserves 2-space indent", () => {
    const input = '{\n  "dependencies": {\n    "effect": "4.0.0-beta.59"\n  }\n}';
    const { text } = bumpEffectDeps(input, "4.0.0-beta.66");
    expect(text).toMatch(/\n  "dependencies"/);
    expect(text).toMatch(/\n    "effect"/);
  });
  it("preserves trailing newline", () => {
    const withNewline = '{\n  "dependencies": { "effect": "4.0.0-beta.59" }\n}\n';
    const withoutNewline = '{\n  "dependencies": { "effect": "4.0.0-beta.59" }\n}';
    expect(bumpEffectDeps(withNewline, "4.0.0-beta.66").text.endsWith("\n")).toBe(true);
    expect(bumpEffectDeps(withoutNewline, "4.0.0-beta.66").text.endsWith("\n")).toBe(false);
  });
  it("returns changed=0 when nothing matches", () => {
    const input = '{ "dependencies": { "react": "18.0.0" } }';
    const { changed } = bumpEffectDeps(input, "4.0.0-beta.66");
    expect(changed).toBe(0);
  });
});
