# Landing directions sheet 2 (readsotto.app), spec

Mode: Directions. Session on Fable by Noel's instruction 2026-09-06; Cleo builds directly.
Output: `planning/design/landing-directions-2.html`. Worker mockups saved beside it in
`planning/design/landing-mockups/` (kimi-a, kimi-b, astra-a, astra-b) and embedded in the sheet
as `iframe srcdoc` so each band shows the real document, not a redraw.

## Fit read
Noel is choosing a direction for a page he has already rejected once (V4: "does not show the value,
no book, tutor/own-key/self-host/install unclear, comparison matrix ugly"). Reader job: compare three
bets and point. Desktop, read once, so: a light sheet, bands stacked full-width, each band rendering
the real hero at 1280 and 375.

## The axis
What carries the value in the first ten seconds: **the object** (a literal book, poster register),
**the act** (read a passage, then talk about it, shown as one persistent stage), or **the structure**
(a worker's own structural bet). Every band answers Noel's six complaints; they differ on which
single thing the eye lands on first.

## Bands
- A. The Book (worker mockup with the literal book hero; poster register). Credited to its model.
- B. Worker's structural bet (the stronger of the two "mockup B" files). Credited.
- C. Cleo-native: **The Open Spread**, scrollytelling stage register. One open book is the persistent
  evidence graphic; four scenes change its state: Read (passage set on the left page), Tap (adapté
  gets the 18% peach fill and a gloss in the margin), Listen (speech fill sweeps the sentence), Speak
  (the right page becomes the tutor transcript). A fifth scene, Power, keeps the book and swaps only
  the footnote under it: on this device (free) / through Sotto's server (plan, $9.99 or $79, 3-day
  trial, voice to OpenAI, nothing stored) / with your own key (browser to OpenAI, key stays here) /
  on your own machine (docker compose up). That footnote IS the answer to complaints 3 and 4:
  power is a footnote to the act, never a tier. Install becomes the last scene: the book closes and
  sits on a phone home screen, device-detected steps beside it. In the sheet the stage is rendered
  as a static fragment with a five-step chip row driving the same states (no scroll dependence).

Rotation: last three skeletons chronicle / field guide / dossier; V3 manifesto, V4 field guide.
Poster last used 09-04 (milepost), scrollytelling stage never in the top 10. Both clean.
Anchor for C: Shade's paper cutout (already Sotto's own) crossed with Haptic's staged-object hero.
Flood: Sotto paper #F4ECDF, ink #221E1B, accent #E4572E on the CTA only. Sheet chrome: the same
paper one step cooler (#F1ECE3) so the bands read as specimens on a desk.

## Sheet structure
Masthead (title, the axis in one sentence, Noel's six complaints as a numbered hairline list with
a per-band "answered by" mark). Three bands, each: name + thesis, hero at 1280 (iframe scaled to
fit) and at 375 (iframe at real size), "commits to", "trades away", "right when", build DNA, "taken
all the way", steal / skip / go deeper chips. Reply builder composes chips into a Design brief and
copies it; state in localStorage. Footer.

## Type cast
Display Fraunces 300 (bundled? no: sheet uses the same stack as the app page: "Fraunces", "Iowan
Old Style", Georgia, serif, since no CDN fonts). Body Inter/system sans 15/1.55. Metadata system
mono 11/0.08em uppercase. Radius {2,10}. Hairlines rgba(34,30,27,0.12). No shadows except the
peach cutout on band C's book.

## Ban list
- No cards around bands; hairline rules only. No comparison matrix anywhere on the sheet.
- No new product claims, prices, or quotas beyond the brief's INPUTS.
- No accent outside CTAs (the mockups' own CTAs inside iframes, and the sheet's Copy button).
- No entrance animation; chips switch state in 120ms.

## Definition of done
cleo_verify full run 0 FAIL, WARNs named; four screenshots read; chips and reply builder exercised
in the Browser pane; every mockup file also passes cleo_verify --quick with 0 FAIL or its failures
are listed in the band's "trades away".
