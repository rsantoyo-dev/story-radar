/* eslint-disable @typescript-eslint/no-require-imports */

const path = require("node:path");
const createUxdslConfig = require("./uxdsl.config.shared.cjs");

module.exports = createUxdslConfig({
  entry: path.join(__dirname, "src/app/radar-dashboard.module.uxdsl"),
  outFile: path.join(
    __dirname,
    "src/app/radar-dashboard.generated.module.css",
  ),
});
