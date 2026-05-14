import type { Pattern } from "../src/patterns/types.ts";

export const pattern = {
  name: "avoid-fs-promises",
  description: "Wrap fs/promises with Effect instead of using directly",
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
                "kind": "import_statement"
              },
              {
                "regex": "[\"'](?:node:)?fs/promises[\"']"
              }
            ]
          },
          {
            "pattern": "require($SPEC)"
          },
          {
            "pattern": "import($SPEC)"
          }
        ]
      }
    ],
    "constraints": {
      "SPEC": {
        "regex": "^[\"'](?:node:)?fs/promises[\"']$"
      }
    }
  },
  suggestedReferences: [
    "references/filesystem.md"
  ],
  guidance: `# Use FileSystem Service Instead of \`fs/promises\`

\`\`\`haskell
-- Transformation
import "fs/promises"     :: Node → Promise a    -- platform-coupled, Promise-based
import "node:fs/promises" :: Node → Promise a   -- same problem

-- Instead
FileSystem              :: Effect a FileSystem  -- Effect-native, platform-agnostic
\`\`\`

\`\`\`haskell
-- Pattern
bad :: FilePath → Promise String
bad path = fsPromises.readFile path "utf-8"   -- Promise, not Effect

good :: FilePath → Effect String FileSystem
good path = do
  fs ← FileSystem.FileSystem
  fs.readFileString path                      -- Effect-native

-- If wrapping is necessary
wrap :: Promise a → Effect a Error
wrap promise = Effect.tryPromise \\_ → promise
\`\`\`

\`fs/promises\` returns Promises, not Effects. Use \`@effect/platform\` FileSystem for Effect-native file operations with typed errors.
`,
  sourcePath: import.meta.url
} satisfies Pattern;
