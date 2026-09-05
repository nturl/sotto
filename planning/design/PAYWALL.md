# Sotto paywall (extends DESIGN.md, finished level)

Skeleton: **card-pair comparison** — two plan cards side by side (phone: stacked; desktop: side by side, not a grid), not the monument centered-column DESIGN.md's screens mostly use and not IMPORT.md's step-stack. This is the one screen in the app whose job is a decision between two things, so it's the one screen that puts two `Card`s at equal visual weight next to each other, chosen over Voice's chip row (nothing here is a mode switch) and Vocabulary's list (nothing here is a collection).

All tokens, radii, and the three signature devices are inherited unchanged. The cutout appears ONLY on the primary purchase CTA — plan cards themselves use hairline borders and a selected-state ink border, never a cutout, so the CTA is unambiguously the one pressable commitment on the screen. No new color, radius, or shadow.

## 0. Rules carried over from DECISIONS.md and PAID-TIER-PLAN.md (not new here, restated so this file is self-contained)

- Never shown mid-session: not during reading, not during narration, not during a tutor conversation. It only ever opens from an entry point below.
- The free tier is nagged **at most once per session**, and only via a quiet row — never a modal, never an interstitial, never a badge stacked on a tab icon.
- Reading, narration, tap-translate, vocabulary, and the local/in-browser tutor are free. The paywall's own copy must say so in plain language — the screen sells what's added, not what's withheld.
- Paid adds: OpenAI voices for the tutor on any device, phone/iOS access to the hosted tutor, book uploads with hosted processing (see IMPORT.md), and minute/import caps shown as real numbers, not vague tiers.
- Primary button is always the platform purchase action: StoreKit in-app purchase on iOS, Stripe Checkout on web. On iOS, a plain text line may show the web price with a link (per PAID-TIER-PLAN.md's guideline 3.1.1(a) reference) — never a second button.
- If the app has no `CloudAdapter` (OSS/NullCloud build), this entire screen and every entry point into it renders nothing at all — see §6.

## 1. Entry points (the nag)

Exactly two places this screen can be reached from, both quiet, both at most once per session:

### 1a. Home quiet row
- One row, appears at most once per session, directly beneath the daily-story card and above the first rail (so it never displaces reading content, only precedes it once).
- `Card` surface, hairline border, padding `space.md`, single row: left a `caption` `ink-2` line — "La voix OpenAI et l'import sur iPhone sont disponibles avec un forfait." — right a `ui` 500 `accent`-colored text action "Voir" (text only, no button chrome, no cutout — a row is not a CTA). No icon, no dismiss X (dismissing is just not tapping it; it won't reappear this session either way since the once-per-session rule already governs it, not a per-row dismissal state).
- Tapping "Voir" opens the Paywall screen (§2).

### 1b. Import quota / paid-feature entry
- From IMPORT.md's failure-state table (quota reached) and from any explicit tap on a paid-only affordance (e.g. selecting OpenAI voice in Voice's mode switcher while on the free tier) — these are direct navigations to the Paywall screen, not the quiet row; they happen because the user reached for the specific paid thing, not as a nag.

No other entry points exist. Profile/settings does not carry a "Forfait" row pointing here unless the user is already signed in with an active plan (see ACCOUNT.md's Manage subscription row, which goes to the platform's own subscription management, not back to this screen).

## 2. Paywall screen

`Shell` canvas (or full-canvas modal-free push on mobile — this is a screen, not a sheet, since DECISIONS.md's "never a modal" applies to the nag but this screen itself, once opened deliberately, is a normal pushed screen with its own `BackLink`).

- `BackLink` top-left, "Retour", accent.
- Display title 30 (Book-detail's title scale, since this screen is similarly a single subject, not a top-level tab): "Sotto avec voix".
- `ui` 16 `ink-2` subhead directly beneath, one sentence, the free-tier-stays-free statement: "La lecture, la narration, la traduction et le tuteur local restent gratuits. Un forfait ajoute la voix OpenAI, l'import avec traitement hébergé, et l'accès sur iPhone."
- **Plan cards**: two `Card`s (surface, radius 10, hairline border, padding `space.lg`), gap `space.md` between them.
  - Phone 375: stacked vertically, full content width.
  - Desktop 1440: side by side, each card width `(480 - space.md) / 2`-equivalent — i.e. the pair sits inside the same 480px measure IMPORT.md's centered column uses, not the full 1040px content region (this is still a focused decision, not a grid page).
  - Each card, top to bottom:
    - mono eyebrow, plan name uppercase: "STANDARD" / "PLUS".
    - `heading` 22 price line: "$9,99/mois" / "$19,99/mois" (placeholder values per PAID-TIER-PLAN.md's config table — these are literal config, not hardcoded copy, but this file specifies where they render).
    - `caption` `ink-2`, three lines, one per entitlement, each prefixed with a small ink dash (not a checkmark glyph — DESIGN.md has no icon-set for bullets beyond the ones it already names, so reuse plain text rather than invent a new glyph):
      - Standard: "200 minutes de tuteur / mois" · "5 imports / mois" · "Voix OpenAI standard"
      - Plus: "600 minutes de tuteur / mois" · "20 imports / mois" · "Voix OpenAI qualité supérieure"
    - No cover art, no cutout on the card itself — plan-card "cover art" (per this task's constraint list) means: if a small illustrative panel is used at the top of each card, it follows the same flat-geometric cover language as book covers (Nightjar/Saltpath palette seeds, DECISIONS.md) and may carry the cutout the way a `Cover` component does, but text and price never sit inside that panel — it stays a strip above the eyebrow, optional, and does not replace the hairline card border.
  - **Selected state**: tapping a card selects it (radio-like, one selected at a time — defaults to Standard). Selected card: hairline border becomes `1.5px solid ink` (matching the Reader's saved-word "ink outline 1.5px" precedent for a selected/committed state), no fill change, no accent — accent stays reserved for the CTA below. Unselected card stays plain hairline.
- **Primary CTA**: cutout button, full width on phone / width of the selected plan's own card on desktop, label is the platform action plus the selected plan's price: "S'abonner — $9,99/mois" (updates live as the user switches cards). This is the one cutout on the screen.
  - iOS: beneath the CTA, `caption` `ink-3` plain text line, no button chrome, no border: "Aussi disponible sur le web pour $9,99/mois — [ouvrir]" where "[ouvrir]" is an inline `accent` text link (not a second button, per the constraint above).
  - Web: no such line (there is no "other platform" to point to from web).
- **Loading state**: while the purchase call is in flight, the CTA's face swaps its label for a plain `ui` 500 `surface`-colored "..." (three static dots, no spinner glyph — DESIGN.md has no spinner device, and the app's existing motion vocabulary is press/hover/sheet-slide, not indeterminate spinners) and the button is disabled (no press animation, per `Button`'s existing `disabled` handling). Plan cards become non-interactive (`accessibilityState={{disabled:true}}`) but keep their current visual state — no dimming, since dimming is reserved for the truly-unavailable PDF row pattern in IMPORT.md, and this is a normal in-progress state, not an inert one.
- **Error state**: purchase fails or is cancelled by the platform. CTA returns to its normal label/state (never stays stuck on "..."). A `caption` `warn` line appears directly beneath the CTA: "L'achat n'a pas abouti. Réessayez." No `Card`, no separate panel — this is a single text line, matching how IMPORT.md's failures use `warn` as text-only, never a shape or icon.
- **Restore purchases**: `caption` `ink-2` text action, centered, `space.lg` below the CTA/error area: "Restaurer mes achats". No button chrome.
- **Legal caption**: `caption` `ink-3`, centered, bottom of the screen (above the home indicator on phone): "En vous abonnant, vous acceptez les [Conditions] et la [Politique de confidentialité]." — the two bracketed terms are inline `accent`-free `ink-3` underlined text links (legal captions don't get accent per DESIGN.md's "accent nowhere but CTA fill and active tab" rule; underline substitutes for color to signal tappability, matching how the app has no other convention for an inline text link at caption size — Restore purchases above is a standalone action so it doesn't need underlining, but an inline link embedded in a sentence does).

## 3. Desktop 1440 layout

- Content sits in the standard sidebar-shell content region per DESKTOP.md §1, but this screen (like Onboarding) arguably doesn't need the sidebar at all — however, unlike Onboarding, the Paywall is reached from inside the signed-in app (Home's quiet row, or a paid-feature tap), so it keeps the sidebar shell rather than dropping to full canvas: a user opening this screen should still see where they are in the app, not feel ejected into a separate flow the way Onboarding is.
- Content centered at the 480px measure described in §2, vertically centered-ish (top-padded per DESKTOP.md §1's standard 48px top padding, not viewport-centered — this isn't a first-run moment like onboarding's fast-path screen).

## 4. Absent-adapter state

When no `CloudAdapter` is present (the OSS/NullCloud build):
- The screen does not render — there is no route, no placeholder "coming soon" screen, no dimmed preview of plan cards. Attempting to navigate here (there shouldn't be any live entry point, since §1's both entries are themselves conditional on `CloudAdapter` presence) is a no-op.
- Concretely: Home's quiet row (§1a) does not render at all when `CloudAdapter` is absent — not hidden-but-present, not disabled, absent from the tree, the same way DESIGN.md's Profile spec already says "No subscription rows, no referral card" for the OSS build.
- IMPORT.md's quota-failure case cannot occur in a NullCloud build (there is no quota), so that entry point is naturally absent too.
- This mirrors PAID-TIER-PLAN.md's Lane S framing: "account UI only renders when a CloudAdapter is present" — this file extends that same rule to the paywall and its entry points.

## 5. Proof

At **375**: the quiet Home row renders as a single hairline surface card beneath the daily-story card, with the "Voir" text action in accent and no icon or dismiss control; the Paywall screen shows two stacked plan cards with Standard selected by default (1.5px ink border), the cutout CTA reading "S'abonner — $9,99/mois", the iOS web-price caption beneath it as plain text (not a button), Restore purchases and the legal caption both present, and no accent color anywhere except the CTA fill and the "Voir"/"[ouvrir]" text links. At **1440**: the two plan cards render side by side within a centered 480px column inside the sidebar shell (not stretched to 1040px, not a 3/4-column grid); switching the selected card live-updates the CTA's price label. Accept when the loading state shows a disabled CTA with no spinner glyph, the error state shows a single warn-colored text line with no icon or card, and — separately — when a build with no `CloudAdapter` shows zero trace of this screen: no row, no link, no route.
