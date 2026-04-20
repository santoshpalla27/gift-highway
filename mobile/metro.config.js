const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Prevent Metro picking up ESM .mjs files that use import.meta (e.g. zustand)
config.resolver.sourceExts = config.resolver.sourceExts.filter(ext => ext !== 'mjs')

module.exports = config
