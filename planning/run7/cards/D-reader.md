# Lane D: the reader, refined without breaking what works

Task: keep narration, synced highlighting, translation, word details, vocabulary save and progress exactly working; fix popup clipping, add save feedback, add "Talk about this passage", add a quiet Settings entry to the reader header, make narration / word audio / tutor speech never overlap, and settle whether the word-pronunciation complaint is visual clipping or audio truncation.

Inputs: `planning/run7/PLAN.md`; `~/Claude/sotto-run7-recon/scout-1-navigation.md` §5 (popup), §6; `~/Claude/sotto-run7-recon/scout-T-tutor.md` §7 (audio arbitration); `planning/run6/C1-measurements.md`, `C3-writeup.md`, `~/Claude/sotto-run6-recon/onsets.py` and `listen.html` (the measurement kit); `planning/KICKOFF-7-FABLE.md` §"Refine the reader"; Noel's words: on a French book, tapping a word, "the actual word is still a little bit clipped... I want you to just say the specific word".

Owned files: `apps/client/app/reader/**`, `apps/client/src/ui/reader/**`, `apps/client/src/ui/Sheet.tsx`, any `src/ui/audio*` or new `src/platform/audioBus.ts` for arbitration, tests beside them. Do not edit `app/voice/**` (lane F2) or `packages/voice` (F1); if arbitration needs a hook there, define the interface in your file and write the need in your report.

Directives:
1. Failing tests first where the logic is pure (sheet sizing decision, arbitration, resolveWordPlayback already has a test at `src/ui/reader/resolveWordPlayback.test.ts`).
2. Popup: the selected word, its translation, and all controls fully visible at 375 with a long gloss; the sheet scrolls internally; desktop side panel unchanged unless clipped.
3. Save feedback: a short toast or inline state change with i18n text, visible at both widths, announced to screen readers.
4. "Talk about this passage" as a discoverable control in the reader (header or sheet) that routes to `/voice/<bookId>` with the current chapter and position (check what `app/voice/[bookId].tsx` reads from params today and match it; F2 owns that screen).
5. Audio arbitration: one owner at a time among narration, word audio, and (interface for) tutor speech; starting one pauses the others; test it.
6. Word pronunciation: measure with the run-6 kit three words from `fr-fables-la-fontaine` and `fr-petit-chaperon-rouge` that a learner would tap (pick words with soft onsets: "trouve", "avec", "chèvre"). Report onset/offset ms from the sprite slice vs the narration slice, and whether the UI plays the sprite. If audio is truncated, fix the playback slice or offsets in the client (not the packs); if the sprite is fine and the ear disagrees, say so with numbers.
7. Settings entry in the reader header: quiet icon → `/settings` (lane E delivers the route; `/profile` redirect exists meanwhile).
8. Typography and measure: line length 60-75 characters at desktop, comfortable spacing, sizes per `planning/design/DESIGN.md`; keep the quiet reading chrome.

Proof: tests green; screenshots at 375 and 1440 in `~/Claude/sotto-run7-recon/D/` for popup with a long gloss, save feedback, the talk control; an arbitration test; the onset/offset table; narration still plays with highlighting in a Playwright run.

Stop when: committed, pushed, `planning/run7/D-report.md` written. Escalate when: a fix needs `packages/content/packs` or `packages/voice`.
