import { Router, type IRouter } from "express";
import { attachEnterpriseContext } from "../lib/enterprise-core-access";
import {
  createId,
  deleteEntity,
  getEntity,
  listEntities,
  saveEntity,
  type CrmActivityRecord,
  type CrmContactRecord,
} from "../lib/enterprise-modules";
import { requireAuthentication } from "../middlewares/authorization";

const router: IRouter = Router();
router.use(requireAuthentication, attachEnterpriseContext);

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

function parseContact(
  body: Record<string, unknown>,
  actorId: string,
  existing?: CrmContactRecord,
): CrmContactRecord {
  const type = body.type ?? existing?.type ?? "PARTNER";
  const status = body.status ?? existing?.status ?? "ACTIVE";
  if (type !== "INVESTOR" && type !== "MAKELAAR" && type !== "PARTNER") {
    throw new Error("type must be INVESTOR, MAKELAAR or PARTNER.");
  }
  if (status !== "ACTIVE" && status !== "INACTIVE") {
    throw new Error("status must be ACTIVE or INACTIVE.");
  }
  const now = new Date().toISOString();
  return {
    contactId: existing?.contactId ?? createId(),
    type,
    name: requiredString(body.name ?? existing?.name, "name"),
    ...(typeof (body.email ?? existing?.email) === "string"
      ? { email: String(body.email ?? existing?.email).trim() }
      : {}),
    ...(typeof (body.phone ?? existing?.phone) === "string"
      ? { phone: String(body.phone ?? existing?.phone).trim() }
      : {}),
    ...(typeof (body.company ?? existing?.company) === "string"
      ? { company: String(body.company ?? existing?.company).trim() }
      : {}),
    status,
    ...(typeof (body.notes ?? existing?.notes) === "string"
      ? { notes: String(body.notes ?? existing?.notes).trim() }
      : {}),
    ownerId: existing?.ownerId ?? actorId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

router.get("/crm/contacts", async (req, res, next): Promise<void> => {
  try {
    res.json(await listEntities<CrmContactRecord>("crm-contact", req.enterpriseContext!.tenantId));
  } catch (error) {
    next(error);
  }
});

router.post("/crm/contacts", async (req, res, next): Promise<void> => {
  try {
    const context = req.enterpriseContext!;
    const contact = parseContact(req.body as Record<string, unknown>, context.actorId);
    res.status(201).json(
      await saveEntity("crm-contact", contact, context.tenantId, context.actorId, "created"),
    );
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.get("/crm/contacts/:contactId", async (req, res, next): Promise<void> => {
  try {
    const contact = await getEntity<CrmContactRecord>(
      "crm-contact",
      req.params.contactId,
      req.enterpriseContext!.tenantId,
    );
    if (!contact) {
      res.status(404).json({ error: "CRM contact not found" });
      return;
    }
    res.json(contact);
  } catch (error) {
    next(error);
  }
});

router.patch("/crm/contacts/:contactId", async (req, res, next): Promise<void> => {
  try {
    const context = req.enterpriseContext!;
    const existing = await getEntity<CrmContactRecord>("crm-contact", req.params.contactId, context.tenantId);
    if (!existing) {
      res.status(404).json({ error: "CRM contact not found" });
      return;
    }
    const contact = parseContact(req.body as Record<string, unknown>, context.actorId, existing);
    res.json(await saveEntity("crm-contact", contact, context.tenantId, context.actorId, "updated"));
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.delete("/crm/contacts/:contactId", async (req, res, next): Promise<void> => {
  try {
    const context = req.enterpriseContext!;
    if (!(await deleteEntity("crm-contact", req.params.contactId, context.tenantId, context.actorId))) {
      res.status(404).json({ error: "CRM contact not found" });
      return;
    }
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

function parseActivity(
  body: Record<string, unknown>,
  contactId: string,
  actorId: string,
): CrmActivityRecord {
  const kind = body.kind ?? "NOTE";
  if (kind !== "NOTE" && kind !== "CALL" && kind !== "EMAIL" && kind !== "MEETING") {
    throw new Error("kind must be NOTE, CALL, EMAIL or MEETING.");
  }
  if (typeof body.summary !== "string" || !body.summary.trim()) {
    throw new Error("summary is required.");
  }
  const occurredAt =
    typeof body.occurredAt === "string" && body.occurredAt.trim()
      ? body.occurredAt
      : new Date().toISOString();
  if (Number.isNaN(Date.parse(occurredAt))) {
    throw new Error("occurredAt must be a valid date-time.");
  }
  return {
    activityId: createId(),
    contactId,
    kind,
    summary: body.summary.trim(),
    occurredAt,
    actorId,
    ownerId: actorId,
    createdAt: new Date().toISOString(),
  };
}

router.get("/crm/contacts/:contactId/activities", async (req, res, next): Promise<void> => {
  try {
    const tenantId = req.enterpriseContext!.tenantId;
    const contact = await getEntity<CrmContactRecord>(
      "crm-contact",
      req.params.contactId,
      tenantId,
    );
    if (!contact) {
      res.status(404).json({ error: "CRM contact not found" });
      return;
    }
    const activities = await listEntities<CrmActivityRecord>("crm-activity", tenantId);
    res.json(
      activities
        .filter((activity) => activity.contactId === req.params.contactId)
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/crm/contacts/:contactId/activities", async (req, res, next): Promise<void> => {
  try {
    const context = req.enterpriseContext!;
    const contact = await getEntity<CrmContactRecord>(
      "crm-contact",
      req.params.contactId,
      context.tenantId,
    );
    if (!contact) {
      res.status(404).json({ error: "CRM contact not found" });
      return;
    }
    const activity = parseActivity(
      req.body as Record<string, unknown>,
      req.params.contactId,
      context.actorId,
    );
    res.status(201).json(
      await saveEntity(
        "crm-activity",
        activity,
        context.tenantId,
        context.actorId,
        "created",
      ),
    );
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

export default router;