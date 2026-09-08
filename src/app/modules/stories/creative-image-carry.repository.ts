import "server-only";
import { getTableColumns, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { creativeAssets, creativeAssetBatches } from "@/db/schema";

/** Called inside the draft-save transaction, after locking the draft.
 * Only metadata is copied. File URLs, reference hashes and image versions stay
 * identical; carriedFromAssetId retains the identity of the original result.
 */
export function carryImageBatchStatements(draftId: string, version: number, now: Date) {
  const columns = Object.values(getTableColumns(creativeAssets)).map(column => column.name);
  const batchColumns = Object.values(getTableColumns(creativeAssetBatches)).map(column => column.name);
  const names = (values: string[]) => sql.join(values.map(value => sql.identifier(value)), sql`, `);
  const batchValues = batchColumns.map(name => {
    switch (name) {
      case "id": return sql`gen_random_uuid()`;
      case "draft_version": return sql`${version + 1}`;
      case "status": return sql`'completed'::creative_asset_batch_status`;
      case "created_at": case "updated_at": case "completed_at": return sql`${now}`;
      default: return sql`b.${sql.identifier(name)}`;
    }
  });
  const assetValues = columns.map(name => {
    switch (name) {
      case "id": return sql`gen_random_uuid()`;
      case "batch_id": return sql`fresh.id`;
      case "status": return sql`'generated'::creative_asset_status`;
      case "request_id": case "approved_at": return sql`NULL`;
      case "created_at": case "updated_at": case "completed_at": return sql`${now}`;
      case "reference_snapshot": return sql`(CASE WHEN jsonb_typeof(a.reference_snapshot)='array'
        THEN jsonb_build_object('schema',1,'characters',a.reference_snapshot,'brand','[]'::jsonb)
        ELSE a.reference_snapshot END) || jsonb_build_object('carriedFromAssetId',
          COALESCE(a.reference_snapshot->>'carriedFromAssetId',a.id::text))`;
      default: return sql`a.${sql.identifier(name)}`;
    }
  });
  return [db.execute(sql`
    WITH source AS (
      SELECT b.* FROM creative_asset_batches b WHERE b.draft_id=${draftId}::uuid
        AND b.draft_version=${version} AND b.status<>'stale'
        AND (SELECT count(DISTINCT a.unit_order) FROM creative_assets a
          WHERE a.batch_id=b.id AND a.status IN ('generated','approved') AND a.image_url IS NOT NULL)=b.total_assets
      ORDER BY b.created_at DESC LIMIT 1
    ), fresh AS (
      INSERT INTO creative_asset_batches (${names(batchColumns)})
      SELECT ${sql.join(batchValues, sql`, `)} FROM source b RETURNING id
    )
    INSERT INTO creative_assets (${names(columns)})
    SELECT ${sql.join(assetValues, sql`, `)} FROM creative_assets a JOIN source b ON a.batch_id=b.id CROSS JOIN fresh
    WHERE a.status IN ('generated','approved') AND a.image_url IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM creative_assets n WHERE n.batch_id=a.batch_id AND n.unit_order=a.unit_order
        AND n.version>a.version AND n.status IN ('generated','approved') AND n.image_url IS NOT NULL)
  `)];
}
