// Metro config for the pnpm workspace monorepo.
// https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so changes in packages/* are picked up.
config.watchFolders = [workspaceRoot];

// Resolve modules from both this app's node_modules and the workspace root's.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// pnpm workspaces are symlinked; make sure Metro follows them and prefers
// each workspace package's own node_modules when present.
config.resolver.disableHierarchicalLookup = false;
config.resolver.unstable_enablePackageExports = true;

// Enables require.context (webpack-style) so src/i18n/useT.ts can load
// whichever of the nine UI catalogs (CONTRACTS §1) actually exist on disk
// at bundle time, instead of a fixed list of static imports that would
// fail to resolve while a catalog file is still being drafted.
config.transformer.unstable_allowRequireContext = true;

module.exports = config;
