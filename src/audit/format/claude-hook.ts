import { Order, pipe } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";

import type { Pattern, Severity } from "../../patterns/types.ts";
import { SEVERITY_RANK } from "../../patterns/types.ts";

const severityOrder = Order.mapInput(Order.Number, (s: Severity) => SEVERITY_RANK[s]);

const patternOrder = Order.combine(
  Order.mapInput(severityOrder, (p: Pattern) => p.level),
  Order.mapInput(Order.String, (p: Pattern) => p.name)
);

const formatSummaryLine = (p: Pattern): string => `- ${p.name} [${p.level}]: ${p.description}`;

const formatGuidanceBlock = (p: Pattern): string => {
  const refs = p.suggestedReferences ?? [];
  const refHint =
    refs.length === 0
      ? ""
      : `\n\nFor depth, see ${refs.map((r) => `\`${r}\``).join(", ")}.`;
  return `## ${p.name}\n\n${p.guidance}${refHint}`;
};

const ranked = (patterns: ReadonlyArray<Pattern>): ReadonlyArray<Pattern> =>
  pipe(
    patterns,
    Arr.dedupeWith((a, b) => a.name === b.name),
    Arr.sort(patternOrder)
  );

export const formatFeedback = (matched: ReadonlyArray<Pattern>, filePath: string): string => {
  const ordered = ranked(matched);
  const summary = ordered.map(formatSummaryLine).join("\n");
  const guidance = ordered.map(formatGuidanceBlock).join("\n\n---\n\n");
  return [
    "effective review request:",
    `File: \`${filePath}\``,
    "",
    "I noticed potential Effect-pattern issues in the write you just completed.",
    "Please inspect this change now.",
    "If a warning is valid, revise the code before continuing.",
    "If you believe it is a false positive or an intentional exception, briefly say so and continue.",
    "",
    "Matched patterns:",
    summary,
    "",
    "Relevant guidance:",
    guidance
  ].join("\n");
};

/**
 * Returns the most severe level present in the matched patterns, or
 * `Option.none` when the input is empty.
 */
export const severityFloor = (patterns: ReadonlyArray<Pattern>): Option.Option<Severity> =>
  Arr.match(
    patterns.map((p) => p.level),
    {
      onEmpty: () => Option.none<Severity>(),
      onNonEmpty: (levels) => Option.some(Arr.min(levels, severityOrder))
    }
  );
