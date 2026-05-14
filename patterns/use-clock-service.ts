import type { Pattern } from "../src/patterns/types.ts";

export const pattern = {
  name: "use-clock-service",
  description: "Use Effect DateTime instead of JS Date",
  event: "after",
  toolRegex: "(Edit|Write|MultiEdit|NotebookEdit)",
  level: "warning",
  glob: "**/*.{ts,tsx}",
  detector: {
    "kind": "ast",
    "patterns": [
      "new Date($$$)",
      "Date.$M($$$)"
    ]
  },
  suggestedReferences: [
    "references/testing.md"
  ],
  guidance: `# Use Effect DateTime Instead of JS Date

\`\`\`haskell
-- Transformation
newDate   :: IO Date              -- impure, non-deterministic
dateNow   :: IO Milliseconds      -- side effect, untestable

-- Instead
now       :: Effect DateTime R    -- R includes Clock
currentMs :: Effect Millis Clock  -- explicit dependency
\`\`\`

\`\`\`haskell
-- Pattern
bad :: IO Timestamp
bad = Date.now                    -- where R = ∅, untestable

good :: Effect Timestamp Clock
good = Clock.currentTimeMillis    -- where R ⊃ Clock, testable

-- In tests
test :: Effect () TestClock
test = do
  TestClock.adjust (minutes 5)    -- deterministic time
  result ← good
  assert (result == expected)
\`\`\`

Direct \`Date\` usage is non-deterministic. Use \`DateTime.now\` or \`Clock.currentTimeMillis\` for testable time operations via \`TestClock\`.
`,
  sourcePath: import.meta.url
} satisfies Pattern;
