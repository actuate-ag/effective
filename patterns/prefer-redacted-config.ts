import type { Pattern } from "../src/patterns/types.ts";

export const pattern = {
  name: "prefer-redacted-config",
  description: "Use Config.redacted or Schema.Redacted for secret-like configuration values",
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
            "pattern": "Config.string($KEY)"
          },
          {
            "pattern": "Config.nonEmptyString($KEY)"
          },
          {
            "all": [
              {
                "kind": "pair"
              },
              {
                "has": {
                  "field": "key",
                  "regex": "(?i)(api[_-]?key|auth[_-]?token|token|secret|password|passwd|private[_-]?key|client[_-]?secret|database[_-]?url|db[_-]?url|connection[_-]?string|dsn)"
                }
              },
              {
                "has": {
                  "field": "value",
                  "regex": "^Schema\\.(String|NonEmptyString)(\\.|$)"
                }
              },
              {
                "inside": {
                  "pattern": "Config.schema($$$)",
                  "stopBy": "end"
                }
              }
            ]
          }
        ]
      }
    ],
    "constraints": {
      "KEY": {
        "regex": "(?i)^[\"'][^\"']*(api[_-]?key|auth[_-]?token|token|secret|password|passwd|private[_-]?key|client[_-]?secret|database[_-]?url|db[_-]?url|connection[_-]?string|dsn)[^\"']*[\"']$"
      }
    }
  },
  suggestedReferences: [
    "references/config.md"
  ],
  guidance: `# Prefer Redacted Config for Secrets

\`\`\`haskell
-- Transformation
Config.string secretKey    :: String            -- easy to log accidentally
Config.redacted secretKey  :: Redacted String   -- hidden from logs/toString
\`\`\`

\`\`\`typescript
// Bad
const apiKey = Config.string('API_KEY');
const token = Config.nonEmptyString('GITHUB_TOKEN');

// Good
const apiKey = Config.redacted('API_KEY');
const token = Config.redacted('GITHUB_TOKEN');
\`\`\`

For structured config schemas, wrap secret-like string fields in \`Schema.Redacted\`:

\`\`\`typescript
// Bad
const AppConfig = Config.schema(
	Schema.Struct({
		apiKey: Schema.String,
		password: Schema.NonEmptyString
	})
);

// Good
const AppConfig = Config.schema(
	Schema.Struct({
		apiKey: Schema.Redacted(Schema.String),
		password: Schema.Redacted(Schema.String)
	})
);
\`\`\`

Secrets should remain redacted from the moment they enter the program. Use \`Config.redacted\` for primitive config values and \`Schema.Redacted(Schema.String)\` for schema-based config fields.
`,
  sourcePath: import.meta.url
} satisfies Pattern;
