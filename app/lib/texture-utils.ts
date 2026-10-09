import type { TextureSlot } from "./types";

const MAX_TEXTURE_SIZE = 2048;
/** Reject oversized uploads before they are decoded into memory. */
const MAX_TEXTURE_FILE_BYTES = 20 * 1024 * 1024;
const SUPPORTED_FORMATS = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/bmp",
  "image/gif",
];

/**
 * Returns the MIME type to pass to canvas.toDataURL for a given input format.
 * Canvas cannot encode HEIC/HEIF/BMP/GIF output, so these fall back to JPEG.
 */
function getCanvasOutputFormat(inputMimeType: string): string {
  const fallbackToJpeg = ["image/heic", "image/heif", "image/bmp", "image/gif"];
  if (fallbackToJpeg.includes(inputMimeType)) return "image/jpeg";
  return inputMimeType;
}

/**
 * Loads an image file and converts it to Base64 format.
 * Oversized images are automatically resized to fit within MAX_TEXTURE_SIZE.
 * HEIC/HEIF/BMP/GIF are converted to JPEG on output.
 * @param file - The image file to load
 * @returns Promise containing base64Data, width, height, mimeType, and wasResized flag
 * @throws Error if file format is unsupported
 */
export async function loadImageToBase64(file: File): Promise<{
  base64: string;
  width: number;
  height: number;
  mimeType: string;
  wasResized: boolean;
}> {
  // Validate file format
  if (!SUPPORTED_FORMATS.includes(file.type)) {
    throw new Error(
      `Unsupported image format: ${file.type}. Supported formats: PNG, JPEG, WEBP, HEIC/HEIF, BMP, GIF`
    );
  }

  if (file.size > MAX_TEXTURE_FILE_BYTES) {
    throw new Error(
      `Image is too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum size is ${MAX_TEXTURE_FILE_BYTES / 1024 / 1024} MB.`
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas 2D context"));
          return;
        }

        ctx.drawImage(img, 0, 0);

        // Auto-resize if image does not fit inside MAX_TEXTURE_SIZE (preserve aspect ratio)
        const finalCanvas = resizeImageIfNeeded(canvas);
        const outputMimeType = getCanvasOutputFormat(file.type);
        const base64 = finalCanvas.toDataURL(outputMimeType, 0.9);

        resolve({
          base64,
          width: finalCanvas.width,
          height: finalCanvas.height,
          mimeType: outputMimeType,
          wasResized: finalCanvas.width !== img.naturalWidth || finalCanvas.height !== img.naturalHeight,
        });
      };

      img.onerror = () => {
        reject(new Error("Failed to load image"));
      };

      img.src = event.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Validates if texture resolution is within acceptable limits
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns true if resolution is valid, false otherwise
 */
export function validateTextureResolution(width: number, height: number): boolean {
  return width > 0 && height > 0 && width <= MAX_TEXTURE_SIZE && height <= MAX_TEXTURE_SIZE;
}

/**
 * Resizes an image so both width and height fit within a maxSize×maxSize box (aspect ratio preserved).
 * @param canvas - Canvas element containing the image
 * @param maxSize - Maximum allowed width and height (bounding box)
 * @returns New canvas with resized image or original if already within limits
 */
export function resizeImageIfNeeded(
  canvas: HTMLCanvasElement,
  maxSize: number = MAX_TEXTURE_SIZE
): HTMLCanvasElement {
  if (canvas.width <= maxSize && canvas.height <= maxSize) {
    return canvas;
  }

  const scale = Math.min(maxSize / canvas.width, maxSize / canvas.height);
  const newWidth = Math.max(1, Math.floor(canvas.width * scale));
  const newHeight = Math.max(1, Math.floor(canvas.height * scale));

  const resizedCanvas = document.createElement("canvas");
  resizedCanvas.width = newWidth;
  resizedCanvas.height = newHeight;

  const ctx = resizedCanvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas 2D context for resizing");
  }

  ctx.drawImage(canvas, 0, 0, newWidth, newHeight);
  return resizedCanvas;
}

/**
 * Converts a TextureSlot's Base64 data to a WebGL texture
 * @param gl - WebGL rendering context
 * @param slot - TextureSlot containing base64 image data
 * @returns Promise<WebGLTexture | null> - Resolves when texture is fully loaded
 */
