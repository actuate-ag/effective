---
name: react
description: Build React UIs with Effect using the View-Model (VM) pattern, Effect Atom for reactive state, and `Atom.runtime` to bridge services into React. Covers the VM file structure, atom derivation, async actions with `AsyncResult`, and the "zero UI logic" component discipline.
when_to_use: Invoke when building a React component (especially a parent), defining a VM that bridges domain services to UI-ready state, wiring atoms for reactive subscriptions, or replacing `useState` / `useEffect` / `useReducer` with the atom-based pattern.
---

# React

React in this codebase is the View-Model (VM) pattern on top of Effect
Atom. The discipline: **VMs transform domain values into UI-ready
values; components are pure renderers.** No formatting, no derived
values, no conditional business logic in `.tsx` files. Everything that
isn't subscribing-and-rendering lives in a `.vm.ts` next to the
component.

## Canonical shape

```
components/
  UserProfile/
    UserProfile.tsx     # Component — pure renderer
    UserProfile.vm.ts   # VM — interface, tag, default layer
    index.ts            # Re-exports
```

```ts
// UserProfile.vm.ts
import { Context, Effect, Layer } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { AtomRegistry } from "effect/unstable/reactivity/AtomRegistry";

import { UserRepository } from "@/services/UserRepository";

export class UserProfileVM extends Context.Service<UserProfileVM>()(
  "@app/UserProfileVM",
  {
    // Atoms exposed to the component
    userId: Atom.Writable<string>,
    user: Atom.Atom<Atom.AsyncResult<User, UserNotFound>>,
    displayName: Atom.Atom<string>
  }
) {}

export const layer = Layer.effect(
  UserProfileVM,
  Effect.gen(function* () {
    const registry = yield* AtomRegistry;
    const repo = yield* UserRepository.Service;

    const userId = Atom.make("");

    // Async atom — recomputes when userId changes; carries .waiting / error / value
    const user = Atom.fn(
      Effect.fnUntraced(function* (get) {
        const id = get(userId);
        if (id === "") return yield* Effect.die("no user selected");
        return yield* repo.findById(id);
      })
    );

    // UI-ready derived state — formatting belongs here, not in the component
    const displayName = Atom.map(user, (result) =>
      Atom.AsyncResult.match(result, {
        onSuccess: (u) => `${u.name} <${u.email}>`,
        onWaiting: () => "Loading…",
        onFailure: (e) =>
          e._tag === "UserNotFound" ? `User ${e.userId} not found` : "Unknown error"
      })
    );

    return UserProfileVM.of({ userId, user, displayName });
  })
);

export const defaultLayer = layer.pipe(Layer.provide(UserRepository.defaultLayer));
```

```tsx
// UserProfile.tsx
import { useAtomValue, useAtomSet } from "@effect/atom-react";
import { UserProfileVM } from "./UserProfile.vm";

export function UserProfile() {
  const vm = useAtomValue(UserProfileVM); // resolved from the registry
  const setUserId = useAtomSet(vm.userId);
  const displayName = useAtomValue(vm.displayName);

  return (
    <div>
      <input onChange={(e) => setUserId(e.target.value)} />
      <h2>{displayName}</h2>
    </div>
  );
}
```

The VM holds an interface (atoms), a tag, and a layer that constructs
them. The component subscribes via `useAtomValue` and triggers writes
via `useAtomSet`. The component contains no domain transformations,
no async coordination, no error-shape checks beyond rendering
already-formatted strings.

## The zero-UI-logic rule

What goes where:

| In `.vm.ts` (VM) | In `.tsx` (component) |
|---|---|
| Formatting (`name → displayName`, `Date → formattedDate`, `bigint → display`) | `useAtomValue` / `useAtomSet` |
| Derived booleans (`canEdit`, `isEmpty`) | Pattern-matching on tagged state to choose UI |
| Async coordination (load, retry, cancel) | Rendering UI-ready strings as-is |
| Error-message production | — |
| Effect service consumption | — |

The pattern catalog flags VMs that live outside `.vm.ts` files via
`vm-in-wrong-file` (critical) and use of `useState` / `useEffect` /
`useReducer` via `avoid-react-hooks` (high).

Components *may* pattern-match on a state tag to choose which UI to
render, but the *content* of every rendered string comes from the VM.

## Atoms: the unit of reactive state

