import { MODULE_ID } from "./constants.js";

const AVATAR_CROP_OFFSET_BASE = 220;
const TOKEN_IMAGE_FORMAT = "image/webp";
const TOKEN_IMAGE_EXTENSION = "webp";
const TOKEN_IMAGE_QUALITY = 0.9;

function clampNumber(value, fallback, min, max) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(min, Math.min(max, numericValue));
}

function normalizeAssetPath(path) {
  const normalized = String(path || "").trim().replaceAll("\\", "/");
  if (!normalized) return "";
  return normalized;
}

function cacheBustedSource(path) {
  const source = normalizeAssetPath(path);
  if (!source) return "";
  return `${source}${source.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

async function loadImage(path) {
  const source = cacheBustedSource(path);
  if (!source) return null;

  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Avatar asset could not be loaded: ${path}`));
    image.src = source;
  });
}

function drawContainedImage(context, image, x, y, width, height, {
  scale = 1,
  offsetX = 0,
  offsetY = 0
} = {}) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (!imageWidth || !imageHeight || width <= 0 || height <= 0) return;

  const imageRatio = imageWidth / imageHeight;
  const targetRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;

  if (imageRatio > targetRatio) {
    drawHeight = width / imageRatio;
  } else {
    drawWidth = height * imageRatio;
  }

  drawWidth *= scale;
  drawHeight *= scale;

  context.drawImage(
    image,
    x + (width - drawWidth) / 2 + offsetX,
    y + (height - drawHeight) / 2 + offsetY,
    drawWidth,
    drawHeight
  );
}

function drawAvatarBackdrop(context, x, y, size) {
  const gradient = context.createLinearGradient(0, y, 0, y + size);
  gradient.addColorStop(0, "rgba(8, 20, 33, 0.44)");
  gradient.addColorStop(1, "rgba(8, 20, 33, 0.20)");
  context.fillStyle = gradient;
  context.fillRect(x, y, size, size);
}

function toBlob(canvas, type = TOKEN_IMAGE_FORMAT, quality = TOKEN_IMAGE_QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Avatar token image could not be encoded."));
    }, type, quality);
  });
}

async function ensureDataDirectory(path) {
  const segments = String(path || "").split("/").map((segment) => segment.trim()).filter(Boolean);
  let cursor = "";
  for (const segment of segments) {
    cursor = cursor ? `${cursor}/${segment}` : segment;
    try {
      await FilePicker.createDirectory("data", cursor);
    } catch (_error) {
      // Directory may already exist. Upload will surface real path failures.
    }
  }
}

export function getAvatarTokenBakeDirectory() {
  const worldId = String(game.world?.id || "").trim();
  return worldId ? `worlds/${worldId}/footlights/avatars/baked` : "";
}

export async function bakeAvatarTokenImage(avatar = {}, { maxSize = 450 } = {}) {
  const defaultImage = normalizeAssetPath(avatar.defaultImage);
  if (!defaultImage || !game.user?.isGM || typeof FilePicker === "undefined") return "";

  const targetSize = Math.round(clampNumber(maxSize, 450, 128, 2048));
  const directory = getAvatarTokenBakeDirectory();
  if (!directory) return "";

  const [baseImage, frameImage] = await Promise.all([
    loadImage(defaultImage),
    avatar.frameImage ? loadImage(avatar.frameImage) : Promise.resolve(null)
  ]);
  if (!baseImage) return "";

  const canvas = document.createElement("canvas");
  canvas.width = targetSize;
  canvas.height = targetSize;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Avatar token canvas could not be initialized.");

  context.clearRect(0, 0, targetSize, targetSize);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const useCircularCrop = Boolean(avatar.useCircularCrop);
  const showBackdrop = avatar.showBackdrop !== false;
  const cropScale = clampNumber(avatar.circularCropScale, 1, 0.7, 3);
  const frameFitScale = clampNumber(avatar.frameFitScale, 1, 0.6, 1.2);
  const stackSize = targetSize * frameFitScale;
  const stackX = (targetSize - stackSize) / 2;
  const stackY = (targetSize - stackSize) / 2;
  const cropOffsetX = (clampNumber(avatar.cropOffsetX, 0, -160, 160) / AVATAR_CROP_OFFSET_BASE) * stackSize;
  const cropOffsetY = (clampNumber(avatar.cropOffsetY, 0, -160, 160) / AVATAR_CROP_OFFSET_BASE) * stackSize;

  context.save();
  if (useCircularCrop) {
    context.beginPath();
    context.arc(targetSize / 2, targetSize / 2, stackSize / 2, 0, Math.PI * 2);
    context.clip();
  } else if (showBackdrop) {
    drawAvatarBackdrop(context, stackX, stackY, stackSize);
  }

  drawContainedImage(context, baseImage, stackX, stackY, stackSize, stackSize, {
    scale: useCircularCrop ? cropScale : 1,
    offsetX: cropOffsetX,
    offsetY: cropOffsetY
  });
  context.restore();

  if (frameImage) {
    drawContainedImage(context, frameImage, 0, 0, targetSize, targetSize);
  }

  await ensureDataDirectory(directory);
  const blob = await toBlob(canvas);
  const avatarSlug = String(avatar.id || foundry.utils.randomID()).replace(/[^a-z0-9_-]/gi, "_");
  const fileName = `${avatarSlug}-${Date.now()}.${TOKEN_IMAGE_EXTENSION}`;
  const file = new File([blob], fileName, { type: TOKEN_IMAGE_FORMAT });
  await FilePicker.upload("data", directory, file, { notify: false });
  return `${directory}/${fileName}`;
}
