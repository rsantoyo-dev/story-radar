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
// A topic applies its own palette on a container, as inline
// `--uxdsl__palette__*` properties. The theme's composite tokens (Border,
// Shadow, Surface, Button and Input variables) are declared on :root, where
// their `var(--uxdsl__palette__…)` is resolved once against the stock
// palette, so they would ignore the topic's colors. Declaring them again on
// every element that carries palette overrides makes them resolve there.
const THEMED = '[style*="--uxdsl__palette__"]';
const COMPOSITE = /^--uxdsl__(border|shadow|surface|button|input)__/;
const PALETTE_DEPENDENT = /var\(--uxdsl__(palette|border|shadow|surface|button|input)__/;

function scopeCompositeTokens(root, postcss) {
  const scoped = [];
  root.each((node) => {
    const rules = node.type === "rule" ? [node] : node.type === "atrule" && node.name === "media" ? (node.nodes ?? []).filter((child) => child.type === "rule") : [];
    for (const rule of rules) {
      if (rule.selector.trim() !== ":root") continue;
      const decls = (rule.nodes ?? []).filter((decl) => decl.type === "decl" && COMPOSITE.test(decl.prop) && PALETTE_DEPENDENT.test(decl.value));
      if (!decls.length) continue;
      const copy = postcss.rule({ selector: THEMED });
      for (const decl of decls) copy.append(decl.clone());
      scoped.push(node.type === "atrule" ? node.clone({ nodes: [copy] }) : copy);
    }
  });
  for (const node of scoped) root.append(node);
}

module.exports = function sourceOnlyUxdsl(options) {
  const plugin = uxdsl(options);
  return {
    postcssPlugin: "press-craftor-uxdsl-source",
    Once(root, helpers) {
      if (root.source?.input.file?.endsWith("src/app/uxdsl.css")) scopeCompositeTokens(root, helpers.postcss);
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
