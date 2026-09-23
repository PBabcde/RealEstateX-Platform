import assert from "node:assert/strict";
import { after, test } from "node:test";
import { hashAuditEvent, requireDb } from "@workspace/db";

const { pool } = requireDb();

after(async () => {
  await pool.end();
});

test("audit_events is append-only and rejects UPDATE and DELETE", async () => {
  const client = await pool.connect();
  const eventId = "audit-immutability-integration-test";
  const action = "integration.audit_immutability_test";
  const entityType = "integration_test";
  const entityId = eventId;
  const actorId = "integration-test";
  const metadata = { purpose: "database-trigger-verification" };
  const createdAt = new Date();

  try {
    await client.query("BEGIN");
    const previousResult = await client.query(
      "SELECT sequence_id, event_hash FROM audit_events ORDER BY sequence_id DESC LIMIT 1",
    );
    const previous = previousResult.rows[0];
    const sequenceId = Number(previous?.sequence_id ?? 0) + 1;
    const previousHash = previous?.event_hash ?? null;
    const metadataResult = await client.query(
      "SELECT $1::jsonb::text AS metadata_text",
      [JSON.stringify(metadata)],
    );
    const metadataText = metadataResult.rows[0].metadata_text;
    const eventHash = hashAuditEvent({
      sequenceId,
      previousHash,
      action,
      entityType,
      entityId,
      actorId,
      metadataText,
      createdAt,
    });

    const insertResult = await client.query(
      `INSERT INTO audit_events
        (event_id, sequence_id, previous_hash, event_hash, action,
         entity_type, entity_id, actor_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
      [
        eventId,
        sequenceId,
        previousHash,
        eventHash,
        action,
        entityType,
        entityId,
        actorId,
        JSON.stringify(metadata),
        createdAt,
      ],
    );
    assert.equal(insertResult.rowCount, 1);

    await client.query("SAVEPOINT update_attempt");
    try {
      await assert.rejects(
        client.query(
          "UPDATE audit_events SET action = $1 WHERE event_id = $2",
          ["integration.audit_immutability_update_attempt", eventId],
        ),
        (error) =>
          error?.code === "23001" &&
          error?.message ===
            "UPDATE/DELETE operatie geweigerd: audit_events tabel is strikt append-only.",
      );
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT update_attempt");
      await client.query("RELEASE SAVEPOINT update_attempt");
    }

    await client.query("SAVEPOINT delete_attempt");
    try {
      await assert.rejects(
        client.query("DELETE FROM audit_events WHERE event_id = $1", [eventId]),
        (error) =>
          error?.code === "23001" &&
          error?.message ===
            "UPDATE/DELETE operatie geweigerd: audit_events tabel is strikt append-only.",
      );
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT delete_attempt");
      await client.query("RELEASE SAVEPOINT delete_attempt");
    }

    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});