// Read-only: every R2 key under one session's Draft 2 images, with sizes, beside the key the app computes for cover-v1.png of one run. An image that exists in the bucket but not under the configured CLOUDFLARE_R2_OBJECT_PREFIX was made by another environment (dev and production share the database, not the prefix).
import nextEnv from "@next/env";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { draft2ImageSegments, retentionObjectKey } from "../../src/app/modules/stories/r2-retention";
nextEnv.loadEnvConfig(process.cwd(), true);
const env = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} missing`); return value; };
const client = new S3Client({ region: "auto", endpoint: env("CLOUDFLARE_R2_ENDPOINT"), credentials: { accessKeyId: env("CLOUDFLARE_R2_ACCESS_KEY_ID"), secretAccessKey: env("CLOUDFLARE_R2_SECRET_ACCESS_KEY") } });
const bucket = env("CLOUDFLARE_R2_BUCKET");
const prefix = env("CLOUDFLARE_R2_OBJECT_PREFIX").replace(/^\/+|\/+$/g, "");
const [topicId, sessionId, runId] = process.argv.slice(2);
if (!topicId || !sessionId || !runId) throw new Error("usage: inspect-r2-run-keys.mts <topicId> <sessionId> <runId>");
const computed = retentionObjectKey(prefix, "180d", draft2ImageSegments({ topicId, sessionId, runId, file: "cover-v1.png" }));
console.log("computed:", computed);
const sessionPrefix = computed.slice(0, computed.indexOf(sessionId) + sessionId.length + 1);
console.log("listing under:", sessionPrefix);
let token: string | undefined; const keys: string[] = [];
do {
  const out = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: sessionPrefix, ContinuationToken: token, MaxKeys: 1000 }));
  for (const object of out.Contents ?? []) keys.push(`${(object.Key ?? "").slice(sessionPrefix.length)} (${object.Size} B, ${object.LastModified?.toISOString().slice(11, 16)})`);
  token = out.NextContinuationToken;
} while (token);
console.log(`${keys.length} objects:`);
for (const key of keys.sort()) console.log("  " + key);
