import type { Pattern } from "../src/patterns/types.ts";

export const pattern = {
  name: "prefer-option-over-null",
  description: "Consider using Option instead of union with null",
  event: "after",
  toolRegex: "(Edit|Write|MultiEdit|NotebookEdit)",
  level: "info",
  glob: "**/*.{ts,tsx}",
  detector: {
    "kind": "ast",
    "patterns": [],
    "rules": [
      {
        "all": [
          {
            "kind": "literal_type"
          },
          {
            "regex": "^null$"
          },
          {
            "inside": {
              "kind": "union_type",
              "stopBy": "neighbor"
            }
          }
        ]
      }
    ]
  },
  guidance: `# Consider \`Option\` Instead of \`| null\`

\`\`\`haskell
-- Transformation
nullable :: T | Null              -- scattered null checks
option   :: Option T              -- composable, chainable

-- Option operations
map      :: (a → b) → Option a → Option b
flatMap  :: (a → Option b) → Option a → Option b
filter   :: (a → Bool) → Option a → Option a
getOrElse :: a → Option a → a
\`\`\`

\`\`\`haskell
-- Pattern
bad :: Id → User | Null
bad id = users.get id             -- caller must check null

good :: Id → Option User
good id = Option.fromNullable (users.get id)

-- Composition
findEmail :: Id → Option Email
findEmail = good >=> (_.email >>> Option.fromNullable)
\`\`\`

\`Option<T>\` provides chainable operations. Use \`| null\` only at external boundaries (JSON, DOM, third-party libs).
`,
  sourcePath: import.meta.url
} satisfies Pattern;
