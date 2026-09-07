/* eslint-disable @typescript-eslint/no-require-imports */
const uxdsl = require("postcss-uxdsl");

// The CLI already compiles generated CSS Modules. Running UXDSL on them again
// inherits its process-wide density tokens and injects impure :root selectors.
module.exports = function sourceOnlyUxdsl(options) {
  const plugin = uxdsl(options);
  return {
    postcssPlugin: "press-craftor-uxdsl-source",
    Once(root, helpers) {
      if (root.source?.input.file?.endsWith(".generated.module.css")) return;
      return plugin.Once(root, helpers);
    },
  };
};
module.exports.postcss = true;
