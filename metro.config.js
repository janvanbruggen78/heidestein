// metro.config.js (project root)
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

// keep your WASM tweak (harmless, useful later)
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];
config.resolver.sourceExts = config.resolver.sourceExts.filter(ext => ext !== 'wasm');

module.exports = config;
