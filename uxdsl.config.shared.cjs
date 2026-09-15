/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs");
const { breakpoints, theme } = require("./uxdsl.config.js");

module.exports = function createUxdslConfig({ entry, outFile, includeTheme = false }) {
  return {
    entry,
    outFile,
    breakpoints,
    theme,
    includeTheme,
    references: {
      ...(includeTheme
        ? {}
        : { css: [fs.readFileSync("src/app/uxdsl.css", "utf8")] }),
      externalTokens: ["--font-geist-sans", "--font-geist-mono"],
    },
    watch: [entry],
  };
};
