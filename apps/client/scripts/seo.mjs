/**
 * What the web export tells search engines (2026-09-21).
 *
 * One page is meant to rank: the landing at https://readsotto.app/. Before
 * this, Google listed four "Sotto" results for the one product: the landing
 * under www.readsotto.app (both hosts served the same site with no canonical,
 * and Google picked www), the app shell on app.readsotto.app with its
 * <noscript> text as the snippet, plus /robots.txt and /sitemap.xml that
 * fell through vercel.json's catch-all rewrite and came back as app.html.
 *
 * build-web.mjs uses these helpers to write the right files for the build it
 * is producing; vercel.json redirects the aliases onto the apex; sotto-cloud
 * adds X-Robots-Tag on the paid origin as well.
 */
export const FREE_ORIGIN = 'https://readsotto.app';

/**
 * The paid client (app.readsotto.app) is this same export built with
 * EXPO_PUBLIC_CLOUD_URL set: apps/client/src/cloud/provider.tsx selects the
 * HttpCloudAdapter on it, and sotto-cloud's Dockerfile sets it before
 * `pnpm web:export`. The free deploy leaves it unset.
 * @param {{ EXPO_PUBLIC_CLOUD_URL?: string | undefined }} [env]
 */
export function isPaidClientBuild(env = process.env) {
  return Boolean(env.EXPO_PUBLIC_CLOUD_URL);
}

export const NOINDEX_META = '<meta name="robots" content="noindex">';

/**
 * app.html is served for every client-side route on both origins and has no
 * server-rendered content, so it must never be indexed: the landing page is
 * the one page search engines should show, and it never carries this tag.
 * Idempotent, like the other build-web.mjs injections.
 */
export function injectNoindex(html) {
  if (html.includes('name="robots"')) return html;
  return html.replace('</head>', `    ${NOINDEX_META}\n  </head>`);
}

export function robotsTxt({ paid, origin = FREE_ORIGIN }) {
  if (paid) return 'User-agent: *\nDisallow: /\n';
  return [
    'User-agent: *',
    'Allow: /',
    // App data and bundles, not pages: nothing to rank, a lot to download.
    'Disallow: /content/',
    'Disallow: /_expo/',
    'Disallow: /tutor/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

/** The landing page is the only URL; `lastmod` is the build date (YYYY-MM-DD). */
export function sitemapXml({ origin = FREE_ORIGIN, lastmod }) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${origin}/</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    '  </url>',
    '</urlset>',
    '',
  ].join('\n');
}
