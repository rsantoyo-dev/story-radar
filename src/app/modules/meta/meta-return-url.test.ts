import assert from "node:assert/strict";
import test from "node:test";
import { metaReturnBaseUrl } from "./meta-return-url";

test("after a Meta dialog the browser returns where the editor signs in, not to the public address Meta redirects to", () => {
  assert.equal(metaReturnBaseUrl({ BETTER_AUTH_URL: "http://localhost:3000", RADAR_APP_URL: "https://tunnel.ngrok-free.dev" }), "http://localhost:3000", "local development: back to localhost");
  assert.equal(metaReturnBaseUrl({ RADAR_APP_URL: "https://app.presscraftor.com/" }), "https://app.presscraftor.com", "one URL in production");
  assert.equal(metaReturnBaseUrl({ BETTER_AUTH_URL: "  ", RADAR_APP_URL: "https://app.presscraftor.com" }), "https://app.presscraftor.com");
  assert.equal(metaReturnBaseUrl({}), undefined);
  assert.equal(metaReturnBaseUrl({ BETTER_AUTH_URL: "not a url" }), undefined);
});
