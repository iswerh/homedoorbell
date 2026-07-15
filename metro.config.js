// Metro config: allow .tflite files to be bundled as assets, so a
// MobileFaceNet model can alternatively be shipped via require('...tflite')
// (see assets/models/README.md). The default runtime path loads the model
// from the app's documents directory instead.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('tflite');

module.exports = config;