export function textureSlotToWebGLTexture(
  gl: WebGLRenderingContext,
  slot: TextureSlot
): Promise<WebGLTexture | null> {
  return new Promise((resolve) => {
    try {
      const texture = gl.createTexture();
      if (!texture) {
        console.error("Failed to create WebGL texture");
        resolve(null);
        return;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);

      // Set default texture (1x1 white pixel) while loading
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([255, 255, 255, 255])
      );

      // Create image from base64
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // Flip Y so UV (0,0) = bottom-left, matching WebGL/GLSL convention
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          img
        );
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

        // WebGL 1.0: NPOT (non-power-of-two) textures require CLAMP_TO_EDGE and
        // LINEAR (no mipmap). Only POT textures support REPEAT and generateMipmap.
        const isPOT = (n: number) => n > 0 && (n & (n - 1)) === 0;
        if (isPOT(img.naturalWidth) && isPOT(img.naturalHeight)) {
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
          gl.generateMipmap(gl.TEXTURE_2D);
        } else {
          // NPOT: must use CLAMP_TO_EDGE and no mipmap
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }

        resolve(texture);
      };

      img.onerror = () => {
        console.error("Failed to load image for WebGL texture:", slot.name);
        resolve(texture); // Return texture with placeholder
      };

      // Start loading
      img.src = slot.base64Data;
    } catch (e) {
      console.error("Error creating WebGL texture:", e);
      resolve(null);
    }
  });
}

/**
 * Gets the maximum texture size supported by the device
 * @param gl - WebGL rendering context
 * @returns Maximum texture size in pixels
 */
export function getMaxTextureSize(gl: WebGLRenderingContext): number {
  return gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function createWebGPUSampler(device: GPUDevice, width: number, height: number): GPUSampler {
  const pot = isPowerOfTwo(width) && isPowerOfTwo(height);
  return device.createSampler({
    magFilter: "linear",
    minFilter: pot ? "linear" : "linear",
    mipmapFilter: pot ? "linear" : undefined,
    addressModeU: pot ? "repeat" : "clamp-to-edge",
    addressModeV: pot ? "repeat" : "clamp-to-edge",
  });
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode texture image"));
    img.src = dataUrl;
  });
}

export interface WebGPUTextureBinding {
  texture: GPUTexture;
  view: GPUTextureView;
  sampler: GPUSampler;
  uploadedAt: number;
}

/** 1×1 white fallback when a channel has no upload or decode fails. */
export function createWebGPUPlaceholderTexture(device: GPUDevice): WebGPUTextureBinding {
  const texture = device.createTexture({
    size: [1, 1],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    new Uint8Array([255, 255, 255, 255]),
    { bytesPerRow: 4 },
    [1, 1],
  );
  return {
    texture,
    view: texture.createView(),
    sampler: createWebGPUSampler(device, 1, 1),
    uploadedAt: -1,
  };
}

/**
 * Upload a TextureSlot image to the GPU for WebGPU sampling.
 * Falls back to a 1×1 white texture on failure.
 */
export async function textureSlotToWebGPUTexture(
  device: GPUDevice,
  slot: TextureSlot,
): Promise<WebGPUTextureBinding> {
  try {
    const img = await loadImageFromDataUrl(slot.base64Data);
    const width = img.naturalWidth;
    const height = img.naturalHeight;

    const texture = device.createTexture({
      size: [width, height],
      format: "rgba8unorm",
      // copyExternalImageToTexture requires the destination to also carry
      // RENDER_ATTACHMENT usage, otherwise WebGPU aborts with "Destination
      // texture needs to have CopyDst and RenderAttachment usage".
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source: img, flipY: true },
      { texture },
      [width, height],
    );

    return {
      texture,
      view: texture.createView(),
      sampler: createWebGPUSampler(device, width, height),
      uploadedAt: slot.uploadedAt,
    };
  } catch (e) {
    console.error("Error creating WebGPU texture:", slot.name, e);
    const placeholder = createWebGPUPlaceholderTexture(device);
    return { ...placeholder, uploadedAt: slot.uploadedAt };
  }
}
