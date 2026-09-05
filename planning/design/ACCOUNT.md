# Sotto account + usage (extends DESIGN.md, finished level)

Skeleton: **grouped-card list**, same structural device as Profile's existing `Group`/`Row` pattern (`apps/client/app/profile.tsx`) — this is the one file of the three that deliberately reuses an existing skeleton rather than inventing one, because Account is functionally an extension of Profile's settings list (it is reached from Profile, per §0) and DESIGN.md's own Don't-list warns against gratuitous novelty more than it warns against repetition of a pattern that already fits. Usage (§3) breaks from the list into a **stat-block stack** instead, since progress bars and a session log are not settings rows.

All tokens, radii, and the three signature devices are inherited unchanged. No new color, radius, or shadow. `accent` appears only on "Sign in with Apple"'s required Apple-HIG treatment (per Apple's own button spec, which is black/white by design, not this app's accent — see §1) and nowhere else on these screens.

## 0. Entry point

Profile gains one row, above the existing LANGUES group (account status is the first thing to know, ahead of language settings), unlabeled as its own eyebrow group of one — instead it sits as a `Card` on its own, same visual weight as a `Group`'s `groupCard` but with a single row:
- Signed out: label "Se connecter", chevron, no value text.
- Signed in: label = the account email, `caption` `ink-2` value = plan name ("Standard" / "Plus" / no value if free), chevron.
- This row only renders when a `CloudAdapter` is present (PAYWALL.md §4's rule, restated here since Account is the other screen it governs) — absent in the OSS/NullCloud build, exactly as DESIGN.md's existing Profile spec already states ("No subscription rows... " extends to this too).
- Tap opens **1. Account (signed out)** or **2. Account (signed in)** depending on state.

## 1. Account — signed out

`Shell` canvas, `BackLink` ("Retour", accent).
- Display title 28: "Compte".
- `ui` 16 `ink-2` subhead: "Connectez-vous pour la voix OpenAI, l'import hébergé et l'accès sur iPhone." (Same free-tier-stays-free framing as Paywall's subhead — signing in is not itself a paywall, but the copy should not imply signing in is required for anything free.)
- **Sign in with Apple**: the platform-supplied button, per Apple HIG — black fill, white "Sign in with Apple" label + Apple glyph, full width, `radius.md` (10, matching this app's own corner radius so it doesn't look foreign, which HIG permits — corner radius is a customizable parameter of the official button). This is the one place in the app a fill color other than the token table's `accent`/`surface`/`surface-2`/`ink` appears, because Apple's button is a fixed system asset, not a Sotto-drawn component; it sits at the same `space.tapTarget` (44) minimum height as every other primary action.
- Divider row beneath it: a plain hairline with `caption` `ink-3` "ou" centered on it (matching how a divider-with-label would use existing tokens: hairline color, caption size, no new line-weight).
- **Email row**: `Card` surface, hairline border, radius 10, padding `space.lg`. Contains: `caption` `ink-2` label "Recevoir un lien par e-mail", a text input below it (surface-2 fill, radius 10, `ui` 16, matching Library's search-input treatment from DESIGN.md), and a `secondary` button "Envoyer" (not primary — Apple sign-in is the app's preferred path per HIG's own requirement that Apple sign-in be offered at least as prominently as other third-party options, so email is visually secondary, matching PAID-TIER-PLAN.md's decision to offer both).
  - **Sent state**: after "Envoyer" succeeds, the button's label swaps to a disabled `ui` 500 `ink-3` "Envoyé" (no re-send affordance on this screen; the row's input becomes disabled/greyed via `ink-3` text) and a `caption` `ink-2` line appears beneath the card: "Vérifiez [email]. Le lien expire dans 15 minutes." with the entered address interpolated. No countdown timer, no auto-retry — this is a stable, calm confirmation state, not a live-updating one.
- No legal caption is needed on this screen beyond what the Sign-in-with-Apple button itself carries (Apple's own consent flow); Terms/Privacy links belong on Paywall (PAYWALL.md §2) where money is actually changing hands, not here.

## 2. Account — signed in

Same shell/title/BackLink as §1. Grouped cards, same `Group`/`Row` structural components as Profile:

- **Group "COMPTE"** (mono eyebrow, `SectionEyebrow`):
  - Row: "E-mail" — value = the account email, no chevron (not editable here; email is the sign-in identity, not a settable preference).
  - Row: "Forfait" — value = plan name ("Standard" / "Plus"), chevron (opens **3. Usage** below — the only navigable row in this group).
  - Row: "Renouvellement" — value = the renewal date in the app's existing date format, no chevron.
  - Row: "Gérer l'abonnement" — chevron, `onPress` opens the platform's native subscription management (App Store subscription settings on iOS, Stripe customer portal on web) — an external hand-off, not a Sotto screen, so no back-navigation state to design here.
- **Group** (unlabeled — a lone destructive-adjacent action doesn't need its own eyebrow, matching how Profile's existing DONNÉES group mixes non-destructive rows with `Réinitialiser`, which is itself `warn`-colored per the existing `Row` component's `destructive` prop):
  - Row: "Se déconnecter" — `ui` 15, no chevron (it's an immediate action, not a navigation), no destructive color (signing out is reversible, unlike delete).
  - Row: "Supprimer le compte" — `destructive: true` (reuses `Row`'s existing prop, `warn`-colored text, no chevron), opens **the two-step confirmation** below.

### Delete account — two-step confirmation

Reuses the same confirm-dialog pattern Profile already has for "Réinitialiser" (`confirmReset` state + inline confirmation), extended to two explicit steps since account deletion is higher-stakes than a local data reset:

- **Step 1**: an inline `Card` (surface, hairline, `warn`-colored 1px border — the one place a border color departs from `hairline`, matching how `warn` already governs error/limit text and this is the visual equivalent for a destructive-confirmation container) replaces the "Se déconnecter"/"Supprimer" row pair in place (not a separate screen, not a native OS alert — consistent with the app's "no modals" posture even for destructive actions). Content: `ui` 15 `ink` "Supprimer votre compte ?", `caption` `ink-2` beneath it: "Vos livres importés et votre historique d'utilisation seront supprimés avec le compte. Cette action est définitive." Two buttons side by side: `secondary` "Annuler" (returns to the row pair) and a `warn`-text `ghost`-variant button "Continuer" (not primary/cutout — DESIGN.md reserves the cutout for constructive commitments; a destructive continue stays ghost with warn-colored label, borrowing the existing `Row` destructive-text convention rather than inventing a new button variant).
- **Step 2**: replaces step 1's card content in place. Same card, same warn border. `ui` 15 `ink` "Confirmer la suppression", `caption` `ink-2`: "Tapez SUPPRIMER pour confirmer." plus a text input (surface-2, radius 10) that must exactly match before the final button enables. Two buttons: `secondary` "Annuler", and the final `warn`-text ghost button "Supprimer définitivement" — disabled (ink-3 label, no press feedback) until the typed text matches, matching `Button`'s existing `disabled` handling.
- On success: navigates back to the signed-out **Account** screen (§1) with a `Toast` (reusing the existing `Toast` component from Profile's export/import flow) reading "Compte supprimé.".

## 3. Usage screen

Reached from the signed-in Account screen's "Forfait" row (§2). `Shell` canvas, `BackLink`.

- Display title 28: "Utilisation".
- **Tutor minutes block**: `Card` surface, hairline, radius 10, padding `space.lg`.
  - `caption` `ink-2` label: "Minutes de tuteur".
  - `ui` 16 `ink` value line: "142 / 200 min" (used/cap, mono for the numbers specifically — matching DESIGN.md's mono-for-counts convention used elsewhere, e.g. Vocabulary's "2 mots" and Review's "4 / 12").
  - **Segmented progress bar**: `surface-2` track, `ink` fill (per the constraint's explicit spec — not `accent`, since accent stays reserved for CTA/active-tab; this reuses the exact "progress bar in surface-2 with ink fill" device IMPORT.md's stage rows and BookTile's in-progress bar already establish, so Usage's bar is visually the same component, just wider and segmented). Segmented into discrete blocks (one per some fixed unit, e.g. per 20-minute block) with 2px gaps between segments rather than one continuous fill — "segmented" distinguishes it from BookTile's continuous 3px bar and matches the Reader's segmented-progress narration scrubber (one segment per paragraph) as the app's existing precedent for a segmented meter.
  - `caption` `ink-3` beneath: "Réinitialisation le <date>."
- **Imports block**: identical structure, second `Card`, `space.md` below the first: "Imports" label, "3 / 5" value, same segmented ink-fill bar, same reset-date caption.
- **Per-session list**: `heading` 20 "Sessions récentes" above a `Card` containing rows (hairline dividers, matching `Row`/`Group`'s pattern exactly): each row shows date (`ui` 15 `ink`, left), and right-aligned a two-part `caption` `ink-2` value: minutes + mode, e.g. "18 min · Discussion" (mode names reuse the existing `TutorMode` labels already defined for Profile's tutor-mode cycling: read_to_me/read_with_me/pronunciation/discuss, localized). No chevron — rows are informational, not navigable.
- **Over-the-cap state**: when minutes-used >= cap, the tutor minutes block's value line switches from `ink` to `warn` color (text-only, no icon, no red fill — same restraint as every other error state in this spec) and a `caption` `warn` line replaces the reset-date caption temporarily... no — the reset-date caption stays (the user still needs to know when it resets); instead a THIRD line is added beneath both: `caption` `warn`, the exact message the tutor itself shows when refused, so the two surfaces agree word-for-word: "Limite de minutes atteinte. Le tuteur reprendra le <date>, ou passez à un forfait supérieur." — the trailing clause links to Paywall (`accent` inline text "forfait supérieur") exactly as IMPORT.md's quota-failure row does, since this is the same underlying limit surfaced in a second place.
- Desktop 1440: content centered at 480px (this is a stat/list screen with the same "don't stretch a focused screen" posture as Review and the Paywall's plan-card pair — no grid, no two-column split; there is nothing here that benefits from extra width).

## 4. Proof

At **375**: Account signed-out shows the Apple button at full width with its own black fill (verified as the one non-token color on the page, and only there), the "ou" divider, and the email row's sent state showing a disabled "Envoyé" label with the confirmation caption beneath; Account signed-in shows the COMPTE group with Gérer l'abonnement's chevron and the destructive Supprimer-le-compte row in warn text with no chevron; tapping it shows step 1's warn-bordered card in place of the row pair, and step 2 shows the disabled "Supprimer définitivement" button becoming enabled only once "SUPPRIMER" is typed exactly; Usage shows two segmented ink-fill-on-surface-2 bars (not continuous, not accent-filled) each with a used/cap mono value and a reset-date caption, and a session list with hairline row dividers matching Profile's existing Group component. At **1440**: Account and Usage both render as centered 480px columns inside the sidebar shell, matching Paywall's and Review's measure — not stretched to 1040px. Accept when the only non-palette-token color anywhere across both screens is Apple's own system-supplied button, when both delete-confirmation steps happen inline (no native alert, no separate route), and when the over-the-cap warn message on Usage is character-for-character the same string IMPORT.md's quota-failure state and Paywall's entry-point copy would produce for the same limit.
