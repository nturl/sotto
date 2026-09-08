/**
 * Language families for onboarding's "I'm learning" step (run 10 lane A).
 *
 * `LEARNING_LANGUAGES` is a flat list of eleven content locales, three of
 * which are regional pairs (en-US/en-GB, es-419/es-ES, pt-BR/pt-PT). Shown
 * flat it reads as eleven languages, which is why the step used to run past
 * the fold: a stranger scans "English", "English (UK)", "Español
 * (Latinoamérica)", "Español (España)" and has to rule out doubles before
 * they can answer.
 *
 * So the list is grouped here: one row per language, the region picked in a
 * segmented control that only appears under the row that is selected. This
 * is a pure regrouping of the same codes — no locale is invented, none is
 * dropped, and `learningLocale` still stores exactly the codes the packs
 * ship (CONTRACTS §2b).
 */
import { localizedName, type LanguageOption } from '../ui/languages';

export type LanguageFamily = {
  /** The base subtag every variant shares: `en`, `es`, `zh`. */
  id: string;
  /** The family's own name, without the region a variant would add. */
  nativeName: string;
  localizedName: string;
  /** Every code in this family, in the order the source list has them. */
  variants: readonly LanguageOption[];
};

/** The base subtag of a content locale: `en-GB` -> `en`, `zh` -> `zh`. */
export function familyIdFor(code: string): string {
  return code.split('-')[0] ?? code;
}

/** Drops a trailing "(...)" — the region a flat list needs to disambiguate
 * two variants of one language, and which the family row does not. */
function withoutRegion(name: string): string {
  const stripped = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return stripped.length > 0 ? stripped : name;
}

/**
 * Groups the option list into one entry per language, source order kept.
 *
 * A family with a single code keeps that code's names verbatim: the
 * parenthetical on "Romanian (beta)" is a status, not a region, and
 * stripping it would quietly promise a finished language.
 */
export function languageFamilies(
  options: readonly LanguageOption[],
  catalog?: string,
): LanguageFamily[] {
  const order: string[] = [];
  const byId = new Map<string, LanguageOption[]>();
  for (const option of options) {
    const id = familyIdFor(option.code);
    const existing = byId.get(id);
    if (existing) existing.push(option);
    else {
      byId.set(id, [option]);
      order.push(id);
    }
  }
  return order.map((id) => {
    const variants = byId.get(id)!;
    const first = variants[0]!;
    const localized = catalog === undefined ? localizedName(first) : localizedName(first, catalog);
    const single = variants.length === 1;
    return {
      id,
      nativeName: single ? first.nativeName : withoutRegion(first.nativeName),
      localizedName: single ? localized : withoutRegion(localized),
      variants,
    };
  });
}

/** The family a stored code belongs to, or undefined if the list has none. */
export function familyForCode(
  families: readonly LanguageFamily[],
  code: string,
): LanguageFamily | undefined {
  const id = familyIdFor(code);
  return families.find((family) => family.id === id);
}

/** The variant a family opens on: the proposed code when it belongs to this
 * family (so the fast path's default survives a detour through another
 * language), else the family's first. */
export function defaultVariantFor(family: LanguageFamily, preferred: string): string {
  const match = family.variants.find((variant) => variant.code === preferred);
  return (match ?? family.variants[0]!).code;
}

/** A variant's label inside the segmented control: the region in its
 * localized name ("English (US)" -> "US"), or the native name when the
 * variant is not a region at all (the two Chinese scripts). */
export function shortVariantName(option: LanguageOption, catalog?: string): string {
  const localized = catalog === undefined ? localizedName(option) : localizedName(option, catalog);
  const region = /\(([^)]+)\)\s*$/.exec(localized)?.[1]?.trim();
  return region && region.length > 0 ? region : option.nativeName;
}
