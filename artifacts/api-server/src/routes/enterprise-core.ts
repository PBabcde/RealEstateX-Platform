import { Router, type IRouter } from "express";
import {
  createIntegrityCheck,
  createRecoveryPoint,
  formatAuditEvent,
  getRecoveryState,
  getTrustMetadata,
  queryAuditEvents,
  setRecoveryMode,
} from "../lib/enterprise-core";
import {
  requireEnterpriseCoreOperator,
} from "../lib/enterprise-core-access";

const router: IRouter = Router();
const routeParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] ?? "" : value ?? "";

router.get(
  "/core/trust/:entityType/:entityId",
  requireEnterpriseCoreOperator,
  async (req, res, next): Promise<void> => {
  try {
    const tenantId = req.enterpriseContext!.tenantId;
    const trust = await getTrustMetadata(
      tenantId,
      routeParam(req.params.entityType),
      routeParam(req.params.entityId),
    );
    if (!trust) {
      res.status(404).json({ error: "Trust metadata not found" });
      return;
    }
    res.json(trust);
  } catch (error) {
    next(error);
  }
  },
);

router.get(
  "/core/audit",
  requireEnterpriseCoreOperator,
  async (req, res, next): Promise<void> => {
  try {
    const tenantId = req.enterpriseContext!.tenantId;
    const parseDate = (value: unknown): Date | undefined => {
      if (typeof value !== "string" || !value) return undefined;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid date filter: ${value}`);
      }
      return date;
    };
    const events = await queryAuditEvents({
      tenantId,
      actorId: typeof req.query.actorId === "string" ? req.query.actorId : undefined,
      entityType:
        typeof req.query.entityType === "string" ? req.query.entityType : undefined,
      entityId: typeof req.query.entityId === "string" ? req.query.entityId : undefined,
      from: parseDate(req.query.from),
      to: parseDate(req.query.to),
    });
    res.json(events.map(formatAuditEvent));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid date filter")) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
  },
);

router.get("/core/recovery/status", async (req, res, next): Promise<void> => {
  try {
    res.json(await getRecoveryState(req.enterpriseContext!.tenantId));
  } catch (error) {
    next(error);
  }
});

router.post(
  "/core/recovery/integrity-check",
  requireEnterpriseCoreOperator,
  async (req, res, next): Promise<void> => {
  try {
    const tenantId = req.enterpriseContext!.tenantId;
    const expectedChecksum =
      typeof req.body?.expectedChecksum === "string"
        ? req.body.expectedChecksum
        : undefined;
    res.json(await createIntegrityCheck(tenantId, expectedChecksum));
  } catch (error) {
    next(error);
  }
  },
);

router.post(
  "/core/recovery/points",
  requireEnterpriseCoreOperator,
  async (req, res, next): Promise<void> => {
  try {
    const tenantId = req.enterpriseContext!.tenantId;
    const kind = req.body?.kind;
    if (kind !== "BACKUP" && kind !== "ROLLBACK") {
      res.status(400).json({ error: "kind must be BACKUP or ROLLBACK" });
      return;
    }
    res.status(201).json(
      await createRecoveryPoint({
        tenantId,
        kind,
        label: typeof req.body.label === "string" ? req.body.label : undefined,
        source: typeof req.body.source === "string" ? req.body.source : undefined,
        checksum:
          typeof req.body.checksum === "string" ? req.body.checksum : undefined,
        metadata:
          req.body.metadata && typeof req.body.metadata === "object"
            ? req.body.metadata
            : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
  },
);

router.post(
  "/core/recovery/mode",
  requireEnterpriseCoreOperator,
  async (req, res, next): Promise<void> => {
  try {
    const tenantId = req.enterpriseContext!.tenantId;
    const mode = req.body?.mode;
    if (mode !== "NORMAL" && mode !== "READ_ONLY" && mode !== "RECOVERY") {
      res.status(400).json({ error: "mode must be NORMAL, READ_ONLY, or RECOVERY" });
      return;
    }
    await setRecoveryMode(
      tenantId,
      mode,
      typeof req.body.reason === "string" ? req.body.reason : undefined,
    );
    res.json(await getRecoveryState(tenantId));
  } catch (error) {
    next(error);
  }
  },
);

export default router;