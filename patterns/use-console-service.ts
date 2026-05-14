import type { Pattern } from "../src/patterns/types.ts";

export const pattern = {
  name: "use-console-service",
  description: "Use Effect Console or Effect.log instead of console",
  event: "after",
  toolRegex: "(Edit|Write|MultiEdit|NotebookEdit)",
  level: "warning",
  glob: "**/*.{ts,tsx}",
  detector: {
    "kind": "ast",
    "patterns": [
      "console.$M($$$)"
    ]
  },
  suggestedReferences: [
    "references/observability.md"
  ],
  guidance: `# Use Effect Console Instead of console.\\*

\`\`\`haskell
-- Transformation
console.log   :: String → IO ()      -- side effect, not composable
console.error :: String → IO ()      -- same problem

-- Instead
Console.log   :: String → Effect () Console
Effect.log    :: String → Effect () ∅        -- with structured logging
Effect.logError :: String → Effect () ∅
\`\`\`

\`\`\`haskell
-- Pattern
bad :: Effect ()
bad = do
  Effect.sync \\_ → console.error "Error:" error   -- ceremony with no benefit

good :: Effect ()
good = Console.error ("Error:" <> show error)     -- proper Effect console

better :: Effect ()
better = Effect.logError error                    -- structured, with context

-- Why Effect logging
structured :: Effect () ∅
structured = do
  Effect.logInfo "Processing" \`withLogSpan\` "request"
  -- adds: timestamp, span, log level, structured context

-- Testable
test :: Effect () TestConsole
test = do
  program
  logs ← TestConsole.output
  assert (logs \`contains\` "expected message")
\`\`\`

\`console.*\` in Effect code breaks the paradigm. Use \`Console\` service or \`Effect.log*\` for structured, testable logging.
`,
  sourcePath: import.meta.url
} satisfies Pattern;
