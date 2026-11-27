import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { enterpriseRecoveryGuard } from "./lib/enterprise-core-middleware";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { resolveLocalUser } from "./middlewares/localUser";
import { attachEnterpriseContext } from "./lib/enterprise-core-access";
import { recordControlRoomError } from "./lib/control-room";
import paymentHoldRouter from "./routes/payment-hold";
import apiDocsRouter from "./routes/api-docs";
import { isIndependentAccessRequest } from "./lib/admin-access";

const app: Express = express();
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.disable("x-powered-by");
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use((req, res, next) => {
  // Browser POSTs may carry Origin even when frontend and API share a host.
  // Allow that host without requiring a redundant CORS_ORIGINS entry in Coolify.
  const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0]!.trim();
  const protocol = (req.get("x-forwarded-proto") ?? req.protocol).split(",")[0]!.trim();
  const sameOrigin = `${protocol}://${host}`;
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || origin === sameOrigin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      if (process.env.NODE_ENV !== "production" && allowedOrigins.length === 0) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed"));
    },
  })(req, res, next);
});
app.use("/api", paymentHoldRouter);
app.use("/api", apiDocsRouter);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "1mb" }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT ?? "1mb" }));
const authenticateWithClerk = clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  }));
app.use((req, res, next) => {
  if (isIndependentAccessRequest(req)) { next(); return; }
  authenticateWithClerk(req, res, next);
});
app.use((req, res, next) => {
  if (isIndependentAccessRequest(req)) { next(); return; }
  void resolveLocalUser(req, res, next);
});
app.use("/api/core", attachEnterpriseContext, enterpriseRecoveryGuard);

app.use("/api", router);

app.use(
  (
    error: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ): void => {
    if (
      error !== null &&
      typeof error === "object" &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      res.status(413).json({ error: "Request body is too large." });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    if (error instanceof Error && error.message === "Origin not allowed") {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    recordControlRoomError();
    req.log?.error({ err: error }, "Unhandled API error");
    res.status(500).json({ error: "Internal server error" });
  },
);

export default app;
