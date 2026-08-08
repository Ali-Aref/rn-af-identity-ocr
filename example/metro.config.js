// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const escape = (p) => p.replace(/[/\\]/g, '[/\\\\]');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(projectRoot, 'node_modules/.pnpm/node_modules'),
];

const singleton = (name) => path.resolve(projectRoot, 'node_modules', name);

config.resolver.extraNodeModules = {
  'rn-af-identity-ocr': workspaceRoot,
  react: singleton('react'),
  'react-native': singleton('react-native'),
  expo: singleton('expo'),
};

config.resolver.blockList = [
  ...Array.from(config.resolver.blockList ?? []),
  new RegExp(`${escape(path.join(workspaceRoot, 'node_modules/react'))}[/\\\\].*`),
  new RegExp(`${escape(path.join(workspaceRoot, 'node_modules/react-native'))}[/\\\\].*`),
  new RegExp(`${escape(path.join(workspaceRoot, 'node_modules/expo'))}[/\\\\].*`),
  new RegExp(`${escape(path.join(workspaceRoot, 'node_modules/babel-preset-expo'))}[/\\\\].*`),
  new RegExp(`${escape(path.join(workspaceRoot, 'node_modules/@react-native'))}[/\\\\].*`),
];

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
