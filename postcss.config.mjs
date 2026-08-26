import theme from "./uxdsl.config.js";

const config = {
  plugins: {
    "postcss-uxdsl": {
      breakpoints: theme.breakpoints,
    },
    "@tailwindcss/postcss": {},
  },
};

export default config;
