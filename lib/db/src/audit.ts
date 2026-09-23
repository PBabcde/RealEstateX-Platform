import { createHash } from "node:crypto";

type AuditHashInput = {
  sequenceId: number;
  previousHash: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  actorId: string | null;
  metadataText: string;
  createdAt: Date;
};

export function hashAuditEvent(input: AuditHashInput): string {
  return createHash("sha256")
    .update(
      [
        input.sequenceId,
        input.previousHash ?? "",
        input.action,
        input.entityType,
        input.entityId ?? "",
        input.actorId ?? "",
        input.metadataText,
        input.createdAt.toISOString(),
      ].join("|"),
    )
    .digest("hex");
}