/* eslint-disable @typescript-eslint/no-require-imports */
const uxdsl = require("postcss-uxdsl");

// The CLI already compiles generated CSS Modules. Running UXDSL on them again
// inherits its process-wide density tokens and injects impure :root selectors.
//
// Since 0.5.0-beta.0 the CLI also writes the global token blocks (density,
// shadow, radius/border, surface, button, input) into every entry it builds,
// including the per-panel CSS Modules. Those blocks duplicate what the theme
// build already emits into src/app/uxdsl.css verbatim, and CSS Modules reject
// them outright ("Selector :root is not pure"). Strip them here so the rule
// holds for `next build` and `next dev` alike, rather than in a post-build
// step the UXDSL watcher would bypass.
module.exports = function sourceOnlyUxdsl(options) {
  const plugin = uxdsl(options);
  return {
    postcssPlugin: "press-craftor-uxdsl-source",
    Once(root, helpers) {
      if (!root.source?.input.file?.endsWith(".generated.module.css")) {
        return plugin.Once(root, helpers);
      }
      root.walkRules((rule) => {
        if (rule.selector.trim() === ":root") rule.remove();
      });
      // A responsive token block leaves behind an empty @media wrapper.
      root.walkAtRules("media", (atRule) => {
        if (!atRule.nodes?.length) atRule.remove();
      });
    },
  };
};
module.exports.postcss = true;
