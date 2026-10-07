// Applies the R2 lifecycle rules for the retention classes.
//
//   npm run r2:lifecycle            show what would change (no writes)
//   npm run r2:lifecycle -- --apply write the rules to the bucket
//
// Reads CLOUDFLARE_R2_BUCKET, CLOUDFLARE_R2_ENDPOINT,
// CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY and
// CLOUDFLARE_R2_OBJECT_PREFIX from the environment or .env files. The access
// key needs permission to edit the bucket's lifecycle configuration.
// @next/env is CommonJS: Node ESM cannot import its named exports directly.
import nextEnv from "@next/env";
import {
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  describeLifecycleChanges,
  mergeLifecycleRules,
  normalizeObjectPrefix,
} from "./r2-lifecycle-rules.mjs";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const apply = process.argv.includes("--apply");
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is not configured.`);
    process.exit(2);
  }
  return value;
};

const bucket = required("CLOUDFLARE_R2_BUCKET");
const prefix = normalizeObjectPrefix(required("CLOUDFLARE_R2_OBJECT_PREFIX"));
const client = new S3Client({
  endpoint: required("CLOUDFLARE_R2_ENDPOINT"),
  region: "auto",
  credentials: {
    accessKeyId: required("CLOUDFLARE_R2_ACCESS_KEY_ID"),
    secretAccessKey: required("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
  },
});

async function currentRules() {
  try {
    const result = await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
    return result.Rules ?? [];
  } catch (error) {
    if (error?.name === "NoSuchLifecycleConfiguration") return [];
    throw error;
  }
}

const existing = await currentRules();
const changes = describeLifecycleChanges(existing, prefix);
console.log(`Bucket ${bucket}, prefix ${prefix}/`);
if (!changes.length) {
  console.log("Lifecycle rules are up to date.");
  process.exit(0);
}
console.log(changes.map((line) => `  ${line}`).join("\n"));
if (!apply) {
  console.log("\nDry run. Run `npm run r2:lifecycle -- --apply` to write these rules.");
  process.exit(0);
}

await client.send(new PutBucketLifecycleConfigurationCommand({
  Bucket: bucket,
  LifecycleConfiguration: { Rules: mergeLifecycleRules(existing, prefix) },
}));
const remaining = describeLifecycleChanges(await currentRules(), prefix);
if (remaining.length) {
  console.error("The bucket did not accept every rule:\n" + remaining.map((line) => `  ${line}`).join("\n"));
  process.exit(1);
}
console.log("Lifecycle rules applied.");
