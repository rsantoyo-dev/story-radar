import themeConfig from "./uxdsl.theme.config.cjs";
import { readFileSync } from "node:fs";
import path from "node:path";

const config = {
  plugins: {
    // Turbopack loads plugins from a generated worker, not this directory.
    // No top-level `breakpoints` here: the plugin only reads
    // `theme.breakpoints` when it's absent, and `theme` already carries it
    // (see uxdsl.config.js) — setting it here too would shadow, not merge.
    [path.resolve(process.cwd(), "postcss-uxdsl-source.cjs")]: {
      theme: themeConfig.theme,
      includeTheme: false,
      references: {
        css: [readFileSync("src/app/uxdsl.css", "utf8")],
        ...themeConfig.references,
      },
    },
  },
};

export default config;
