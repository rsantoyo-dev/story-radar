import theme from "./uxdsl.config.js";
import { readFileSync } from "node:fs";
import path from "node:path";

const config = {
  plugins: {
    // Turbopack loads plugins from a generated worker, not this directory.
    [path.resolve(process.cwd(), "postcss-uxdsl-source.cjs")]: {
      breakpoints: theme.breakpoints,
      theme: theme.theme,
      includeTheme: false,
      references: {
        css: [readFileSync("src/app/uxdsl.css", "utf8")],
        externalTokens: ["--font-geist-sans", "--font-geist-mono"],
      },
    },
  },
};

export default config;
