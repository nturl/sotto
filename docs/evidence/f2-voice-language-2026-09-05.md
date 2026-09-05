# F2 — /voice deep link interface-language check (2026-09-05, Lane R3-F)

## Question

R3-F2 (planning/LEDGER.md "R3-F"): does opening `/voice/<bookId>` cold on the
live host switch the interface (chrome) language to the book's content
language? Reproduce on `https://sotto-steel.vercel.app` with the Browser
pane at 375px width, set interface language to English via onboarding, then
navigate cold to `/voice/fr-chat-botte` and read the chrome strings.

## Verdict: NOT a defect

The interface locale stays the user's preference (`en`); only the book
content (the passage text) is in French, as intended. No code change made.

## Repro steps (this session, live host)

1. Browser pane resized to 375x812 (`resize_window` preset `mobile`),
   `localStorage.clear()`, fresh navigation to `https://sotto-steel.vercel.app`.
2. Onboarding fast-path screen showed French (I'm learning) / English
   (Explain in) / A1 — matching a browser-detected `en` interface language.
   Completed onboarding ("Start reading in French"), landing in the reader
   for `fr-cendrillon` with English chrome ("Tap a word to translate it").
3. Full-page navigation (not an in-app link — a fresh `navigate` call, the
   same as opening the URL cold in a new tab) to
   `https://sotto-steel.vercel.app/voice/fr-chat-botte`.
4. Read the rendered chrome via `get_page_text` / `read_page`:

   ```
   idle
   [French passage text — Dans un petit village, un vieux meunier vit...]
   Run the tutor in this browser
   The tutor can run entirely on this device. It needs a one-time download
   of about 1326 MB, kept in this browser.
   Whisper base (speech to text) / 136 MB
   Qwen3 1.7B (tutor) / 1100 MB
   Kokoro 82M (text to speech) / 90 MB
   Downloaded once from the model host, then kept in this browser. No
   account, no server, nothing recorded.
   Download tutor models
   Read alone
   ```

   `read_page` additionally shows a `button "Close"` — every chrome string
   (not the passage) is English. None of it switched to French.

5. Confirmed directly against persisted state rather than inferring from
   rendered text alone: the app persists `sotto.preferences` to IndexedDB
   (`keyval-store` / `keyval`, via `idb-keyval`, not `localStorage` — that
   was empty). Read back after step 3-4:

   ```json
   {
     "interfaceLocale": "en",
     "explanationLocale": "en",
     "learningLocale": "fr-FR",
     "level": "A1",
     "onboarded": true,
     ...
   }
   ```

   `interfaceLocale` is still `"en"` after the cold `/voice/fr-chat-botte`
   visit. `learningLocale` is `"fr-FR"`, correctly reflecting the book's
   content language for reading/tutoring purposes — a separate preference
   from the interface language, and this is the one that's supposed to
   track the book.

## Code trace (why this is correct, not luck)

- `apps/client/src/i18n/useT.ts`: the UI catalog (`currentCatalog`) is
  driven by exactly one source — `preferences.interfaceLocale` via a store
  subscription (`useSottoStore.subscribe` on
  `state.preferences.interfaceLocale`) plus a one-time sync at module load.
  Nothing else calls `setUiCatalog`.
- `apps/client/app/voice/[bookId].tsx` and
  `apps/client/src/voice/useVoiceSession.ts`: neither calls `setPreference`
  or `setUiCatalog`. They read `bookLocale(bookId)` only to compute the
  book's own content locale (used for the passage's CJK-typography flag and
  for `useVoiceSession`'s pack/session loading) — this never touches
  `preferences.interfaceLocale`.
- Contrast with `apps/client/app/read/[bookId].tsx`, the `/read/<bookId>`
  deep-link entry point: it _does_ call `setPreference('interfaceLocale',
defaults.interfaceLocale)` and `setUiCatalog(...)`, but only inside `if
(preferences.onboarded || !locale) return;` — i.e. only for a
  never-onboarded visitor being fast-pathed through onboarding via the
  link. Once `preferences.onboarded` is true (as it was for this repro,
  and as it is for any returning user), that effect is a no-op and
  `interfaceLocale` is left alone. `/voice/[bookId].tsx` has no equivalent
  deep-link/fast-path branch at all, so this can't happen there.

So there is no code path — deep link or otherwise — by which visiting
`/voice/<bookId>` changes `preferences.interfaceLocale` for an already-
onboarded user. The one place that _does_ set it (`/read`'s fast-path) is
correctly scoped to first-time visitors only.

## Conclusion

No defect found. `apps/client/e2e/rows.mjs` was not modified (task says to
add a row only if a fix was needed). No files changed in `apps/client/`.
