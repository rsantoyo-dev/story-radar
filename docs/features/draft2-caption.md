# Draft 2 · Steps 9 and 10: Caption and Publish

Implementation brief. Written for an engineer (or agent) with access to this
repository and no memory of the conversations that produced the Draft 2
pipeline. Read AGENTS.md first, then the other Draft 2 briefs
(`docs/features/draft2-*.md`, the images' above all), then this document.

## 1. Goal

Write the post's text for the finished carousel, tag the Instagram accounts
the editor confirmed and no other, then publish the carousel through v1's
publication to the Topic's Facebook Page, its Instagram account or both.

```text
Facts → Focus → Opening → Closing → Deck → People and places → Visual script → Images → Caption → Publish
```

## 2. Decisions taken with the editor (2026-10-10)

| Question | Decision |
| --- | --- |
| Where the caption is written | a new step after Images, not inside the deck: it reads the finished carousel |
| Rounds | 2 (three captions and Sol's proposal, then the best revised beside Sol's as written and as edited) |
| Mentions | every account Instagram verified and the editor confirmed is tagged once, and no other @handle (since 2026-10-11: under a rule that only allowed tagging, the writer tagged none in the first two sessions with confirmed accounts) |
| Publishing | v1's publication, reused: its immutable package, queue, retries and permalinks |
| Format | short lines and blank lines kept (v1 collapses them), the brand's emojis, 5 to 8 hashtags at the end |

## 3. Accounts to tag (`draft2-mentions.ts`)

A model never decides a handle.

1. **Find** (`POST /api/radar/draft2/mentions`, one Claude call,
   `mention-finder`, medium effort): Claude proposes up to 12 usernames, at
   most 2 per entity, for the inventory's people, places and organizations.
   A person the story only mentions is never asked about.
2. **Check:** the program asks Instagram about each username through
   Business Discovery (`fetchInstagramBusinessDiscovery`,
   `meta-graph-client.ts`):
   - with the Topic's Facebook Page token and its linked Instagram account
     (`getChannelSendCredentials(topicId, "instagram-page")`), on
     graph.facebook.com;
   - read-only: `business_discovery.username(x){username,name,followers_count,website}`;
   - only professional (business or creator) accounts answer; a personal
     account or no account is "not found" (code 110, subcode 2207013);
   - the first other refusal (a permission, an expired token) stops the
     lookups: the rest are "not checked".
   - Without a linked Instagram account nothing is checked, and nothing can
     be tagged.
3. **Decide** (`PATCH`, no model call): the editor tags a verified account
   (`confirm`), says it is not them (`reject`), takes a decision back
   (`reopen`), or adds an account of their own (`add`, checked at once).
   - Instagram's name is compared with the entity's (`mentionMatch`): a
     weak match asks the editor to check it is them.
   - Every search and decision adds one to `mentions.version`.
   - A new search keeps every decision and every account the editor added;
     only Claude's undecided candidates are proposed and checked again.
4. Only confirmed accounts reach the caption (`confirmedMentions`), by
   Instagram's own username.

On Facebook an @username stays plain text: v1 posts the same text to both
channels.

## 4. The caption (`draft2-caption.ts`, the shared funnel)

- **Plan** (`CAPTION_PLAN`): round 1 writes 3 captions, Sol scores them and
  proposes 1; round 2 revises the best and edits Sol's, which also competes
  as Sol wrote it. Accepted at 95 with no criterion below 85.
- **Criteria:** hook, scan, grounding, voice, action, hashtags, fit
  (`skills/captions.ts`, v1's `CAPTION_STYLE_INSTRUCTION` rules with Draft 2's
  differences).
- **What it writes for** (`captionTarget`, recorded on the run):
  - the images run, once every slide is settled and shows an image, from a
    visual script still in the session;
  - the carousel's words and the focus of that visual script;
  - the confirmed accounts (and the mentions version they came from);
  - the credits the shown images owe (`captionCredits`, as v1 owes them in
    `batchPhotoCredits`): a photo pasted unchanged, a Commons story photo
    the model adapted, a verified place photo it received. An editor's own
    upload owes none; a map carries its attribution on its card.
- **Rules** (`captionRules`, from the Topic's creative profile): the emoji
  allowance (`allowEmojis`, `maxEmojis`), the call-to-action style, the
  closing's call to action, none on a grave story.
- **Program findings** (any one keeps a caption from winning):
  `FACT_UNKNOWN`, `NO_FACTS`, `UNSUPPORTED_NUMBER`; `TEXT_TOO_LONG` (the
  whole post with credits and hashtags over 2,200); `TOO_MANY_EMOJIS`;
  `HASHTAG_COUNT` (5 to 8), `HASHTAG_FORMAT`, `HASHTAG_IN_TEXT`;
  `UNVERIFIED_MENTION` (an @handle not confirmed; a period after it ends the
  sentence); `MENTION_MISSING` (an account the editor confirmed that the
  caption does not tag; a confirmed account is a decision to tag it, so a
  caption without it cannot win and the writer sees the finding in the next
  round); `NARRATES_CAROUSEL` ("swipe", "in this carousel"…);
  `NO_SPACING` (over 240 characters with no blank line); `CREDIT_IN_TEXT`;
  `DUPLICATE_CANDIDATE`.
- **The post** (`captionPostText`): the text with its line breaks, a blank
  line, the credits one per line, a blank line, the hashtags.
- **Credits shown or left out** (since 2026-10-13): the editor may leave the
  photo credits out of the post, at their own responsibility (the photos'
  licenses may ask for them): `caption.creditsHidden`, set by
  `recordCaptionCredits` with no provider call, refused while a run writes,
  and carried to the next run. `shownCredits` gives the credits the post
  shows (none when hidden) to the canvas's preview and to the publication
  target, so an approval made with the credits no longer matches the post.
  The caption is still written to fit with its credits, so showing them
  again never makes the post too long.
- **Continue:** a paused or stopped run continues only while the images run
  and the confirmed accounts are the ones it wrote for. A decision on an
  account that is not tagged changes nothing (`sameMentions` compares the
  tagged accounts, not the version).

## 5. Publish (`draft2-publication.ts`)

1. **What can be approved** (`publicationTarget`, pure, also read by the
   canvas): every slide shows a finished image; 2 to 10 slides (v1's carousel
   limits); the caption's run finished with a chosen version, written for
   these images and these tagged accounts.
   - Images the review did not pass are listed ("corrected and not
     reviewed again", the review's issues, "not reviewed"); approving them
     takes the editor's explicit acknowledgement (`acknowledgeIssues`).
2. **Approve** (`POST /api/radar/draft2/publication`, no provider call):
   the carousel is copied once into v1's rows:
   - a brief and a draft (`provider: "draft2"`, `promptVersion:
     "draft2-publication-v1"`, no usage), the draft's caption being the text
     and its credits, its hashtags with the #;
   - a completed batch, one asset per slide, each with
     `unitSnapshot.draft2Image` (session, run, slide, version, sha256) and
     its file URL on Draft 2's private image route;
   - the draft and every asset approved in one statement (as the
     documentary pipeline approves its batches).
   - The approval is idempotent on a snapshot hash of the images run, each
     slide's version and hash, the caption and the hashtags: approving the
     same carousel again returns the same copy, while v1 still holds it as
     approved. A change of the Topic's visual policy retires approvals
     (`creative-visual-policy-invalidation.ts`); approving again then copies
     the same carousel once more (the canvas offers it under the publish
     actions).
   - `session.publication` names the copy (`draftId`, `batchId`), the
     slides, the exact post text and what the editor acknowledged.
3. **Publish:** the canvas embeds v1's `RunPublishActions` (one confirmation
   for the Page, its Instagram account or both, "Publish everywhere") and,
   in a details panel, `PublicationChannelsPanel` (each channel's checks,
   the exact post, orders and retries). They freeze the immutable package
   (`freezePublicationPackage`) and create one job per channel; nothing is
   published until the editor confirms the exact post.
4. **Changed since:** when the images, a slide's version or the post's text
   change after approval, the canvas says so and offers "Approve it again".
   The earlier copy and anything published from it stay as they are.

### v1 compatibility boundary

v1 learns one provider, `draft2`, in these places only:

- `findLatestCreativeBrief`, `findCreativeDraftsForStory`: never listed in
  the Studio or daily preparation (like `documentary`);
- `computeBrandReferenceSelectionByOrder`: no brand references;
- `approveSavedCreativeDraft`, `requireCreativeDraft`: refused, "change it
  in its Draft 2 canvas";
- `getPublicationCandidate`: no workspace check and no photo credits (the
  caption carries them); its image read and `freezePublicationPackage`'s go
  through `readDraft2PublicationImage`, which reads the slide from Draft 2's
  storage and refuses it unless its hash is the one approved.

v1's candidate checks apply unchanged: the draft and every image approved,
1080×1350 static images, the post within Instagram's 2,200 characters and
30 hashtags, the destination connected with publishing access.

## 6. Persistence, API, canvas

- **Columns** (additive migration 0107): `draft2_sessions.mentions`,
  `draft2_sessions.caption`, `draft2_sessions.publication` (jsonb). The
  session's step takes `mentions`, `caption` and `publication`.
- **Routes:**
  - `POST /api/radar/draft2/mentions` `{ storyId, sessionId }`; `PATCH`
    `{ sessionId, action: "confirm" | "reject" | "reopen", accountId }` or
    `{ sessionId, action: "add", handle, name, entityId? }`;
  - `POST /api/radar/draft2/caption` `{ storyId, sessionId, continue? }`;
    `PATCH` `{ sessionId, candidateId }` or
    `{ sessionId, credits: "shown" | "hidden" }`;
  - `POST /api/radar/draft2/publication`
    `{ storyId, sessionId, acknowledgeIssues? }`.
- **Canvas, step 9:** the accounts to tag (find, tag, not them, untag, add
  one), the caption's rounds, and the chosen caption as the post will read
  (line breaks kept, credits, hashtags, characters out of 2,200); "Show the
  photo credits after the caption" (on by default; when off, the credits
  left out are listed); notices when the images or the tagged accounts
  changed since it was written.
- **Canvas, step 10:** the images in order and the post; the review's
  issues with the acknowledgement; "Approve for publishing"; then v1's
  publish actions and channel panels on the approved copy.

## 7. Tests

- `draft2-mentions.types.test.ts`: candidates, matching, carried decisions,
  the editor's contract, who can be tagged, `sameMentions`.
- `draft2-mentions.test.ts`: the search and the lookups, no Page, the first
  refusal, decisions and a new search, preconditions.
- `meta-business-discovery.test.ts`: the request, an unknown user against
  other refusals, malformed input.
- `draft2-caption.types.test.ts`: the text and the post, parsing, every
  program finding, the rules brief.
- `draft2-caption.test.ts`: the context and instructions, both rounds, an
  unconfirmed tag never winning, preconditions, continuing, credits, the
  editor's choice.
- `draft2-publication.types.test.ts` and `draft2-publication.test.ts`: what
  can be approved, the issues, the v1 copy, idempotency, acknowledgement,
  failed approvals, the image read and its hash check.

## 8. Not yet

- Scheduling a post: v1's jobs publish now; scheduling waits for the
  worker cron (see the Meta publishing direction).
- Instagram's own tag on the images (user tags) and collaborators: the
  caption's @mentions only.
- A carousel of more than 10 slides cannot be published as one post.

## 9. The source line (2026-10-14)

The post names where the story was reported ("Source : journaldemontreal.com")
after the caption and before the credits; the editor may leave it out per
post. See draft2-news-integrity.md.
