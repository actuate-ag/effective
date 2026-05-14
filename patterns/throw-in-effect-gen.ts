import type { Pattern } from "../src/patterns/types.ts";

export const pattern = {
  name: "throw-in-effect-gen",
  description: "Do not throw inside Effect.gen - use yield* Effect.fail() instead",
  event: "after",
  toolRegex: "(Edit|Write|MultiEdit|NotebookEdit)",
  level: "critical",
  glob: "**/*.{ts,tsx}",
  detector: {
    "kind": "ast",
    "patterns": [],
    "rules": [
      {
        "pattern": "throw $ERR",
        "inside": {
          "any": [
            {
              "pattern": "Effect.gen($$$ARGS)"
            },
            {
              "pattern": "Effect.fn($$$ARGS)"
            },
            {
              "pattern": "Effect.fn($$$ARGS)($$$BODY)"
            },
            {
              "pattern": "Effect.fnUntraced($$$ARGS)"
            }
          ],
          "stopBy": "end"
        }
      }
    ]
  },
  suggestedReferences: [
    "references/error-handling.md"
  ],
  guidance: `# Do Not \`throw\` Inside \`Effect.gen\`

\`\`\`haskell
-- Transformation
throw :: Error -> ⊥                        -- untyped, uncatchable by Effect
yield* Effect.fail :: TaggedError -> E ⊥ E  -- typed, catchable via catchTag
\`\`\`

\`\`\`haskell
-- Pattern
bad :: Effect.gen
bad = Effect.gen \\_ -> do
  throw new Error("not found")            -- bypasses Effect error channel

good :: Effect.gen
good = Effect.gen \\_ -> do
  yield* Effect.fail(new UserNotFoundError({ message: "not found" }))
  -- typed error, catchable with catchTag("UserNotFoundError", ...)
\`\`\`

\`throw\` inside \`Effect.gen\` creates a defect (untyped), not a typed error. Use \`yield* Effect.fail(new SchemaTaggedError(...))\` to keep errors in the typed channel.

Exception: \`throw\` inside \`Effect.tryPromise\`'s \`try\` block is acceptable — it's caught by the \`catch\` handler.
`,
  sourcePath: import.meta.url
} satisfies Pattern;
