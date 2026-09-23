import assert from "node:assert/strict";
import { after, test } from "node:test";
import { requireDb } from "@workspace/db";

const { pool } = requireDb();

after(async () => {
  await pool.end();
});

test("Enterprise Core records remain isolated by tenant_id", async () => {
  const client = await pool.connect();
  const tenantA = "00000000-0000-0000-0000-0000000000a1";
  const tenantB = "00000000-0000-0000-0000-0000000000b1";
  const entityType = "integration.tenant_isolation";
  const entityId = "same-entity-id";

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO tenants (id, name, is_personal)
       VALUES ($1, 'Tenant isolation A', true), ($2, 'Tenant isolation B', true)`,
      [tenantA, tenantB],
    );

    await client.query(
      `INSERT INTO audit_events
        (event_id, tenant_id, sequence_id, previous_hash, event_hash,
         action, entity_type, entity_id, actor_id, metadata)
       VALUES
        ('tenant-isolation-audit-a', $1, 1, NULL, 'hash-a',
         'integration.tenant_a', $3, $4, 'test', '{}'::jsonb),
        ('tenant-isolation-audit-b', $2, 1, NULL, 'hash-b',
         'integration.tenant_b', $3, $4, 'test', '{}'::jsonb)`,
      [tenantA, tenantB, entityType, entityId],
    );

    await client.query(
      `INSERT INTO trust_metadata
        (tenant_id, entity_type, entity_id, source_class, source_boundary)
       VALUES
        ($1, $3, $4, 'CANONICAL', 'tenant-a'),
        ($2, $3, $4, 'CANONICAL', 'tenant-b')`,
      [tenantA, tenantB, entityType, entityId],
    );

    const auditA = await client.query(
      "SELECT count(*)::int AS count FROM audit_events WHERE tenant_id = $1",
      [tenantA],
    );
    const auditB = await client.query(
      "SELECT count(*)::int AS count FROM audit_events WHERE tenant_id = $1",
      [tenantB],
    );
    const trustA = await client.query(
      "SELECT source_boundary FROM trust_metadata WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3",
      [tenantA, entityType, entityId],
    );
    const trustB = await client.query(
      "SELECT source_boundary FROM trust_metadata WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3",
      [tenantB, entityType, entityId],
    );

    assert.equal(auditA.rows[0].count, 1);
    assert.equal(auditB.rows[0].count, 1);
    assert.deepEqual(trustA.rows[0], { source_boundary: "tenant-a" });
    assert.deepEqual(trustB.rows[0], { source_boundary: "tenant-b" });

    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});