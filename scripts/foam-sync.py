#!/usr/bin/env python3
"""Sync the Foam story graph from the markdown kanban boards.

Source of truth for STATUS: docs/features/*.board.md
  (`shd101wyy.markdown-kanban` format: `#` board title, `##` columns,
   `- [ ] **ID** ... — title` cards). Drag cards there.

Source of truth for the story TEXT: the body of docs/stories/<ID>.md, below the
`<!-- body -->` marker. Hand-edit it freely; this script never touches it. On
first run it is seeded from docs/features/*.kanban.json if that legacy file is
still present, otherwise from the card title.

Run after moving cards:  python3 scripts/foam-sync.py
Regenerates: docs/stories/<ID>.md frontmatter+header, docs/stories/status-*.md,
docs/PROJECT.md, and the "## Historias (Foam)" index in each spec .md.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEATURES = {
    "instagram-performance": {"id": "FEAT-IG-001", "tag": "ig"},
    "real-place-visual-fidelity": {"id": "FEAT-GEO-001", "tag": "geo"},
}
# column heading (lowercased, matched by substring) -> (slug, label)
COLUMN_STATUS = [
    ("backlog", ("backlog", "🅱️ Backlog")),
    ("por hacer", ("todo", "⬜ Por hacer")),
    ("progreso", ("in-progress", "🔵 En progreso")),
    ("revisi", ("review", "🟡 En revisión / QA")),
    ("hecho", ("done", "✅ Hecho")),
]
STATUS_ORDER = ["review", "in-progress", "todo", "backlog", "done"]
BODY_MARKER = "<!-- body -->"
ID_RE = re.compile(r"\*\*((?:GEO|IG|BASE)-\d+)\*\*")
CARD_RE = re.compile(r"^\s*[-*]\s*\[[ xX]\]\s")


def label_for(slug):
    return next((lbl for (_n, (s, lbl)) in COLUMN_STATUS if s == slug), slug)


def status_for_heading(heading):
    h = heading.lower()
    for needle, val in COLUMN_STATUS:
        if needle in h:
            return val[0]
    return "todo"


def parse_board(path):
    """Return {ID: status_slug} from a markdown-kanban board file."""
    out = {}
    current = None
    for line in open(path, encoding="utf-8"):
        if line.startswith("## "):
            current = status_for_heading(line[3:].strip())
        elif current and CARD_RE.match(line):
            m = ID_RE.search(line)
            if m:
                out[m.group(1).upper()] = current
    return out


def prio(text):
    m = re.search(r"Prioridad:\*\*?\s*(P\d)", text or "")
    return m.group(1).lower() if m else None


def deps(text):
    m = re.search(r"Dependencias:\*\*?\s*([^\n·]+)", text or "")
    return [x.upper() for x in re.findall(r"(?:GEO|IG)-\d+", m.group(1))] if m else []


def legacy_text(spec):
    """{ID: full card text} from a still-present *.kanban.json, else {}."""
    path = os.path.join(ROOT, "docs/features", f"{spec}.kanban.json")
    if not os.path.exists(path):
        return {}
    board = json.load(open(path, encoding="utf-8"))
    return {t["id"].upper(): t["text"].strip()
            for c in board["cols"] for t in c["tasks"]}


def existing_body(story_path):
    if not os.path.exists(story_path):
        return None
    txt = open(story_path, encoding="utf-8").read()
    return txt.split(BODY_MARKER, 1)[1].lstrip("\n").rstrip() if BODY_MARKER in txt else None


def main():
    os.chdir(ROOT)
    os.makedirs("docs/stories", exist_ok=True)
    rows = []  # (ID, feature_id, slug, spec)
    per_spec_ids = {spec: [] for spec in FEATURES}

    for spec, meta in FEATURES.items():
        board_path = os.path.join("docs/features", f"{spec}.board.md")
        if not os.path.exists(board_path):
            print(f"skip: {board_path} missing")
            continue
        statuses = parse_board(board_path)
        seed = legacy_text(spec)
        for tid, slug in statuses.items():
            story_path = f"docs/stories/{tid}.md"
            body = existing_body(story_path)
            if body is None:
                body = seed.get(tid, f"**{tid}**\n\n_(añade la historia y sus criterios aquí)_")
            text_for_meta = body if body else seed.get(tid, "")
            p, d = prio(text_for_meta), [x for x in deps(text_for_meta) if x != tid]
            tags = [meta["tag"], slug] + ([p] if p else [])
            if tid.startswith("BASE"):
                tags.append("infra")
            fm = ["---", f"id: {tid}", f"feature: {meta['id']}", f"status: {slug}",
                  f"board: {spec}.board.md", f"tags: [{', '.join(tags)}]", "---", ""]
            head = [f"# {tid}", "",
                    f"**Estado:** [[status-{slug}]] · **Feature:** [[{spec}]] ({meta['id']})", ""]
            if d:
                head += ["**Depende de:** " + " · ".join(f"[[{x}]]" for x in d), ""]
            head += [BODY_MARKER, ""]
            open(story_path, "w", encoding="utf-8").write("\n".join(fm + head) + body.rstrip() + "\n")
            rows.append((tid, meta["id"], slug, spec))
            per_spec_ids[spec].append(tid)

    # status hub notes
    for slug in set(r[2] for r in rows) | set(STATUS_ORDER):
        items = sorted(r[0] for r in rows if r[2] == slug)
        open(f"docs/stories/status-{slug}.md", "w", encoding="utf-8").write(
            f"# {label_for(slug)}\n\nHistorias en este estado ({len(items)}): "
            + " · ".join(f"[[{i}]]" for i in items)
            + "\n\n> Ancla del grafo de Foam. Estado canónico: `docs/features/*.board.md`. "
            "Regenera con `python3 scripts/foam-sync.py`.\n")

    # project hub
    lines = ["# Proyecto — mapa de historias (Foam)", "",
             "Tablero por feature: `docs/features/*.board.md` (extensión **Markdown Kanban**, "
             "shd101wyy). Grafo: **Foam: Show Graph**. Regenera este índice con "
             "`python3 scripts/foam-sync.py`.", "", "## Features", ""]
    for spec, meta in FEATURES.items():
        lines.append(f"- [[{spec}]] — {meta['id']} · tablero `docs/features/{spec}.board.md`")
    lines += ["", "## Por estado", ""]
    for slug in STATUS_ORDER:
        ids = sorted(r[0] for r in rows if r[2] == slug)
        lines += [f"### [[status-{slug}]] — {label_for(slug)} ({len(ids)})", "",
                  " · ".join(f"[[{i}]]" for i in ids) if ids else "_(vacío)_", ""]
    lines += ["## Por feature", "", "| Feature | ✅ | 🟡 | 🔵 | ⬜ | 🅱️ |", "|---|---|---|---|---|---|"]
    for spec, meta in FEATURES.items():
        rs = [r for r in rows if r[1] == meta["id"]]
        c = {s: sum(1 for r in rs if r[2] == s) for s in STATUS_ORDER}
        lines.append(f"| {meta['id']} | {c['done']} | {c['review']} | {c['in-progress']} | {c['todo']} | {c['backlog']} |")
    lines.append("")
    open("docs/PROJECT.md", "w", encoding="utf-8").write("\n".join(lines))

    # refresh "## Historias (Foam)" index in each spec
    marker = "<!-- foam-stories -->"
    for spec in FEATURES:
        path = f"docs/features/{spec}.md"
        if not os.path.exists(path):
            continue
        content = open(path, encoding="utf-8").read().split(f"\n## Historias (Foam)\n{marker}")[0].rstrip()
        index = " · ".join(f"[[{i}]]" for i in sorted(per_spec_ids[spec]))
        open(path, "w", encoding="utf-8").write(f"{content}\n\n## Historias (Foam)\n{marker}\n\n{index}\n")

    print(f"{len(rows)} stories synced from *.board.md")
    for r in sorted(rows):
        print(f"  {r[0]:9} {r[2]}")


if __name__ == "__main__":
    main()
