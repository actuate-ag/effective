import type { Pattern } from "../src/patterns/types.ts";

export const pattern = {
  name: "avoid-sync-fs",
  description: "Avoid synchronous filesystem operations",
  event: "after",
  toolRegex: "(Edit|Write|MultiEdit|NotebookEdit)",
  level: "high",
  glob: "**/*.{ts,tsx}",
  detector: {
    "kind": "ast",
    "patterns": [
      "readFileSync($$$)",
      "$A.readFileSync($$$)",
      "writeFileSync($$$)",
      "$A.writeFileSync($$$)",
      "mkdirSync($$$)",
      "$A.mkdirSync($$$)",
      "readdirSync($$$)",
      "$A.readdirSync($$$)",
      "statSync($$$)",
      "$A.statSync($$$)",
      "existsSync($$$)",
      "$A.existsSync($$$)",
      "copyFileSync($$$)",
      "$A.copyFileSync($$$)",
      "unlinkSync($$$)",
      "$A.unlinkSync($$$)",
      "rmdirSync($$$)",
      "$A.rmdirSync($$$)",
      "renameSync($$$)",
      "$A.renameSync($$$)",
      "appendFileSync($$$)",
      "$A.appendFileSync($$$)"
    ]
  },
  suggestedReferences: [
    "references/filesystem.md"
  ],
  guidance: `# Avoid Synchronous Filesystem Operations

\`\`\`haskell
-- Transformation
readFileSync  :: FilePath → IO String     -- blocks event loop
writeFileSync :: FilePath → String → IO () -- same problem

-- Instead
readFileString  :: FilePath → Effect String FileSystem
writeFileString :: FilePath → String → Effect () FileSystem
\`\`\`

\`\`\`haskell
-- Pattern
bad :: FilePath → IO String
bad path = fs.readFileSync path "utf-8"   -- blocking, defeats async

good :: FilePath → Effect String FileSystem
good path = do
  fs ← FileSystem.FileSystem
  fs.readFileString path                  -- non-blocking, composable

-- Sync → Async mapping
readFileSync   → readFileString
writeFileSync  → writeFileString
mkdirSync      → makeDirectory
existsSync     → exists
unlinkSync     → remove
readdirSync    → readDirectory
\`\`\`

Sync operations block the event loop. Use Effect's FileSystem service for async, composable file operations.
`,
  sourcePath: import.meta.url
} satisfies Pattern;
