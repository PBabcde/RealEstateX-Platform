import assert from "node:assert/strict";
import { after, test } from "node:test";
import express from "express";

let server;
after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("payment and checkout endpoints return 410 while billing status remains available", async () => {
  const paymentHoldRouter = (await import("../src/routes/payment-hold.ts")).default;
  const app = express();
  app.use("/api", paymentHoldRouter);
  app.get("/api/saas/billing/status", (_req, res) => {
    res.status(200).json({ status: "available" });
  });
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  for (const path of [
    "/saas/billing/checkout",
    "/saas/billing/portal",
    "/saas/billing/webhook",
    "/stripe/checkout",
    "/checkout",
    "/billing/portal",
  ]) {
    const response = await fetch(`${base}${path}`, { method: "POST" });
    assert.equal(response.status, 410, path);
    assert.deepEqual(await response.json(), {
      code: "PAYMENTS_ON_HOLD",
      error: "RealEstateX Pro payments are paused while the product is in beta.",
    });
  }

  const nonPostCheckout = await fetch(`${base}/saas/billing/checkout`);
  assert.equal(nonPostCheckout.status, 410);

  const status = await fetch(`${base}/saas/billing/status`);
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { status: "available" });
});
