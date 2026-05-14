import type { Pattern } from "../src/patterns/types.ts";

export const pattern = {
  name: "prefer-match-over-switch",
  description: "Use Match from Effect instead of native switch statements",
  event: "after",
  toolRegex: "(Edit|Write|MultiEdit|NotebookEdit)",
  level: "warning",
  glob: "**/*.{ts,tsx}",
  detector: {
    "kind": "ast",
    "patterns": [
      "switch ($X) { $$$ }"
    ]
  },
  suggestedReferences: [
    "references/pattern-matching.md"
  ],
  guidance: `# Use \`Match\` Instead of \`switch\`

\`\`\`haskell
-- Transformation
switch :: a -> { case₁: b, ..., default: b }  -- non-exhaustive, fall-through risk
Match  :: a -> Matcher a b                     -- exhaustive, composable, type-safe

-- Pattern
bad :: Phase -> String
bad phase = switch phase of
  "idle"    -> "waiting"
  "running" -> "active"
  _         -> "unknown"              -- default hides new variants

good :: Phase -> String
good phase = Match.value(phase).pipe(
  Match.when("idle", \\_ -> "waiting"),
  Match.when("running", \\_ -> "active"),
  Match.exhaustive                    -- compiler error if variant added
)
\`\`\`

\`\`\`haskell
-- For tagged unions
matchTagged :: Event -> String
matchTagged = Match.value >>> pipe
  Match.tag("Created", \\e -> "new: " <> e.id)
  Match.tag("Completed", \\e -> "done: " <> e.id)
  Match.exhaustive
\`\`\`

\`switch\` has fall-through semantics and non-exhaustive \`default\` cases that hide new variants at compile time. \`Match\` from Effect is exhaustive, composable, and type-safe — the compiler will error when new variants are added.

References: EF-7 in effect-first-development.md
`,
  sourcePath: import.meta.url
} satisfies Pattern;
