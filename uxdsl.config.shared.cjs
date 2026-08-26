/* eslint-disable @typescript-eslint/no-require-imports */

const { breakpoints, theme } = require("./uxdsl.config.js");

module.exports = function createUxdslConfig({ entry, outFile, includeTheme = false }) {
  return {
    entry,
    outFile,
    breakpoints,
    ...(includeTheme ? { theme } : {}),
    watch: [entry],
  };
};
