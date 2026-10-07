import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSignInEmail, resendRequest } from "./auth-email.core";

const base = { from: "Press Craftor <login@example.com>", to: "user@example.com", expiresInMinutes: 15 };

describe("buildSignInEmail", () => {
  it("includes the link in text and escaped in html", () => {
    const email = buildSignInEmail({ ...base, url: "https://app.example.com/api/auth/magic-link/verify?token=a&b=\"c\"" });
    assert.equal(email.subject, "Your Press Craftor sign-in link");
    assert.match(email.text, /token=a&b=/u);
    assert.match(email.text, /15 minutes/u);
    assert.match(email.html, /token=a&amp;b=/u);
    assert.doesNotMatch(email.html, /b="c"/u);
  });

  it("escapes the app name", () => {
    const email = buildSignInEmail({ ...base, url: "https://app.example.com/x", appName: "<b>Brand</b>" });
    assert.doesNotMatch(email.html, /<b>Brand/u);
    assert.match(email.html, /&lt;b&gt;Brand/u);
  });

  it("refuses non-https links except localhost", () => {
    assert.throws(() => buildSignInEmail({ ...base, url: "http://app.example.com/x" }));
    assert.throws(() => buildSignInEmail({ ...base, url: "javascript:alert(1)" }));
    assert.doesNotThrow(() => buildSignInEmail({ ...base, url: "http://localhost:3000/x" }));
  });
});

describe("resendRequest", () => {
  it("posts JSON with a bearer token", () => {
    const email = buildSignInEmail({ ...base, url: "https://app.example.com/x" });
    const request = resendRequest("re_test", email);
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.equal(request.init.method, "POST");
    assert.deepEqual(request.init.headers, { Authorization: "Bearer re_test", "Content-Type": "application/json" });
    const body = JSON.parse(String(request.init.body));
    assert.deepEqual(body.to, ["user@example.com"]);
    assert.equal(body.from, base.from);
  });
});
