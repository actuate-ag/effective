import type { Pattern } from "../src/patterns/types.ts";

export const pattern = {
  name: "use-filesystem-service",
  description: "Use FileSystem service instead of direct Node.js fs imports",
  event: "after",
  toolRegex: "(Edit|Write|MultiEdit|NotebookEdit)",
  level: "high",
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
                "regex": "[\"'](?:node:)?fs[\"']"
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
        "regex": "^[\"'](?:node:)?fs[\"']$"
      }
    }
  },
  suggestedReferences: [
    "references/filesystem.md"
  ],
  guidance: `# Use FileSystem Service Instead of \`fs\`

\`\`\`haskell
-- Transformation
import "node:fs"    :: Node → IO a        -- platform-coupled, untestable
import "fs"         :: Node → IO a        -- same problem

-- Instead
FileSystem          :: Effect a FileSystem  -- platform-agnostic
\`\`\`

\`\`\`haskell
-- Pattern
bad :: FilePath → IO String
bad path = fs.readFileSync path "utf-8"   -- R = Node, untestable

good :: FilePath → Effect String FileSystem
good path = do
  fs ← FileSystem.FileSystem
  fs.readFileString path                  -- R ⊃ FileSystem, portable

-- Platform provision at entry point
main :: Effect () (FileSystem | Console | ...)
main = program
  & provide BunContext.layer    -- or NodeContext.layer
  & runMain
\`\`\`

Direct \`fs\` imports couple code to Node.js. Use \`@effect/platform\` FileSystem for portability across Node, Bun, and browser.
`,
  sourcePath: import.meta.url
} satisfies Pattern;
