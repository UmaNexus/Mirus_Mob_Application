const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Expo SDK 51's Metro version doesn't fully resolve lucide-react-native's
// package.json "exports" map (its ESM ".mjs" entry point) — this shows up as
// "package itself specifies a main module field that could not be resolved".
// Disabling package-exports resolution falls back to the legacy "main"/
// "react-native" fields, which point at a plain CommonJS build Metro already
// knows how to bundle.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
