const spacing = {
  1: "0.125rem",
  2: "0.25rem",
  3: "0.5rem",
  4: "0.75rem",
  5: "1rem",
  6: "1.5rem",
  7: "2rem",
  8: "2.5rem",
  9: "3.125rem",
  10: "3.875rem",
  11: "4.875rem",
  12: "6.125rem",
  13: "7.75rem",
  14: "9.75rem",
  15: "12.25rem",
  16: "15.375rem",
};

const palette = {
  primary: {
    main: "#246b4a",
    light: "#4a936b",
    dark: "#17422f",
    contrast: "#ffffff",
  },
  secondary: {
    main: "#c25b3f",
    light: "#dc8068",
    dark: "#7f3827",
    contrast: "#ffffff",
  },
  surface: {
    main: "#ffffff",
    light: "#f7faf8",
    dark: "#dbe5df",
    contrast: "#18392d",
  },
  tertiary: {
    main: "#7b9086",
    light: "#aabbb3",
    dark: "#50665c",
    contrast: "#ffffff",
  },
  success: {
    main: "#2f855a",
    light: "#68b68b",
    dark: "#1f5b3e",
    contrast: "#ffffff",
  },
  info: {
    main: "#28728a",
    light: "#65a9bb",
    dark: "#1b4d5d",
    contrast: "#ffffff",
  },
  warning: {
    main: "#b7791f",
    light: "#d9a441",
    dark: "#744b13",
    contrast: "#ffffff",
  },
  error: {
    main: "#b84935",
    light: "#d87862",
    dark: "#762e22",
    contrast: "#ffffff",
  },
  dark: {
    main: "#18392d",
    light: "#315746",
    dark: "#0d2119",
    contrast: "#ffffff",
  },
  neutral: {
    main: "#6b8077",
    light: "#aabbb3",
    dark: "#40564c",
    contrast: "#ffffff",
  },
  light: {
    main: "#f1f6f3",
    light: "#ffffff",
    dark: "#dbe5df",
    contrast: "#18392d",
  },
};

module.exports = {
  breakpoints: {
    xs: 0,
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
  },
  theme: {
    fonts: {
      families: {
        ui: "var(--font-geist-sans), ui-sans-serif, sans-serif",
        "ui-2": "var(--font-geist-sans), ui-sans-serif, sans-serif",
        code: "var(--font-geist-mono), ui-monospace, monospace",
      },
    },
    palette,
    spacing,
    typography: {
      "body-size": "1rem",
      "body-line": "1.6",
      "body-weight": "400",
      "small-size": "0.875rem",
      "small-line": "1.4",
    },
  },
};