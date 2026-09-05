# Sotto import flow (extends DESIGN.md, finished level)

Skeleton: **step-stack** — a single vertical flow that advances screen-to-screen (entry -> pick -> preview -> progress), each step full-canvas with its own BackLink, no shell tabs, no sidebar grid. This is new relative to DESIGN.md's monument-template (centered column of rails/cards): it is closer to Onboarding's one-question-per-screen shape but wider (a file, not a choice), and it ends in a live-updating progress screen with no phone precedent yet in DESIGN.md. Do not reuse Onboarding's exact centered-560 treatment verbatim — see each screen below for its own measure.

All tokens, radii, and the three signature devices (cutout, marker stroke, speech fill) are inherited unchanged. No new color, radius, or shadow appears anywhere in this file. The cutout appears only on the primary CTA per screen; accent appears only on that CTA fill (never on a progress bar, a stage label, or a failure icon).

Free vs paid tier differences are called out inline; where a screen doesn't say "(paid)" it renders identically on both.

## 1. Entry points

Two entries, no dedicated "Import" screen of its own — importing starts from wherever a user already is with their library.

### 1a. From Library
- Library's existing search icon row (DESIGN.md "Library") gains a third icon: a plus glyph, 40px ink-stroke icon button, same size/spacing as the search icon, placed left of it.
- Tap opens **2. Pick a file** directly (no confirmation screen).
- Phone 375: icon row is `[display title] ... [plus 40px] [search 40px]`, 8px gap between the two icons, right-aligned, same baseline as the title per DESIGN.md's Home icon-row pattern.
- Desktop 1440: same two icons, top-right of the content region inline with the display title's baseline (DESKTOP.md §1's icon-button rule — actions never move into the sidebar).

