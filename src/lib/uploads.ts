import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseDataUrl } from "./utils";

function hasSupabaseServerConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const imageTypes: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg"
};

export const MAX_MARKET_IMAGE_BYTES = 4_000_000;
export const MAX_MARKET_FORM_BYTES = 40_000_000;

function encodeObjectPath(objectPath: string) {
  return objectPath.split("/").map(encodeURIComponent).join("/");
}

export function assertRequestSize(request: Request, maxBytes: number) {
  const value = request.headers.get("content-length");
  const bytes = Number(value);
  if (!value || !Number.isFinite(bytes) || bytes < 0) {
    throw new Error("Upload request is missing a valid content length.");
  }
  if (bytes > maxBytes) {
    throw new Error("Upload request is too large.");
  }
}

function hasImageMagic(buffer: Buffer, mime: string) {
  if (mime === "image/png") {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mime === "image/jpeg" || mime === "image/jpg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === "image/webp") {
    return (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    );
  }
  return false;
}

async function uploadImageBuffer(input: {
  bucket: "avatars" | "market-images";
  localDir: "avatars" | "market-images";
  objectPath: string;
  mime: string;
  buffer: Buffer;
  maxBytes: number;
}) {
  const ext = imageTypes[input.mime];
  if (!ext) throw new Error("Upload must be a WebP, PNG, or JPEG image.");
  if (input.buffer.byteLength > input.maxBytes) throw new Error("Image is too large.");
  if (!hasImageMagic(input.buffer, input.mime)) throw new Error("Uploaded file does not match its image type.");
  const objectPath = input.objectPath.replace(/^\//, "");
  if (hasSupabaseServerConfig()) {
    const encoded = encodeObjectPath(objectPath);
    const endpoint = `${process.env.SUPABASE_URL}/storage/v1/object/${input.bucket}/${encoded}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        "Content-Type": input.mime,
        "x-upsert": "true"
      },
      body: input.buffer as unknown as BodyInit
    });
    if (!response.ok) throw new Error("Supabase image upload failed.");
    return `${process.env.SUPABASE_URL}/storage/v1/object/public/${input.bucket}/${encoded}`;
  }
  const uploadDir = path.join(process.cwd(), "public", "uploads", input.localDir);
  const destination = path.join(uploadDir, objectPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, input.buffer);
  return `/uploads/${input.localDir}/${objectPath}`;
}

export async function saveAvatarDataUrl(participantId: string, dataUrl: string) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error("Avatar must be an image.");
  const ext = imageTypes[parsed.mime];
  if (!ext) throw new Error("Avatar must be a WebP, PNG, or JPEG image.");
  const filename = `${participantId}.${ext}`;
  return uploadImageBuffer({
    bucket: "avatars",
    localDir: "avatars",
    objectPath: filename,
    mime: parsed.mime,
    buffer: parsed.buffer,
    maxBytes: 1_500_000
  });
}

export async function saveMarketImageFile(prefix: string, file: File) {
  if (!file || file.size <= 0) return undefined;
  const mime = file.type.toLowerCase();
  const ext = imageTypes[mime];
  if (!ext) throw new Error("Market images must be WebP, PNG, or JPEG files.");
  if (file.size > MAX_MARKET_IMAGE_BYTES) throw new Error("Market image is too large.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "market";
  return uploadImageBuffer({
    bucket: "market-images",
    localDir: "market-images",
    objectPath: `${safePrefix}-${randomUUID()}.${ext}`,
    mime,
    buffer,
    maxBytes: MAX_MARKET_IMAGE_BYTES
  });
}
