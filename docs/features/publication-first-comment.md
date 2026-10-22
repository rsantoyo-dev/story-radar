# The first comment

2026-10-22. Once a post is published, the publication's account posts the
first comment under it: the first interaction, written to get readers
talking. The editor asked for "una pregunta corta que abre a la
conversación, una opinión con pregunta, un ligero resumen, algo menos de 100
palabras".

## Written with the caption

Each caption the Caption step writes comes with its `comment`
(`draft2-caption.types.ts`, captions skill v4):

- One sentence that recaps the story lightly, the publication's own take in
  one sentence, and one short question the reader can answer from their own
  life, taste or neighbourhood. At most 95 words; about 40 to 80 is best.
- No hashtag, no @handle (it would notify the account), no link, no call to
  follow: the caption has the call to action.
- The caption's rules hold: the language and form of address, the emoji
  allowance, numbers only from the facts the caption cites, abbreviations
  spelled out (the caption above it counts as read).
- None on a grave story.

The program refuses a caption whose comment breaks these
(`COMMENT_MISSING`, `COMMENT_ON_GRAVE`, `COMMENT_TOO_LONG`,
`COMMENT_NO_QUESTION`, `COMMENT_TAGS`, and the caption's own codes with "In
the first comment"). The judge scores it as `conversation` (a score stored
before it passes on the criterion it predates) and may name a
`WEAK_QUESTION`.

The canvas shows the comment under each caption. The editor edits it by hand
(an empty comment posts none) or turns it off for the post ("Post the first
comment under the post once it is published"; `commentHidden`, kept for the
next run).

## Approved and frozen with the post

The comment is part of what the editor approves (`publicationTarget`,
`Draft2Publication.firstComment`): a changed or switched-off comment asks
for a new approval. v1's freeze reads it from the Draft 2 copy
(`draft2PublicationComment`, by the v1 draft the copy went into) and keeps it
in the package (`instagram_publication_packages.first_comment`, migration
0117). The package hash covers it only when there is one, so every package
without a comment keeps the hash it always had. The Publish confirmation
shows it.

## Posted once, after the post

The order carries the comment's state (`instagram_publication_jobs`:
`comment_status`, `comment_id`, `comment_error`, `comment_attempts`,
`commented_at`; `publication-first-comment.core.ts`):

- `pending` when the order opens with a comment; null when its package has
  none, as every order before 2026-10-22.
- As soon as the post is published, the same worker step posts the comment,
  on Instagram (`POST /{media-id}/comments`, through the Page) or on the
  Facebook Page post (`POST /{post-id}/comments`). A read of the order and
  each worker pass also pick up a comment still due.
- A send is recorded (`posting`) before it is made. When its answer is lost,
  the next attempt looks for the account's comment with this exact text on
  the post first (`findInstagramComment`, `findPageComment`) and only sends
  again when it is not there: a comment is never posted twice.
- A refusal goes back to `pending`, up to three sends. A permission refusal
  fails at once with what to grant. The account the post went to is the only
  one ever used; a reconnect that changes the connection's version but keeps
  the account is fine.
- The comment never touches the post: a post is published whatever happens
  to its comment. The Publish screen shows "First comment posted", "Posting
  the first comment…" or "First comment not posted: why", with "Try the
  comment again" (`retry-comment` on the publication order).

## Permissions

The brands publish through their Facebook Page, and the Page login uses the
app's Facebook Login configuration (`META_FACEBOOK_LOGIN_CONFIG_ID`): the
permissions are the configuration's.

- Facebook: `pages_manage_engagement`.
- Instagram through the Page: `instagram_manage_comments`.

Add both to the configuration in Meta's dashboard, then reconnect each
brand's Page in Channels. Until then, a comment fails with that message and
the post is unaffected. Without a configuration id, the login asks for them
itself (`FACEBOOK_PAGE_SCOPES`). The direct Instagram login is unused by the
brands and still asks for no comment permission
(`instagram_business_manage_comments`). Meta does not let an app pin a
comment; pin it by hand in the app if it should stay on top.
