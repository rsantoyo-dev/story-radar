import uxdsl from "postcss-uxdsl";

import theme from "./uxdsl.config.js";

const config = {
  plugins: {
    "postcss-uxdsl": uxdsl({
      breakpoints: theme.breakpoints,
      theme: theme.theme,
    }),
    "@tailwindcss/postcss": {},
  },
};

export default config;