| Constructor | Purpose |
|---|---|
| `Atom.make(initial)` | Mutable atom — read with `get`, write with `useAtomSet` |
| `Atom.make((get) => ...)` | Computed atom — re-runs when read atoms change |
| `Atom.map(source, fn)` | Derived view of another atom |
| `Atom.family((key) => ...)` | Stable atom per key — `userAtoms("u1")` returns the same atom every call |
| `Atom.fn(effectFn)` | Async atom — subscribers see `AsyncResult<A, E>` with `.waiting` flag |

`Atom.fn` is the bridge between Effect-land and React-land. The
canonical example uses it for `user`: the atom's value is an
`AsyncResult` carrying the pending / success / failure state without
the component needing to manage loading flags.

## `Atom.runtime` for service consumption

When a VM consumes services with non-trivial layer composition, build
the runtime once and let atoms call into it:

```ts
const runtime = Atom.runtime(UserRepository.defaultLayer);

const user = runtime.fn(
  Effect.fnUntraced(function* (id: string) {
    const repo = yield* UserRepository.Service;
    return yield* repo.findById(id);
  })
);
```

Versus the canonical example's plainer `Atom.fn`: `Atom.runtime` is the
right choice when multiple atoms in the VM share the same service
graph, or when service dependencies require scoped lifecycle.

See `references/atom-state.md` § "Pattern: Runtime with Services".

## `AsyncResult` and rendering states

`AsyncResult<A, E>` is the atom value produced by `Atom.fn`. Pattern
match on it in the VM to produce UI-ready strings:

```ts
const status = Atom.map(user, (result) =>
  Atom.AsyncResult.match(result, {
    onWaiting: () => ({ kind: "loading" as const }),
    onSuccess: (u) => ({ kind: "ready" as const, name: u.name }),
    onFailure: (e) => ({ kind: "error" as const, message: e.message })
  })
);
```

The component pattern-matches on `status.kind` to choose UI; every
string it renders comes pre-formatted from the VM. See
`references/atom-state.md` § "Pattern: AsyncResult Types".

## When *not* to make a VM

A VM exists only if a component for that exact VM exists. If you find
yourself defining shared business logic that two components want, it
belongs in a **service layer** (`services/`), not in a VM. VMs compose
over services; they don't replace them.

| Shape | Lives in |
|---|---|
| Layer serves a React component | `components/X/X.vm.ts` (paired with `X.tsx`) |
| Non-UI logic, shared across components | `services/` |

The pattern catalog enforces VM-in-`.vm.ts` via `vm-in-wrong-file`.

## v3 → v4 / pattern holdovers

| Holdover | Use instead |
|---|---|
| `useState` / `useReducer` for any non-trivial state | An atom in the component's VM |
| `useEffect` for data loading / coordination | `Atom.fn` (or `Atom.runtime.fn`) in the VM |
| Boolean component props (`disabled`, `primary`, `loading`) controlling render branches | Composition — let the parent pick which child to render |
| Formatting (`toLocaleString`, template strings) inside `.tsx` | Derived `Atom.map` in the VM |

## Common mistakes

- `useState` / `useEffect` / `useReducer` in a component → atom in the VM. (`avoid-react-hooks`.)
- VM definition outside `*.vm.ts` → move it. (`vm-in-wrong-file`, critical.)
- Date formatting, currency formatting, conditional message construction inside JSX → derive in the VM.
- Sharing logic by lifting it into a "shared VM" → that's a service. Put it in `services/` and have multiple VMs consume it.
- `Atom.make` instead of `Atom.family` for per-entity state (e.g., one atom per `userId`) → use `Atom.family` for stable references.
- Forgetting `Atom.keepAlive` on atoms in a family that should outlive component unmounts.

## Deeper references

| For | Read |
|---|---|
| Full `Atom` surface (`Atom.map`, `Atom.family`, `Atom.fn`, `Atom.runtime`, `Atom.batch`, `Atom.transform`, pull atoms / pagination, persistence, performance) | `references/atom-state.md` |
| Full VM pattern (file structure, layer composition, sharing logic via services, scoped resources, finalizers) | `references/react-vm.md` |
| Compositional component design — avoiding boolean props, slot composition, atom-driven UI | `references/react-composition.md` |
| Schema definitions for entities the VM displays | invoke `/effective:schema` |
| Service definitions that VMs consume | invoke `/effective:services` |
| Error model the VM pattern-matches on | invoke `/effective:errors` |
| Cross-cutting laws on UI / observability boundaries | `references/first-laws.md` |
