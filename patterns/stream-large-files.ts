import type { Pattern } from "../src/patterns/types.ts";

export const pattern = {
  name: "stream-large-files",
  description: "Review whole-file reads when the path appears large or unbounded",
  event: "after",
  toolRegex: "(Edit|Write|MultiEdit|NotebookEdit)",
  level: "info",
  glob: "**/*.{ts,tsx}",
  detector: {
    "kind": "ast",
    "patterns": [],
    "rules": [
      {
        "any": [
          {
            "pattern": "fs.readFile($PATH)"
          },
          {
            "pattern": "fs.readFileString($PATH)"
          }
        ]
      }
    ],
    "constraints": {
      "PATH": {
        "any": [
          {
            "regex": "(large|huge|dump|archive|dataset|backup|export|log|logs|jsonl|ndjson|csv)"
          },
          {
            "pattern": "$DIR + $FILE"
          },
          {
            "pattern": "path.join($$$)"
          },
          {
            "pattern": "path.resolve($$$)"
          },
          {
            "pattern": "$FILES[$I]"
          },
          {
            "pattern": "$ITEM.path"
          }
        ]
      }
    }
  },
  suggestedReferences: [
    "references/stream.md"
  ],
  guidance: `# Consider Streaming Large Files

\`\`\`haskell
-- Transformation
readFile       :: FilePath → Effect String FileSystem   -- entire file in memory
stream         :: FilePath → Stream Chunk FileSystem    -- incremental chunks

-- For large files
fs.stream path { chunkSize: 64 * 1024 }
  |> decodeText "utf-8"
  |> splitLines
  |> map processLine
  |> runDrain
\`\`\`

\`\`\`haskell
-- Pattern
bad :: FilePath → Effect String FileSystem
bad path = readFileString path          -- OOM on gigabyte files

good :: FilePath → Effect () FileSystem
good path = pipe
  (fs.stream path { chunkSize: 65536 })
  $ Stream.decodeText "utf-8"
  $ Stream.splitLines
  $ Stream.map processLine
  $ Stream.runDrain                     -- constant memory usage

-- When to stream
shouldStream :: FileSize → Bool
shouldStream size
  | size > megabytes 100 = True         -- definitely stream
  | lineByLine needed    = True         -- stream for efficiency
  | otherwise            = False        -- readFile is fine
\`\`\`

\`readFile\` loads entire file into memory. Use \`fs.stream\` for large files or line-by-line processing to avoid OOM errors.
`,
  sourcePath: import.meta.url
} satisfies Pattern;
