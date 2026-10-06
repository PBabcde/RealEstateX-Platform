import assert from "node:assert/strict";
import { after, test } from "node:test";
import express from "express";
import { randomUUID } from "node:crypto";

const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const imageDataUrl = `data:image/png;base64,${pngBytes.toString("base64")}`;
const generatedPng = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0,
]);

let server;
after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

function request(base, token, path, body) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      authorization: token,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("property image transformations authenticate, validate, and return concept images", async () => {
  const { createPropertyTransformationsRouter } = await import(
    "../src/routes/property-transformations.ts"
  );
  const validToken = `Bearer ${randomUUID()}`;
  const rateToken = `Bearer ${randomUUID()}`;
  const principalByToken = new Map([
    [validToken, { id: `transform-${randomUUID()}` }],
    [rateToken, { id: `rate-${randomUUID()}` }],
  ]);
  const prompts = [];
  let providerCalls = 0;

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use((req, _res, next) => {
    const principal = principalByToken.get(req.header("authorization"));
    if (principal) req.dbUser = principal;
    next();
  });
  app.use(
    createPropertyTransformationsRouter(async (image, mimeType, prompt) => {
      providerCalls += 1;
      assert.ok(Buffer.isBuffer(image));
      assert.equal(mimeType, "image/png");
      prompts.push(prompt);
      return generatedPng;
    }),
  );
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const unauthorized = await request(
    base,
    "Bearer missing",
    "/property-transformations/declutter",
    { imageDataUrl },
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(providerCalls, 0);

  const operations = [
    ["/property-transformations/declutter", { imageDataUrl }],
    ["/property-transformations/virtual-staging", { imageDataUrl, style: "japandi" }],
    ["/property-transformations/makeover", { imageDataUrl, style: "industrial" }],
    ["/property-transformations/day-to-dusk", { imageDataUrl }],
  ];
  for (const [path, body] of operations) {
    const response = await request(base, validToken, path, body);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    const result = await response.json();
    assert.equal(result.mimeType, "image/png");
    assert.equal(result.isConcept, true);
    assert.match(result.disclaimer, /concept/i);
    assert.ok(result.imageDataUrl.startsWith("data:image/png;base64,"));
  }
  assert.equal(providerCalls, operations.length);
  assert.ok(prompts.some((prompt) => prompt.includes("Japandi")));
  assert.ok(prompts.some((prompt) => prompt.includes("industrial")));
  assert.ok(prompts.some((prompt) => prompt.includes("blue-hour")));

  const malformed = await request(
    base,
    validToken,
    "/property-transformations/declutter",
    { imageDataUrl: "data:image/svg+xml;base64,PHN2Zy8+" },
  );
  assert.equal(malformed.status, 400);
  assert.equal(providerCalls, operations.length);

  const invalidStyle = await request(
    base,
    validToken,
    "/property-transformations/makeover",
    { imageDataUrl, style: "baroque" },
  );
  assert.equal(invalidStyle.status, 400);
  assert.equal(providerCalls, operations.length);

  for (let index = 0; index < 6; index += 1) {
    const response = await request(
      base,
      rateToken,
      "/property-transformations/declutter",
      { imageDataUrl },
    );
    assert.equal(response.status, 200);
  }
  const limited = await request(
    base,
    rateToken,
    "/property-transformations/declutter",
    { imageDataUrl },
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
});