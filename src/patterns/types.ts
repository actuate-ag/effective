import type { Rule as AstGrepRuleDefinition } from "@ast-grep/napi";

export type Severity = "critical" | "high" | "medium" | "warning" | "info";

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  warning: 3,
  info: 4
};

export interface RegexDetector {
  readonly kind: "regex";
  readonly pattern: string;
  readonly matchInComments: boolean;
}

export interface AstDetector {
  readonly kind: "ast";
  readonly patterns: ReadonlyArray<string>;
  readonly inside?: string;
  readonly rules?: ReadonlyArray<AstGrepRuleDefinition>;
  readonly constraints?: Record<string, AstGrepRuleDefinition>;
}

export type Detector = RegexDetector | AstDetector;

export interface Pattern {
  readonly name: string;
  readonly description: string;
  readonly event: "before" | "after";
  readonly toolRegex: string;
  readonly level: Severity;
  readonly glob?: string;
  readonly ignoreGlob?: ReadonlyArray<string>;
  readonly detector: Detector;
  readonly guidance: string;
  readonly suggestedReferences?: ReadonlyArray<string>;
  readonly sourcePath: string;
}

export interface MatchLocation {
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
  readonly snippet: string;
}
