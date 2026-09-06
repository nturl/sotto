/**
 * Shared helpers for the live-voice e2e scripts (voice-live.mjs,
 * self-hosted-voice.mjs, audible-probe.mjs).
 *
 * Two things every one of them needs since R6-B3 (src/voice/voiceStartGate.ts):
 *
 *  1. `tapStart` — the voice screen no longer auto-starts a session on
 *     mount; a real tap on the "Start" button (`voice.start`) is what
 *     invokes `startSession`. A script that only navigates and polls sits
 *     on the pre-session screen until its timeout. The press handler is a
 *     no-op until the availability probe has resolved a path, so a tap that
 *     lands too early leaves the button up — hence the retry loop.
 *
 *  2. `installMicProbe` / `assertRealCapture` — run7/F1 root-cause note: a
 *     dev server started with `EXPO_PUBLIC_VOICE=fake` (what
 *     screenshots.mjs / the fixture-driven demos use; Expo inlines
 *     EXPO_PUBLIC_* at bundle time, so the URL looks identical) serves the
 *     scripted FakeVoiceProvider. That provider reports `listening` and
 *     canned captions without ever touching `getUserMedia`, so a fake-mic
 *     wav is never captured, zero binary frames go over any socket, and the
 *     script times out looking exactly like a broken capture pipeline. The
 *     probe counts real `getUserMedia` calls so the script can fail fast
 *     with the actual cause instead.
 */

const MIC_PROBE_SCRIPT = `
window.__sottoMicProbe = { getUserMediaCalls: 0 };
const origGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = (constraints) => {
  window.__sottoMicProbe.getUserMediaCalls++;
  return origGum(constraints);
};
`;

/** Register before the first navigation that loads the app bundle. */
export async function installMicProbe(page) {
  await page.addInitScript(MIC_PROBE_SCRIPT);
}

/** Returns how many times the page has called `getUserMedia` so far. */
export async function getUserMediaCalls(page) {
  return page.evaluate(() => window.__sottoMicProbe?.getUserMediaCalls ?? 0);
}

/**
 * Taps the voice screen's "Start" button and waits for it to go away
 * (i.e. `startSession` actually ran). Throws if it never appears or never
 * clears.
 */
export async function tapStart(page, { label = 'Start', attempts = 10, settleMs = 800 } = {}) {
  const button = page.getByText(label, { exact: true });
  await button.first().waitFor({ state: 'visible', timeout: 15_000 });
  for (let i = 0; i < attempts; i++) {
    await button.first().click();
    await page.waitForTimeout(settleMs);
    if ((await button.count()) === 0) return;
  }
  throw new Error(
    `voice-start: "${label}" button still showing after ${attempts} taps — startSession never ran`,
  );
}

/**
 * Call once the screen has reported `listening` (or at the end of the
 * poll loop). Throws with the real cause if the session got there without
 * a single `getUserMedia` call — the fake-provider bundle described above.
 */
export async function assertRealCapture(page, { baseUrl } = {}) {
  const calls = await getUserMediaCalls(page);
  if (calls > 0) return calls;
  throw new Error(
    `voice-start: the session reached a live state but the page never called getUserMedia. ` +
      `The dev server${baseUrl ? ` at ${baseUrl}` : ''} is almost certainly running with ` +
      `EXPO_PUBLIC_VOICE=fake (FakeVoiceProvider never captures audio). Restart it with that ` +
      `variable unset (e.g. \`pnpm dev:web\`) or point BASE_URL at a server that was.`,
  );
}

/**
 * Reads the voice screen's current state + captions off the DOM in the
 * shape the scripts' stop conditions and assertions expect
 * (`{ stateLine: 'listening', captionLines: ['You: …', 'Tutor: …'] }`).
 *
 * run7/F2 (commit 12c73d9) redesigned the screen into a conversation:
 * the transcript now renders each turn as a speaker label ("Tutor"/"You",
 * `textTransform: 'uppercase'` so `innerText` yields "TUTOR"/"YOU") on its
 * own line followed by the text, and the status pill is uppercase too. The
 * scripts' original `^(You|Tutor):` / `=== 'listening'` matching predates
 * that, which is why they timed out with a working pipeline. The English
 * labels are assumed (every script seeds `interfaceLocale: 'en'`).
 */
export async function readVoiceSnapshot(page) {
  return page.evaluate(() => {
    const STATES = new Set([
      'idle',
      'connecting',
      'listening',
      'thinking',
      'speaking',
      'paused',
      'muted',
      'reconnecting',
      'ended',
      'error',
    ]);
    const LABELS = { TUTOR: 'Tutor', YOU: 'You' };
    const lines = document.body.innerText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const stateLine = lines.find((l) => STATES.has(l.toLowerCase()))?.toLowerCase() ?? '';
    const captionLines = [];
    for (let i = 0; i < lines.length - 1; i++) {
      const speaker = LABELS[lines[i].toUpperCase()];
      if (speaker) captionLines.push(`${speaker}: ${lines[i + 1]}`);
    }
    return { stateLine, captionLines };
  });
}
