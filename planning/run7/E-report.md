# Lane E report: own-provider mode as a guided flow, and the Settings hub

Status: IN PROGRESS (this is an early draft, published as soon as the interface was
decided, per instructions — updated as work lands).

## Interface, published early

- Hook: `useOwnProviderStatus()` in `apps/client/src/voice/ownProviderStatus.ts`.
  Also exports `setOwnProviderStatus(status)` (write) and `getOwnProviderStatus()`
  (read outside a component, e.g. a one-time hydration check).
- Status enum (`OwnProviderStatus`, same file):
  `'disconnected' | 'connecting' | 'connected' | 'active' | 'invalid' | 'unavailable'`
  — matches the six "truthful states" named in `planning/KICKOFF-7-FABLE.md` and the
  run-7 E card.
- Single source of truth lives in the store: `apps/client/src/state/createStore.ts`
  gained one field (`ownProviderStatus`, default `'disconnected'`) and one setter
  (`setOwnProviderStatus`). VERIFIED: unit-tested in
  `apps/client/src/state/createStore.test.ts` ("createSottoStore ownProviderStatus").
- Only the guided flow (`app/settings/openai-key.tsx`) writes the field. Readers:
  the settings hub row, `TutorModelsPanel`, and (via the exported hook) the voice
  screen (F2's file, not edited by this lane).
- `byokKey.ts` was left untouched — no change to storage or validation, per the
  card's cordon. The flow module reads `getByokKey`/`setByokKey`/`removeByokKey`/
  `maskKey` exactly as before and layers `setOwnProviderStatus` calls around them.

This section will not change again; the rest of the report fills in below as the
remaining directives (guided-flow screen content, hub restructure, `/profile` →
`/settings` move, Playwright proof) land.

---

## What changed (in progress)

- `apps/client/src/state/createStore.ts` — `ownProviderStatus` field + setter.
- `apps/client/src/voice/ownProviderStatus.ts` — new file, the hook/setter above.
- `apps/client/src/state/createStore.test.ts` — failing-test-first coverage for
  the status transitions (directive 1).

(remaining files land next: `app/settings/openai-key.tsx` guided flow,
`src/voice/TutorModelsPanel.tsx` own-provider note, `app/profile.tsx` → git mv to
`app/settings/index.tsx` + `/profile` redirect + hub regroup, `docs/byok.md`, i18n.)

## Tests run so far

- `cd apps/client && npx vitest run src/state/createStore.test.ts` — 14/14 passed
  (2 new, both failed before the field/setter existed, confirmed failing-first).

## Not yet verified

Everything below the "Interface, published early" section is unfinished as of this
draft. Full proof (Playwright walk, screenshots, full test suite, typecheck, lint,
prettier) will be added before this lane stops.
