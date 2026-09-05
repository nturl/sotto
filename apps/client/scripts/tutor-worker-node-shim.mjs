/**
 * Empty stand-in for Node's `path` / `fs/promises` modules inside the tutor
 * worker bundle (build-tutor-worker.mjs).
 *
 * kokoro-js's `dist/kokoro.js` has a top-level `import s from "path"` and
 * `import i from "fs/promises"` for its Node-only voice-file-loading path,
 * guarded at runtime by a `typeof process === "object"` check that is always
 * false in a browser worker — so neither import is ever actually used
 * there. kokoro-js's own package.json declares a `"browser"` field mapping
 * both to `false` for exactly this reason, but esbuild does not apply that
 * legacy field once a package also has an `"exports"` map (kokoro-js has
 * both) — verified by grepping the built bundle for `from"path"` and
 * `from"fs/promises"` with the "browser" field left to esbuild's default
 * handling: both imports survived into the output as literal, unresolvable
 * ESM imports, which is why `new Worker(..., {type:'module'})` failed to
 * load with a generic "unknown error fetching the script" (a type:'module'
 * Worker's imports are real browser ES module resolution, not bundled).
 * `alias`-ing both specifiers to this file in esbuild's build options fixes
 * it without needing kokoro-js to change.
 */
export default {};
