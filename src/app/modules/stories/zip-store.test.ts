import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { crc32 } from "node:zlib";

import { zipStore } from "./zip-store";

/** Reads back every entry from the central directory, checking each local copy. */
function readZip(archive: Buffer): { name: string; data: Buffer }[] {
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  const count = archive.readUInt16LE(end + 10);
  let at = archive.readUInt32LE(end + 16);
  const entries: { name: string; data: Buffer }[] = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(archive.readUInt32LE(at), 0x02014b50);
    const size = archive.readUInt32LE(at + 20);
    const nameLength = archive.readUInt16LE(at + 28);
    const local = archive.readUInt32LE(at + 42);
    const name = archive.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    assert.equal(archive.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + archive.readUInt16LE(local + 26);
    const data = archive.subarray(start, start + size);
    assert.equal(crc32(data), archive.readUInt32LE(at + 16), `${name} keeps its checksum`);
    entries.push({ name, data });
    at += 46 + nameLength;
  }
  return entries;
}

test("an archive holds every slide in order, byte for byte", () => {
  const files = [
    { name: "slide-01.png", data: Buffer.from("first image bytes") },
    { name: "slide-02.png", data: Buffer.from([0, 1, 2, 3, 255]) },
    { name: "diapositive-é.png", data: Buffer.alloc(0) },
  ];
  const entries = readZip(zipStore(files));
  assert.deepEqual(entries.map((entry) => entry.name), files.map((file) => file.name));
  entries.forEach((entry, index) => assert.deepEqual(entry.data, Buffer.from(files[index]!.data)));
});

test("the system unzip tool accepts it, when one is installed", (context) => {
  let unzip = "";
  try { unzip = execFileSync("which", ["unzip"]).toString().trim(); } catch { /* not installed */ }
  if (!unzip) { context.skip("unzip is not installed"); return; }
  const directory = mkdtempSync(join(tmpdir(), "zip-store-"));
  try {
    const path = join(directory, "slides.zip");
    writeFileSync(path, zipStore([{ name: "slide-01.png", data: Buffer.from("hello") }]));
    execFileSync(unzip, ["-q", "-o", path, "-d", directory]);
    assert.equal(readFileSync(join(directory, "slide-01.png"), "utf8"), "hello");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
