import type { Pattern } from "./types.ts";

import { pattern as avoidAny } from "../../patterns/avoid-any.ts";
import { pattern as avoidDataTaggedError } from "../../patterns/avoid-data-tagged-error.ts";
import { pattern as avoidDirectJson } from "../../patterns/avoid-direct-json.ts";
import { pattern as avoidDirectTagChecks } from "../../patterns/avoid-direct-tag-checks.ts";
import { pattern as avoidExpectInIf } from "../../patterns/avoid-expect-in-if.ts";
import { pattern as avoidFsPromises } from "../../patterns/avoid-fs-promises.ts";
import { pattern as avoidMutableState } from "../../patterns/avoid-mutable-state.ts";
import { pattern as avoidNativeFetch } from "../../patterns/avoid-native-fetch.ts";
import { pattern as avoidNodeImports } from "../../patterns/avoid-node-imports.ts";
import { pattern as avoidNonNullAssertion } from "../../patterns/avoid-non-null-assertion.ts";
import { pattern as avoidObjectType } from "../../patterns/avoid-object-type.ts";
import { pattern as avoidOptionGetorthrow } from "../../patterns/avoid-option-getorthrow.ts";
import { pattern as avoidPlatformCoupling } from "../../patterns/avoid-platform-coupling.ts";
import { pattern as avoidProcessEnv } from "../../patterns/avoid-process-env.ts";
import { pattern as avoidReactHooks } from "../../patterns/avoid-react-hooks.ts";
import { pattern as avoidSchemaSuffix } from "../../patterns/avoid-schema-suffix.ts";
import { pattern as avoidSyncFs } from "../../patterns/avoid-sync-fs.ts";
import { pattern as avoidTryCatch } from "../../patterns/avoid-try-catch.ts";
import { pattern as avoidTsIgnore } from "../../patterns/avoid-ts-ignore.ts";
import { pattern as avoidUntaggedErrors } from "../../patterns/avoid-untagged-errors.ts";
import { pattern as avoidYieldRef } from "../../patterns/avoid-yield-ref.ts";
import { pattern as castingAwareness } from "../../patterns/casting-awareness.ts";
import { pattern as contextTagExtends } from "../../patterns/context-tag-extends.ts";
import { pattern as effectCatchallDefault } from "../../patterns/effect-catchall-default.ts";
import { pattern as effectPromiseVsTrypromise } from "../../patterns/effect-promise-vs-trypromise.ts";
import { pattern as effectRunInBody } from "../../patterns/effect-run-in-body.ts";
import { pattern as imperativeLoops } from "../../patterns/imperative-loops.ts";
import { pattern as preferArrSort } from "../../patterns/prefer-arr-sort.ts";
import { pattern as preferDurationValues } from "../../patterns/prefer-duration-values.ts";
import { pattern as preferEffectFn } from "../../patterns/prefer-effect-fn.ts";
import { pattern as preferMatchOverSwitch } from "../../patterns/prefer-match-over-switch.ts";
import { pattern as preferOptionOverNull } from "../../patterns/prefer-option-over-null.ts";
import { pattern as preferRedactedConfig } from "../../patterns/prefer-redacted-config.ts";
import { pattern as preferSchemaClass } from "../../patterns/prefer-schema-class.ts";
import { pattern as requireEffectConcurrency } from "../../patterns/require-effect-concurrency.ts";
import { pattern as streamLargeFiles } from "../../patterns/stream-large-files.ts";
import { pattern as throwInEffectGen } from "../../patterns/throw-in-effect-gen.ts";
import { pattern as useClockService } from "../../patterns/use-clock-service.ts";
import { pattern as useConsoleService } from "../../patterns/use-console-service.ts";
import { pattern as useContextService } from "../../patterns/use-context-service.ts";
import { pattern as useFilesystemService } from "../../patterns/use-filesystem-service.ts";
import { pattern as usePathService } from "../../patterns/use-path-service.ts";
import { pattern as useRandomService } from "../../patterns/use-random-service.ts";
import { pattern as useTempFileScoped } from "../../patterns/use-temp-file-scoped.ts";
import { pattern as vmInWrongFile } from "../../patterns/vm-in-wrong-file.ts";
import { pattern as yieldInForLoop } from "../../patterns/yield-in-for-loop.ts";

export const patterns: ReadonlyArray<Pattern> = [
  avoidAny,
  avoidDataTaggedError,
  avoidDirectJson,
  avoidDirectTagChecks,
  avoidExpectInIf,
  avoidFsPromises,
  avoidMutableState,
  avoidNativeFetch,
  avoidNodeImports,
  avoidNonNullAssertion,
  avoidObjectType,
  avoidOptionGetorthrow,
  avoidPlatformCoupling,
  avoidProcessEnv,
  avoidReactHooks,
  avoidSchemaSuffix,
  avoidSyncFs,
  avoidTryCatch,
  avoidTsIgnore,
  avoidUntaggedErrors,
  avoidYieldRef,
  castingAwareness,
  contextTagExtends,
  effectCatchallDefault,
  effectPromiseVsTrypromise,
  effectRunInBody,
  imperativeLoops,
  preferArrSort,
  preferDurationValues,
  preferEffectFn,
  preferMatchOverSwitch,
  preferOptionOverNull,
  preferRedactedConfig,
  preferSchemaClass,
  requireEffectConcurrency,
  streamLargeFiles,
  throwInEffectGen,
  useClockService,
  useConsoleService,
  useContextService,
  useFilesystemService,
  usePathService,
  useRandomService,
  useTempFileScoped,
  vmInWrongFile,
  yieldInForLoop,
];
