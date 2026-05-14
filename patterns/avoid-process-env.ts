import type { Pattern } from "../src/patterns/types.ts";

export const pattern = {
  name: "avoid-process-env",
  description: "Avoid process.env - use Effect Config.* for environment variable access",
  event: "after",
  toolRegex: "(Edit|Write|MultiEdit|NotebookEdit)",
  level: "warning",
  glob: "**/*.{ts,tsx}",
  ignoreGlob: [
    "**/test-env-provider.ts"
  ],
  detector: {
    "kind": "ast",
    "patterns": [
      "process.env"
    ]
  },
  suggestedReferences: [
    "references/config.md"
  ],
  guidance: `# Avoid \`process.env\`

\`\`\`haskell
-- Transformation
processEnv :: String -> IO (Maybe String)    -- side effect, untyped, untestable

-- Instead
Config.string :: String -> Config String     -- typed, composable, testable
Config.withDefault :: a -> Config a -> Config a
Config.secret :: String -> Config Redacted   -- for sensitive values
\`\`\`

\`\`\`haskell
-- Pattern
bad :: Effect String
bad = Effect.sync \\_ -> process.env.API_KEY    -- raw side effect

good :: Effect String ConfigError
good = Config.string "API_KEY"                 -- typed, validated

better :: Effect String ConfigError
better = Config.string("PORT")
  & Config.withDefault "3000"
  & Config.map Number.parse                    -- with transformation
\`\`\`

\`process.env\` is a raw side effect with no type safety. Use \`Config.*\` for validated, composable, testable configuration.

Exception: \`xdg/core\` and similar platform abstraction layers that ARE the env variable bridge.
`,
  sourcePath: import.meta.url
} satisfies Pattern;
