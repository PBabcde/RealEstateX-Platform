import {
  DEFAULT_TENANT_ID,
  pool,
  verifyAuditChainIntegrity,
} from "@workspace/db";

const tenantId = process.env.RELEASE_GATE_TENANT_ID ?? DEFAULT_TENANT_ID;

try {
  const result = await verifyAuditChainIntegrity(tenantId);
  if (!result.valid) {
    console.error(
      `Audit integrity gate failed for tenant ${result.tenantId} after validating ${result.eventCount} event(s).`,
    );
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `Audit integrity gate passed for tenant ${result.tenantId}; validated ${result.eventCount} event(s).`,
    );
  }
} catch (error) {
  console.error(
    "Audit integrity gate could not verify the target database:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}