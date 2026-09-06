/**
 * Pure data for `app/+not-found.tsx`'s two escape links (Home, Library).
 * Kept out of `app/` on purpose — Expo Router eagerly requires every file
 * under `app/` for its route table, so a `.test.ts` there crashes every
 * screen (see the run-7 navigation recon's BLOCKING FINDING and commit
 * 01e1139, which hit the exact same problem with a reader test). This
 * module, and its test, live in `src/ui/` instead; `+not-found.tsx` just
 * imports the constant.
 */
import type { MessageKey } from '../i18n/useT';

export const NOT_FOUND_LINKS: Array<{
  href: '/(tabs)/home' | '/(tabs)/library';
  labelKey: MessageKey;
}> = [
  { href: '/(tabs)/home', labelKey: 'notFound.toHome' },
  { href: '/(tabs)/library', labelKey: 'notFound.toLibrary' },
];
