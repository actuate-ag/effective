import type { Pattern } from "../src/patterns/types.ts";

export const pattern = {
  name: "imperative-loops",
  description: "Use functional transformations instead of imperative loops",
  event: "after",
  toolRegex: "(Edit|Write|MultiEdit|NotebookEdit)",
  level: "warning",
  glob: "**/*.{ts,tsx}",
  detector: {
    "kind": "ast",
    "patterns": [
      "for ($$$)"
    ]
  },
  guidance: `# Use Functional Transformations

\`\`\`haskell
-- Array operations
map     :: [a] → (a → b) → [b]
filter  :: [a] → (a → Bool) → [a]
reduce  :: [a] → b → (b → a → b) → b
filterMap :: [a] → (a → Option b) → [b]   -- single pass

-- Record operations
Record.map        :: {k: a} → (a → b) → {k: b}
Record.filter     :: {k: a} → (a → Bool) → {k: a}
Record.filterMap  :: {k: a} → (a → Option b) → {k: b}
\`\`\`

\`\`\`haskell
-- Bad: Imperative with mutations
bad :: [Number] → [Number]
bad numbers = do
  result ← []
  for n in numbers do
    if n % 2 == 0 then
      result.push(n * n)
  return result

-- Good: Functional composition
good :: [Number] → [Number]
good numbers =
  filterMap numbers λn →
    if n % 2 == 0
    then Option.some(n * n)
    else Option.none()
\`\`\`

Imperative loops with mutations are error-prone. Use \`Array.filterMap\`, \`Array.map\`, \`Array.reduce\` for single-pass transformations.
`,
  sourcePath: import.meta.url
} satisfies Pattern;
