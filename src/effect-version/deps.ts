/**
 * Pure data helpers used by the `effect-version` CLI for parsing,
 * editing, and writing `package.json` dep records.
 *
 * Kept separate from `scripts/effect-version.ts` so tests can import
 * them without triggering the CLI's `BunRuntime.runMain`.
 */

export const isEffectDep = (name: string): boolean => name === "effect" || name.startsWith("@effect/");

export const splitVersionPrefix = (spec: string): { prefix: string; version: string } => {
  const match = spec.match(/^([\^~><=]*)(.*)$/);
  if (match === null) return { prefix: "", version: spec };
  return { prefix: match[1] ?? "", version: match[2] ?? "" };
};

export const detectIndent = (text: string): string => {
  const match = text.match(/\n([\t ]+)\S/);
  return match !== null && match[1] !== undefined ? match[1] : "  ";
};

export const detectTrailingNewline = (text: string): boolean => text.endsWith("\n");

export const bumpDepsRecord = (
  record: Record<string, string>,
  newVersion: string
): { record: Record<string, string>; changed: number } => {
  const entries = Object.entries(record).map(([name, current]) => {
    if (!isEffectDep(name)) return { entry: [name, current] as const, changed: 0 };
    const { prefix, version } = splitVersionPrefix(current);
    if (version === newVersion) return { entry: [name, current] as const, changed: 0 };
    return { entry: [name, `${prefix}${newVersion}`] as const, changed: 1 };
  });
  return {
    record: Object.fromEntries(entries.map((e) => e.entry)),
    changed: entries.reduce((sum, e) => sum + e.changed, 0)
  };
};

/**
 * Bump every `effect` + `@effect/*` dep in a `package.json` text to
 * `newVersion`, preserving the file's existing indent + trailing-newline
 * style and any version prefixes (^, ~). Returns the new text and count of
 * deps changed.
 */
export const bumpEffectDeps = (text: string, newVersion: string): { text: string; changed: number } => {
  const indent = detectIndent(text);
  const trailing = detectTrailingNewline(text);
  const parsed = JSON.parse(text) as Record<string, unknown>;

  const bumpKey = (key: "dependencies" | "devDependencies") => {
    const deps = parsed[key];
    if (typeof deps !== "object" || deps === null) {
      return { record: undefined as Record<string, string> | undefined, changed: 0 };
    }
    return bumpDepsRecord(deps as Record<string, string>, newVersion);
  };

  const depsResult = bumpKey("dependencies");
  const devResult = bumpKey("devDependencies");

  const updated = {
    ...parsed,
    ...(depsResult.record !== undefined ? { dependencies: depsResult.record } : {}),
    ...(devResult.record !== undefined ? { devDependencies: devResult.record } : {})
  };

  const out = JSON.stringify(updated, null, indent);
  return { text: trailing ? `${out}\n` : out, changed: depsResult.changed + devResult.changed };
};
