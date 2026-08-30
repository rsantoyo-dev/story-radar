import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRssItem } from "../sources/rss/normalize-rss-item";

test("normalizes nested XHTML Atom titles", () => {
  const item = normalizeRssItem(
    {
      title: {
        $: { type: "xhtml" },
        div: [
          {
            _: "Canada's balance of international payments, ",
            $: { xmlns: "http://www.w3.org/1999/xhtml" },
            span: [{ _: "second quarter 2026", $: { class: "refper" } }],
          },
        ],
      },
      link: "https://www.statcan.gc.ca/example",
      id: "statcan-example",
      isoDate: "2026-08-27T12:30:00.000Z",
      summary: "<div>Official release summary.</div>",
    },
    "auto",
  );

  assert.ok(item);
  assert.equal(
    item.title,
    "Canada's balance of international payments, second quarter 2026",
  );
  assert.equal(item.url, "https://www.statcan.gc.ca/example");
  assert.equal(item.publishedAt?.toISOString(), "2026-08-27T12:30:00.000Z");
});