### 1b. From Profile
- New row in the DONNÉES group (`apps/client/app/profile.tsx`'s existing `Group` component, alongside Exporter/Importer/Réinitialiser): label "Importer un livre", chevron, `ui` 15 role, same `Row` component and hairline divider as its siblings. No value text.
- Tap opens **2. Pick a file**.
- Phone 375 and desktop 1440: identical — Profile's grouped-card layout doesn't change width behavior between breakpoints (it's already a fixed-width card list per DESIGN.md), so this row needs no desktop variant beyond the existing card's own max-width.

## 2. Pick a file

- `Shell` canvas, `BackLink` top-left ("Retour", accent, ui 500, chevron — same component as Book detail).
- Display title, 28 (one step down from the 34 screen-title size, matching Onboarding's per-question title scale): "Importer un livre".
- Three format rows, each a `Card` (surface, radius 10, hairline border, padding `space.lg`), stacked with `space.md` (12) gap between them, full content width on phone (minus 20 gutters), max 480px centered on desktop (this flow doesn't use the grid — it's a single decision list, so it borrows Review's centered-480 measure from DESIGN.md rather than a grid or a two-column split):
  - **EPUB** row: mono label "EPUB" top-left of the card, `ui` 16 body text below it: "Sans verrou numérique (DRM)". Right-aligned chevron. Tappable, opens the OS file picker filtered to `.epub`.
  - **TXT** row: mono "TXT", body "Texte brut". Tappable, filtered to `.txt`.
  - **Markdown** row: mono "MD", body "Fichier Markdown". Tappable, filtered to `.md`.
  - **PDF** row: mono "PDF", body "Pas encore pris en charge" in `ink-3` (not `warn` — this is a roadmap statement, not an error). Card itself renders at 60% opacity, no chevron, not tappable (`accessibilityState={{disabled: true}}`, no `onPress`). This is the row DESIGN.md's Don't-list "no fake affordances" principle covers implicitly: a visibly inert card, not a live button that toasts "coming soon."
- Below the four cards, `caption` `ink-3` note, left-aligned, `space.lg` above it: "Les livres protégés par un verrou numérique ne peuvent pas être importés." (Sets expectation before the picker opens, so the DRM failure in §5 isn't the first time the user hears this.)
- Selecting a file in the OS picker moves straight to **3. Preview** — no intermediate "uploading" spinner on this screen; if parsing needs a moment before the preview can render, show the preview screen's own header immediately with its fields in a skeleton state (surface-2 blocks, no text) rather than blocking here.

## 3. Preview

The screen that must be read fully and understood before anything runs — the honesty screen. `Shell` canvas, `BackLink`.

- Display title, 28: "Aperçu".
- **File identity strip**: `surface-2` `Card` radius 10, padding `space.md`, one row: file-type mono glyph (reuse the format's mono label, e.g. "EPUB") + filename in `ui` 15 `ink`, truncated with ellipsis. No chevron (not tappable).
- **Detected language row**: `Card` surface, hairline, padding `space.lg`. Left: `caption` `ink-2` "Langue détectée", below it the language's native + localized name pair in the same `reading`/`caption` combination `OptionRow` uses for language names. Right: a "Modifier" text action, `ui` 500 `accent` (this is the one correction affordance on the screen — tapping it opens the existing language-picker list, reusing `OptionRow` rows, as a `Sheet`; selecting a row updates this field in place and dismisses the sheet). This is the "way to correct it" the brief requires: no free-text field, a picker, consistent with onboarding's existing language rows.
- **Stats strip**: `surface-2` `Card` radius 10, one row, mono labels, hairline dividers between the three values (same visual language as Book detail's `MetaStrip`): "N CHAPITRES | N MOTS | ~N MIN/CHAPITRE". The third figure's phrasing differs by tier:
  - Free: "~N MIN/CHAPITRE" with a `caption` `ink-3` line directly beneath the strip: "Estimation pour ce Mac." (honest, machine-specific, no false precision).
  - Paid: same figure plus a second `caption` `ink-3` line beneath it: "Coût estimé : ~$N,NN" (a placeholder amount; the actual number comes from the entitlement/cost service, never computed client-side — this file specifies presentation only).
- **Generated-content disclosure panel**: the plainly-worded privacy panel the brief requires. `surface-2` `Card`, radius 10, padding `space.lg`, no hairline (it's a panel, not a row-list, so DESIGN.md's card border rule still applies via the Card component but no internal dividers are needed since it's one paragraph). Content:
  - `caption` `ink-2`, single paragraph, left-aligned, line-height matching `caption`'s 1.4: "Les traductions de mots, les traductions de phrases et la narration de ce livre sont générées pour vous. Elles restent privées : elles ne sont partagées avec personne, jamais réutilisées pour un autre lecteur, et supprimées si vous supprimez votre compte."
  - No icon, no accent border, no warn color — this is reassurance, not a warning, so it takes the same quiet `surface-2` treatment as the metadata strip, not the `warn`-colored failure treatment in §5.
- **Primary CTA**: cutout, "Importer" (or "Importer (~$N,NN)" on paid tier — the cost folded into the button label itself, matching the honesty requirement at the point of commitment, not just above it). Pinned above the home indicator on phone (Onboarding's CTA-anchoring rule); on desktop, left-aligned under the panel at the 480px measure (Book detail's "CTA hugs the content it follows" rule from DESKTOP.md §4, applied here since this screen is also a centered-480 single column, not a two-column split).
- Tapping the primary CTA moves to **4. Progress**.

## 4. Progress

`Shell` canvas, no `BackLink` (an import in flight isn't cancelable mid-flight the way navigation elsewhere is — see the one exception below). Display title, 28: the book's detected title (from the parsed source), falling back to the filename if no title metadata exists.

- **Stage list**: four rows, `Card` surface, hairline dividers between rows (one `Card` containing all four, like `Group`'s `groupCard` in Profile), padding `space.lg` per row:
  1. "Analyse" (parsing)
  2. "Traduction des mots" (glossing)
  3. "Traduction des phrases" (translating)
  4. "Narration du chapitre 1" (narrating chapter 1)
  - Each row: label in `ui` 16 `ink` left, state indicator right. States, left to right in time: **pending** (`caption` `ink-3` "En attente"), **active** (mono `ink` percentage, e.g. "42 %", plus a thin `surface-2`-track / `ink`-fill progress bar beneath the label at 3px height — the same `progress bar in surface-2 with ink fill` device DESIGN.md already uses for BookTile's in-progress bar, reused here rather than invented fresh), **done** (a small ink check glyph, 16px, no color beyond ink — never `ok` green; `ok` is reserved for offline/ready states per DESIGN.md's token table, and this is progress, not a system-ready state).
  - Only one row is ever "active" at a time; completed rows collapse their progress bar (check glyph replaces it).
- **"Read chapter 1" affordance**: once stage 4 (narrating chapter 1) reaches "done", a `Card` surface appears below the stage list, `space.lg` above it: `heading` 20 "Le chapitre 1 est prêt", `caption` `ink-2` "Les chapitres suivants continuent de se préparer en arrière-plan.", and a `secondary` button (not primary — the cutout CTA stays reserved for the terminal action) "Lire le chapitre 1" that pushes straight into the Reader for chapter 1 of the new pack, leaving the import running. This is the literal implementation of "read chapter 1 while the rest narrates."
- Below that, once ALL stages across all chapters finish (not just chapter 1), the stage-list card is replaced by a single `heading` line "Livre importé" and the screen's only remaining control becomes a primary cutout CTA "Ouvrir le livre" navigating to Book detail for the new pack. Until then there is no primary CTA on this screen at all — the "Lire le chapitre 1" secondary button is the only interactive element while background work continues, which is deliberate: nothing here should read as more final than it is.
- One small text action, `caption` `ink-2`, bottom-left of the screen (this is the exception to "no BackLink" above): "Importer en arrière-plan" — lets the user leave the progress screen (it keeps running; Library's new book shows an in-progress indicator, reusing BookTile's existing `surface-2`-track/`accent`-fill progress bar for in-progress books, unchanged from DESIGN.md's Home rail spec).
- Desktop 1440: identical stack, centered at the same 480px measure as §3 (this screen has no reason to widen — it's a status list, matching Review's "don't stretch a focused single-item screen" rule from DESKTOP.md §7).

## 5. Failure states

Each failure replaces the Progress screen's stage list (or, for the quota case, appears at the Preview CTA before the import ever starts) with a single `Card`, surface, hairline, padding `space.lg`, centered content, `space.lg` gap between elements:

- Icon-free — no new glyph is introduced for failure states; the `warn` token carries the meaning through text color alone, per DESIGN.md's existing rule that `warn` is "error/limit text only," never a shape.
- `heading` 20 `ink` — the failure's name.
- `ui` 16 `warn` — one sentence naming what happened.
- `caption` `ink-2` — one sentence saying what to do instead.
- A `secondary` button returning to **2. Pick a file** (never primary — a failure is not the moment for a cutout CTA), except the quota case, which returns to Book detail / Library instead since there is nothing to re-pick.

| Case | Heading | warn line | ink-2 line | Button |
|---|---|---|---|---|
| DRM detected | "Verrou numérique détecté" | "Ce fichier est protégé et ne peut pas être importé." | "Retirez le verrou avec l'outil de votre libraire, ou choisissez un fichier EPUB, TXT ou Markdown sans verrou." | "Choisir un autre fichier" |
| Unsupported file | "Format non pris en charge" | "Ce type de fichier n'est pas encore géré." | "Sotto importe l'EPUB sans verrou, le TXT et le Markdown." | "Choisir un autre fichier" |
| Local models not running (free tier) | "Service local indisponible" | "Le service [Kokoro / faster-whisper / le serveur de modèles] ne répond pas." — the bracketed name is filled in per which local service failed (mono, matching how DESIGN.md names services elsewhere as literal mono labels, e.g. "12 MIN | A1"); never a generic "something went wrong" | "Démarrez la pile locale, puis réessayez." | "Réessayer" (replaces "Choisir un autre fichier" — the file was fine, the environment wasn't) |
| Quota reached (paid tier) | "Limite atteinte" | "Vous avez utilisé vos N imports ce mois-ci." | "Le compteur se réinitialise le <date>, ou passez à un forfait supérieur." | "Voir les forfaits" — pushes to Paywall (PAYWALL.md), the one legitimate non-mid-session entry point into the paywall named in that file |

## 6. Private-book library caption

Books imported by the reader (as opposed to seeded/community content) get one small addition wherever BookTile renders them in Home rails, Library grids, and Book detail — no separate component, an addition to the existing `BookTile`:
- Directly beneath the title/author caption pair, a `caption` 12 `ink-3` line: "Votre livre" — no icon, no badge shape, no border (this is the smallest possible marker, consistent with DESIGN.md's "no pill-chip navigation... no badges" spirit even though badges aren't explicitly named — the existing caption stack is reused, not a new chip).
- Private books never show the review-status disclaimer that seeded/community books carry on Book detail ("Version simplifiée" stays, since that's about reading level, not review status — but the human-review-pending label used for draft seed content, per DECISIONS.md item 5, is omitted entirely for private imports since there is no external reviewer for a personal upload).

## 7. Proof

At **375**: the Pick-a-file screen shows four stacked format cards with PDF visibly inert (dimmed, no chevron); the Preview screen shows the detected-language row with a working "Modifier" text action, the three-value stats strip, and the generated-content disclosure panel in surface-2 with no accent or warn color in it; the Progress screen shows exactly one stage row in the "active" percentage+bar state at a time and the "Lire le chapitre 1" secondary button appearing only after chapter 1's narration row completes; each of the four failure cards renders with `warn`-colored text only (no red icon, no red fill) and the correct single next action. At **1440**: Pick-a-file and Preview render as a centered 480px column (not stretched to the sidebar content width, not a two-column split); Progress keeps the same 480px measure; Library's plus-icon sits left of the search icon at the same 40px size, inline with the display title's baseline. Accept when no screen introduces a color outside the token table, when every failure state's only color departure from ink/ink-2/ink-3 is the single `warn` text line, and when "Votre livre" appears under private BookTiles wherever they're rendered without any new badge shape.
