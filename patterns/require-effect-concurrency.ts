import type { Pattern } from "../src/patterns/types.ts";

export const pattern = {
  name: "require-effect-concurrency",
  description: "Specify concurrency explicitly for Effect collection combinators",
  event: "after",
  toolRegex: "(Edit|Write|MultiEdit|NotebookEdit)",
  level: "warning",
  glob: "**/*.{ts,tsx}",
  detector: {
    "kind": "ast",
    "patterns": [],
    "rules": [
      {
        "any": [
          {
            "all": [
              {
                "pattern": {
                  "context": "Effect.forEach($EACH)",
                  "strictness": "signature"
                }
              },
              {
                "regex": "^Effect\\.forEach"
              }
            ]
          },
          {
            "all": [
              {
                "pattern": {
                  "context": "Effect.forEach($A, $OPTIONS)",
                  "strictness": "signature"
                }
              },
              {
                "regex": "^Effect\\.forEach"
              }
            ]
          },
          {
            "all": [
              {
                "pattern": {
                  "context": "Effect.forEach($A, $B, $OPTIONS)",
                  "strictness": "signature"
                }
              },
              {
                "regex": "^Effect\\.forEach"
              }
            ]
          },
          {
            "all": [
              {
                "pattern": {
                  "context": "Effect.all($ALL)",
                  "strictness": "signature"
                }
              },
              {
                "regex": "^Effect\\.all"
              }
            ]
          },
          {
            "all": [
              {
                "pattern": {
                  "context": "Effect.all($A, $OPTIONS)",
                  "strictness": "signature"
                }
              },
              {
                "regex": "^Effect\\.all"
              }
            ]
          },
          {
            "all": [
              {
                "pattern": {
                  "context": "Effect.validate($VALIDATE)",
                  "strictness": "signature"
                }
              },
              {
                "regex": "^Effect\\.validate"
              }
            ]
          },
          {
            "all": [
              {
                "pattern": {
                  "context": "Effect.validate($A, $OPTIONS)",
                  "strictness": "signature"
                }
              },
              {
                "regex": "^Effect\\.validate"
              }
            ]
          },
          {
            "all": [
              {
                "pattern": {
                  "context": "Effect.validate($A, $B, $OPTIONS)",
                  "strictness": "signature"
                }
              },
              {
                "regex": "^Effect\\.validate"
              }
            ]
          }
        ]
      }
    ],
    "constraints": {
      "OPTIONS": {
        "not": {
          "all": [
            {
              "kind": "object"
            },
            {
              "has": {
                "regex": "\\bconcurrency\\b"
              }
            }
          ]
        }
      }
    }
  },
  suggestedReferences: [
    "references/concurrency-testing.md"
  ],
  guidance: `# Specify Effect Collection Concurrency

\`\`\`haskell
-- Transformation
Effect.forEach xs f           -- concurrency intent implicit
Effect.forEach xs f opts      -- concurrency intent explicit
\`\`\`

\`\`\`typescript
// Bad
Effect.forEach(items, processItem);
Effect.all(tasks);
Effect.validate(inputs, validateInput, { discard: true });

// Good
Effect.forEach(items, processItem, { concurrency: 1 });
Effect.all(tasks, { concurrency: 'unbounded' });
Effect.validate(inputs, validateInput, { concurrency: 4, discard: true });
\`\`\`

Even sequential execution is a concurrency decision. Specify \`concurrency\` on \`Effect.forEach\`, \`Effect.all\`, and \`Effect.validate\` so throughput and ordering intent are reviewable at the call site.
`,
  sourcePath: import.meta.url
} satisfies Pattern;
