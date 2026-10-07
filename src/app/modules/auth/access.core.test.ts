import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasRole,
  isAuthRequired,
  isBootstrapOwner,
  isWorkspaceRole,
  parseBootstrapEmails,
  safeReturnPath,
  strongestRole,
} from "./access.core";

describe("workspace roles", () => {
  it("recognizes only the four roles", () => {
    for (const role of ["owner", "admin", "editor", "viewer"]) assert.equal(isWorkspaceRole(role), true);
    for (const value of ["staff", "Owner", "", undefined, 1]) assert.equal(isWorkspaceRole(value), false);
  });

  it("ranks owner > admin > editor > viewer", () => {
    assert.equal(hasRole("owner", "admin"), true);
    assert.equal(hasRole("editor", "editor"), true);
    assert.equal(hasRole("viewer", "editor"), false);
    assert.equal(hasRole("admin", "owner"), false);
    assert.equal(hasRole(undefined, "viewer"), false);
  });

  it("picks the strongest role", () => {
    assert.equal(strongestRole(["viewer", "admin", "editor"]), "admin");
    assert.equal(strongestRole([]), undefined);
  });
});

describe("AUTH_REQUIRED", () => {
  it("is on only for true", () => {
    assert.equal(isAuthRequired("true"), true);
    assert.equal(isAuthRequired(" TRUE "), true);
    for (const value of [undefined, "", "1", "yes", "false"]) assert.equal(isAuthRequired(value), false);
  });
});

describe("bootstrap owners", () => {
  it("parses separated, lowercased, valid emails", () => {
    const emails = parseBootstrapEmails(" A@Example.com, b@example.org;c@x.io\nnot-an-email ");
    assert.deepEqual([...emails].sort(), ["a@example.com", "b@example.org", "c@x.io"]);
    assert.equal(parseBootstrapEmails(undefined).size, 0);
  });

  it("requires a verified email on the list", () => {
    const list = parseBootstrapEmails("owner@example.com");
    assert.equal(isBootstrapOwner({ email: "Owner@Example.com", emailVerified: true }, list), true);
    assert.equal(isBootstrapOwner({ email: "owner@example.com", emailVerified: false }, list), false);
    assert.equal(isBootstrapOwner({ email: "other@example.com", emailVerified: true }, list), false);
  });
});

describe("safeReturnPath", () => {
  it("keeps same-origin paths", () => {
    assert.equal(safeReturnPath("/topics/a/stories/b?x=1"), "/topics/a/stories/b?x=1");
    assert.equal(safeReturnPath(["/help", "/other"]), "/help");
  });

  it("rejects other origins and odd values", () => {
    for (const value of [undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "help"]) {
      assert.equal(safeReturnPath(value), "/");
    }
  });
});
