import { Buffer } from "node:buffer";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ConvertPropertyImageToDuskBody,
  DeclutterPropertyImageBody,
  MakeoverPropertyImageBody,
  StagePropertyImageBody,
} from "@workspace/api-zod";
import { requireAuthentication } from "../middlewares/authorization";

type PropertyStyle = "japandi" | "modern" | "industrial";
type ImageMimeType = "image/jpeg" | "image/png";
type Transformation =
  | "declutter"
  | "virtual-staging"
  | "makeover"
  | "day-to-dusk";
type ImageInput = {
  imageDataUrl: string;
  style?: PropertyStyle;
};
type MakeoverInput = ImageInput & { style: PropertyStyle };
type SafeParse<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string } };
type InputSchema<T> = {
  safeParse(value: unknown): SafeParse<T>;
};
type ImageEditor = (
  image: Buffer,
  mimeType: ImageMimeType,
  prompt: string,
) => Promise<Buffer>;

const MAX_INPUT_IMAGE_BYTES = 640 * 1024;
const MAX_OUTPUT_IMAGE_BYTES = 12 * 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 6;
const DISCLAIMER =
  "AI-generated concept only. Verify dimensions, finishes, fixtures, permits, and legal requirements on site.";
const STYLE_PROMPTS: Record<PropertyStyle, string> = {
  japandi:
    "Use a restrained Japandi interior palette with natural oak, warm off-white, tactile linen, quiet organic forms, and uncluttered styling.",
  modern:
    "Use a clean contemporary modern interior with balanced proportions, refined materials, warm neutral colors, and understated furniture.",
  industrial:
    "Use a refined industrial interior with restrained black metal details, warm wood, honest textures, practical furniture, and controlled contrast.",
};

const rateWindow = new Map<string, { startedAt: number; count: number }>();

function consumeRateLimit(userId: string): boolean {
  const now = Date.now();
  const current = rateWindow.get(userId);
  if (current && now - current.startedAt < RATE_WINDOW_MS) {
    if (current.count >= RATE_LIMIT) return false;
    current.count += 1;
    return true;
  }

  rateWindow.set(userId, { startedAt: now, count: 1 });
  if (rateWindow.size > 1_000) {
    for (const [id, window] of rateWindow) {
      if (now - window.startedAt >= RATE_WINDOW_MS) rateWindow.delete(id);
    }
  }
  return true;
}

function decodeImageDataUrl(
  value: string,
): { image: Buffer; mimeType: ImageMimeType } | null {
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    value,
  );
  if (!match) return null;

  const mimeType = match[1] as ImageMimeType;
  const encoded = match[2];
  const image = Buffer.from(encoded, "base64");
  if (
    image.length === 0 ||
    image.length > MAX_INPUT_IMAGE_BYTES ||
    image.toString("base64") !== encoded
  ) {
    return null;
  }

  const isPng =
    mimeType === "image/png" &&
    image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg =
    mimeType === "image/jpeg" &&
    image[0] === 0xff &&
    image[1] === 0xd8 &&
    image[2] === 0xff;
  if (!isPng && !isJpeg) return null;

  return { image, mimeType };
}

function buildPrompt(
  transformation: Transformation,
  style?: PropertyStyle,
): string {
  const preserve =
    "Edit the supplied real-estate photograph as a photorealistic concept. Preserve its camera viewpoint, perspective, room dimensions, walls, ceiling, floor plan, doors, windows, and fixed architectural elements. Do not add or remove structural openings or walls. Keep the original composition and do not add text, logos, or watermarks. ";

  switch (transformation) {
    case "declutter":
      return (
        preserve +
        "Remove movable clutter and personal loose items only. Keep permanent fixtures and built-in elements unchanged; do not invent replacement architecture."
      );
    case "virtual-staging":
      return (
        preserve +
        `Virtually furnish and style the room with realistic, appropriately scaled pieces. ${STYLE_PROMPTS[style ?? "modern"]}`
      );
    case "makeover":
      return (
        preserve +
        `Create a visual interior makeover using finishes, colors, furniture, and decor consistent with this direction. ${STYLE_PROMPTS[style ?? "modern"]}`
      );
    case "day-to-dusk":
      return (
        preserve +
        "Convert daylight to a believable early-evening dusk scene with a deep blue-hour sky, warm practical interior lighting, and realistic exterior illumination. Keep the property and its surroundings recognizable and unchanged."
      );
  }
}

async function editWithOpenAI(
  image: Buffer,
  mimeType: ImageMimeType,
  prompt: string,
): Promise<Buffer> {
  const { editImageBuffer } = await import(
    "@workspace/integrations-openai-ai-server/image"
  );
  return editImageBuffer(image, mimeType, prompt);
}

async function runTransform<T extends ImageInput>(
  req: Request,
  res: Response,
  schema: InputSchema<T>,
  transformation: Transformation,
  editImage: ImageEditor,
): Promise<void> {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid image or style input." });
    return;
  }

  const decoded = decodeImageDataUrl(parsed.data.imageDataUrl);
  if (!decoded) {
    const dataUrl = parsed.data.imageDataUrl;
    const encoded = /^data:image\/(?:jpeg|png);base64,(.*)$/.exec(dataUrl)?.[1];
    if (encoded && Buffer.from(encoded, "base64").length > MAX_INPUT_IMAGE_BYTES) {
      res.status(413).json({ error: "Image must be 640 KB or smaller." });
      return;
    }
    res.status(400).json({ error: "Use a valid JPEG or PNG image." });
    return;
  }

  const userId = req.dbUser?.id;
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (!consumeRateLimit(userId)) {
    res.setHeader("Retry-After", "60");
    res
      .status(429)
      .json({ error: "Transformation limit reached. Try again in a minute." });
    return;
  }

  try {
    const image = await editImage(
      decoded.image,
      decoded.mimeType,
      buildPrompt(transformation, parsed.data.style),
    );
    const isPng =
      image.length >= 8 &&
      image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!isPng || image.length > MAX_OUTPUT_IMAGE_BYTES) {
      res.status(502).json({ error: "Image transformation returned invalid data." });
      return;
    }

    res.json({
      imageDataUrl: `data:image/png;base64,${image.toString("base64")}`,
      mimeType: "image/png",
      isConcept: true,
      disclaimer: DISCLAIMER,
    });
  } catch {
    res
      .status(502)
      .json({ error: "Image transformation is temporarily unavailable." });
  }
}

export function createPropertyTransformationsRouter(
  editImage: ImageEditor = editWithOpenAI,
): IRouter {
  const router: IRouter = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    next();
  });
  router.use(requireAuthentication);

  router.post("/property-transformations/declutter", async (req, res) => {
    await runTransform(
      req,
      res,
      DeclutterPropertyImageBody,
      "declutter",
      editImage,
    );
  });

  router.post("/property-transformations/virtual-staging", async (req, res) => {
    await runTransform(
      req,
      res,
      StagePropertyImageBody,
      "virtual-staging",
      editImage,
    );
  });

  router.post("/property-transformations/makeover", async (req, res) => {
    await runTransform(
      req,
      res,
      MakeoverPropertyImageBody as InputSchema<MakeoverInput>,
      "makeover",
      editImage,
    );
  });

  router.post("/property-transformations/day-to-dusk", async (req, res) => {
    await runTransform(
      req,
      res,
      ConvertPropertyImageToDuskBody,
      "day-to-dusk",
      editImage,
    );
  });

  return router;
}

export default createPropertyTransformationsRouter();