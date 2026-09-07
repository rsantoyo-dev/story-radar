import theme from "./uxdsl.config.js";
import path from "node:path";

const config = {
  plugins: {
    // Turbopack loads plugins from a generated worker, not this directory.
    [path.resolve(process.cwd(), "postcss-uxdsl-source.cjs")]: {
      breakpoints: theme.breakpoints,
    },
    "@tailwindcss/postcss": {},
  },
};

export default config;
