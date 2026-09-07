# Bring your own key

Sotto's voice tutor can run on the hosted web app with **your own OpenAI
key**, with nothing installed and no account. The page calls
`api.openai.com` directly from your browser; the key stays on your device
and OpenAI bills you, not us.

This is the middle option between the two ends of
[the three ways to run Sotto](../README.md#three-ways-to-run-it): more
capable than the in-browser tutor (which needs a WebGPU desktop browser and
a multi-hundred-megabyte model download), less setup than running your own
server.

## What it is

With a key stored, the app runs the same four-stage tutor cascade every
other path runs, but from the page itself:

| Stage          | Endpoint                               | Model                    |
| -------------- | -------------------------------------- | ------------------------ |
| Speech to text | `POST /v1/audio/transcriptions`        | `gpt-transcribe`         |
| Tutor replies  | `POST /v1/chat/completions` (streamed) | `gpt-5.6-terra`          |
| Tutor speech   | `POST /v1/audio/speech`                | `gpt-4o-mini-tts`        |
| Key check      | `GET /v1/models`                       | —                        |

The tutor's prompt, its seven tools (save a word, move the reading
position, show an explanation, …) and its four modes are identical to the
other paths — they are the same code (`@sotto/core`'s prompt builder and
tool schemas, `packages/voice`'s shared turn loop). Speech is played back at
24 kHz.

## How to get a key

1. Sign in at [platform.openai.com](https://platform.openai.com/).
2. Add a payment method under **Billing**. A brand-new account with no
   credit will return errors on the first request.
3. Create a key under **API keys** → _Create new secret key_. Copy it; the
   page shows it once.
4. In Sotto: **Settings → Tutor → Tutor voice**, paste it, and press
   **Connect and use this key**. Sotto checks the key against
   `GET /v1/models` before storing it, so a typo is caught immediately, and
   connecting also selects own-provider mode in the same action — there is
   no separate step to turn it on afterward.

Consider setting a monthly budget limit on your OpenAI account first. It is
the simplest protection against a surprise.

## What it costs

Sotto adds nothing to what OpenAI charges. Rates for the three models above
are on [OpenAI's pricing page](https://openai.com/api/pricing/); a tutor
turn is a few seconds of audio in, a couple of hundred tokens out, and a few
seconds of audio back. We deliberately publish no cost-per-minute figure of
our own here — the models and the prices both change, and a stale number in
a README is worse than no number.

## What leaves your device

**Only requests to `api.openai.com`**, and only these: the audio of what you
said, the passage text and your saved words as part of the tutor's prompt,
and the tutor's reply text for speech synthesis. Your key travels in the
`Authorization` header of those requests and nowhere else.

- The key is **never** sent to any Sotto server. There is no relay and no
  proxy: the browser talks to OpenAI directly.
- The key is **never** written into the app's exportable data. Settings →
  Export produces a file with your preferences, progress and saved words —
  no credential rides along.
- The key is **never** logged, printed to the console, or put in a URL.
- On the web it is stored in `localStorage` under `sotto.byok.openaiKey`. On
  iOS it is stored in the system keychain via `expo-secure-store`.

Anything with access to your browser profile can read `localStorage`, so
treat a key stored on a shared or public computer the way you would treat a
password saved there: don't.

## How to remove it

**Settings → Tutor → Tutor voice → Disconnect.** That deletes it from this
device immediately and switches the tutor mode selector back to "Not
connected". Clearing the site's data in your browser does the same thing.

Removing it here does not revoke it at OpenAI. If a key may have been
exposed, revoke it in the OpenAI dashboard as well — that is the only action
that actually invalidates it.

## Known limits

- **A bad key gives a vague error mid-session.** OpenAI's inference
  endpoints answer an invalid key with a `401` that carries no
  `Access-Control-Allow-Origin` header, so the browser discards the response
  and the page cannot read OpenAI's own "Incorrect API key provided"
  message — it sees only an opaque network failure. That is why Save
  validates against `GET /v1/models`, whose `401` _is_ readable. If a
  session starts failing after a key change, re-save the key to get a clear
  verdict.
- **Safari installed to the Home Screen is untested.** Microphone capture in
  a standalone iOS PWA has not been verified for this path. Safari in a
  normal tab works.
- **This is the web/PWA path.** The native iOS app stores a key the same way
  but is not the primary target of this feature.
- **Realtime is not used.** OpenAI's Realtime WebSocket also works
  browser-direct with a user key, but Sotto ships the cascade above: it is
  the measured, cheaper path, and it shares its code with every other tutor
  path.
- **No usage meter.** Sotto cannot read your OpenAI spend
  (`x-ratelimit-*` headers are not exposed to browser JavaScript). Watch it
  on OpenAI's own usage page.

## Troubleshooting

| Symptom                          | Cause                                                        |
| -------------------------------- | ------------------------------------------------------------ |
| "That key wasn't accepted."      | Wrong key, or a project key without access to those models.  |
| "Couldn't reach OpenAI."         | Offline, or a network that blocks `api.openai.com`.          |
| Tutor stops replying mid-session | Usually rate limiting or a spent quota — check OpenAI usage. |
| No microphone                    | Grant the site microphone permission; the tutor needs it.    |
