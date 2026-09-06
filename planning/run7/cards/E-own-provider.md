# Lane E: own-provider mode as a guided flow, and the Settings hub

Task: turn the settings screen for the setting into a guided connect flow whose result is one consistent state everywhere (Settings hub, the tutor), move the Settings hub from `/profile` to `/settings`, and fix the stale "use own provider" control.

Inputs: `planning/run7/PLAN.md` (CONFIRM 26); `~/Claude/sotto-run7-recon/scout-T-tutor.md` §1 ("Path selection", "Storage", "Root cause: the control read off"), §5 (invalid setting shows as "Connection lost"); `apps/client/src/voice/byokKey.ts`, `availability.ts`, `app/settings/openai-key.tsx`, `app/settings/models.tsx`, `src/voice/TutorModelsPanel.tsx`, `app/profile.tsx`; `docs/byok.md`; `planning/KICKOFF-7-FABLE.md` §"Make using an OpenAI key a guided flow". Noel's words: "it seems like it saved it okay, but then this should be turned to on right now, it's off."

Owned files: `apps/client/app/profile.tsx` (git mv to `app/settings/index.tsx`, leave a `/profile` redirect file), `app/settings/openai-key.tsx`, `app/settings/models.tsx`, `src/voice/TutorModelsPanel.tsx`, `src/voice/byokKey.ts` (only to expose a connected/selected flag through the store, no change to how the value is stored or validated), `src/state/createStore.ts` (one field + setter for the own-provider status), new `src/voice/ownProviderStatus.ts`, `docs/byok.md`, tests beside them. Do NOT change validation, storage backend, or network code for the setting: that is reviewed by a cordoned process; if you believe it needs changing, write why in your report.

Directives:
1. Failing test first for the stale control: saving the setting then reading the hub shows connected.
2. Single source of truth: `ownProviderStatus` in the store: `disconnected | connecting | connected | active | invalid | unavailable`. Written by the flow, read by the hub row, `TutorModelsPanel`, and exported for the voice screen (F2 reads it; publish the hook name in your report early: `useOwnProviderStatus()`).
3. The flow (`app/settings/openai-key.tsx`), reachable from the hub and from `/voice/<bookId>` (F2 links to it): (1) what connecting your own key enables; (2) who bills: the provider bills you, about a cent a minute per docs, works with or without the plan; (3) link to the provider's setup page; (4) masked input, paste-friendly, never echoed; (5) validate with the existing check (`GET /v1/models` via the existing function) and show connecting → connected or invalid with a specific message; (6) "Connect and use this key" as the single action that stores AND selects own-provider mode; (7) "Test the tutor" that opens the voice screen for the current or first book; (8) Replace / Disconnect / Switch to browser models or the plan. State copy must never say "saved" as if speech works.
4. Browser-model install status stays a separate line ("Browser models: installed / not installed"), not a proxy for readiness of the selected mode.
5. The hub (`/settings`): groups Languages, Reading, Tutor (mode selector reading the status, the guided flow entry, browser models), Account (link to `/account` when cloud is enabled), About. Keep every existing setting.
6. Never put the value in URLs, logs, analytics, screenshots, error text; grep your diff for it before committing.

Proof: unit tests for the status transitions; Playwright walk with a fake validation response (route interception on the provider host, no real setting) showing: connect → hub row on → tutor panel shows own-provider selected; invalid → specific message; disconnect → off everywhere. Screenshots 375/1440 in `~/Claude/sotto-run7-recon/E/`.

Stop when: committed, pushed, `planning/run7/E-report.md` written with the hook name and the status enum. Escalate when: validation or storage code must change.
