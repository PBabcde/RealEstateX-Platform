# Enterprise Core — Audit Trail Integrity

## Audit Trail Immutability & Hash-Chain Integrity

`audit_events` is append-only at both the database and application layers.

### PostgreSQL immutability trigger

Migration `0003_audit_append_only_chain.sql` creates the
`prevent_audit_events_mutation()` trigger function and attaches
`trg_enforce_audit_events_immutability` to `audit_events`.

The trigger runs `BEFORE UPDATE OR DELETE` and raises PostgreSQL
`RESTRICT_VIOLATION` with this message:

```text
UPDATE/DELETE operatie geweigerd: audit_events tabel is strikt append-only.
```

This protection remains active even when a caller bypasses the Express API and
connects directly to PostgreSQL.

### Append-only application logic

All PostgreSQL audit writers use inserts only. The shared append service:

- acquires a transaction-scoped PostgreSQL advisory lock;
- reads the last committed `sequence_id`;
- assigns the next sequential ID;
- stores the previous event hash;
- computes and stores the new event hash;
- inserts the row inside the caller's transaction.

Property, chat, and legacy-import audit paths use the same append service.
There is no application repository path that updates or deletes audit rows.

### Sequence and hash validation

`validateAuditHashChain()` reads events in `sequence_id` order and verifies:

1. IDs start at `1` and increase without gaps;
2. each `previous_hash` equals the preceding event's `event_hash`;
3. each `event_hash` matches the canonical event payload;
4. the chain is valid from the first event through the newest event.

Enterprise integrity checks include this validation. A broken sequence or hash
chain marks the integrity check as failed and moves the runtime into
`READ_ONLY`.

### Verification

Run the database-backed trigger test with:

```bash
pnpm --filter @workspace/scripts run test:audit-immutability
```

The test inserts an event, confirms that `UPDATE` and `DELETE` are rejected by
the database trigger, and rolls back the transaction so test data is not kept.