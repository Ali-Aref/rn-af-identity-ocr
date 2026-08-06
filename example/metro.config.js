// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const escape = (p) => p.replace(/[/\\]/g, '[/\\\\]');

const config = getDefaultConfig(projectRoot);

// Parent module installs its own react / react-native / babel tooling for package
// development. Keep the example on a single Expo SDK 57 / RN 0.86.2 singleton.
config.resolver.blockList = [
  ...Array.from(config.resolver.blockList ?? []),
  new RegExp(`${escape(path.join(workspaceRoot, 'node_modules/react'))}/`),
  new RegExp(`${escape(path.join(workspaceRoot, 'node_modules/react-native'))}/`),
  new RegExp(`${escape(path.join(workspaceRoot, 'node_modules/@react-native'))}/`),
  new RegExp(`${escape(path.join(workspaceRoot, 'node_modules/babel-preset-expo'))}/`),
];

config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

config.resolver.extraNodeModules = {
  'rn-ocr-pro': workspaceRoot,
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
};

config.watchFolders = [workspaceRoot];

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
