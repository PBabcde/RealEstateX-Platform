import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { parse } from "yaml";
import source from "../../../../lib/api-spec/openapi.yaml";

const router = Router();
const specification = parse(source);

router.get("/openapi.json", (_req, res) => {
  res.json(specification);
});
router.use("/docs", swaggerUi.serve, swaggerUi.setup(specification, {
  customSiteTitle: "RealEstateX API",
  swaggerOptions: { persistAuthorization: false },
}));

export default router;
