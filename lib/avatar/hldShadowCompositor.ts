export function computeShadowWizardResolutionScale(
  displayW: number,
  displayH: number,
  previewW: number,
  previewH: number
): number {
  if (previewW <= 0 || previewH <= 0) return 1;
  const sx = displayW / previewW;
  const sy = displayH / previewH;
  return (sx + sy) / 2;
}

export interface ShadowWizardParams {
  shadowY?: number;
  shadowX?: number;
  shadowSkew?: number;
  shadowPerspective?: number;
  shadowOpacity?: number;
  shadowBlur?: number;
  horizontalBlur?: number;
  scale?: number;
}

export function buildShadowImageData(silhouetteImageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(silhouetteImageData.data);
  const shadowImageData =
    typeof ImageData === "undefined"
      ? ({ data, width: silhouetteImageData.width, height: silhouetteImageData.height } as ImageData)
      : new ImageData(data, silhouetteImageData.width, silhouetteImageData.height);

  for (let i = 0; i < shadowImageData.data.length; i += 4) {
    if (shadowImageData.data[i + 3] > 0) {
      shadowImageData.data[i] = 0;
      shadowImageData.data[i + 1] = 0;
      shadowImageData.data[i + 2] = 0;
    }
  }

  return shadowImageData;
}

export function hasOpaqueSilhouettePixels(imageData: ImageData): boolean {
  return imageData.data.some((value, index) => index % 4 === 3 && value > 0);
}

export class HldShadowCompositor {
  drawShadowOnly(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
    silhouetteImageData: ImageData,
    params: ShadowWizardParams = {}
  ): void {
    const {
      shadowY = 37,
      shadowX = 0,
      shadowSkew = 95,
      shadowPerspective = 50,
      shadowOpacity = 0.6,
      shadowBlur = 10,
      horizontalBlur = 0,
      scale = 1,
    } = params;

    const silhouetteCanvas = document.createElement("canvas");
    silhouetteCanvas.width = silhouetteImageData.width;
    silhouetteCanvas.height = silhouetteImageData.height;
    const silhouetteCtx = silhouetteCanvas.getContext("2d");
    if (!silhouetteCtx) return;
    silhouetteCtx.putImageData(buildShadowImageData(silhouetteImageData), 0, 0);

    const transformedCanvas = document.createElement("canvas");
    transformedCanvas.width = width;
    transformedCanvas.height = height;
    const transformedCtx = transformedCanvas.getContext("2d");
    if (!transformedCtx) return;
    transformedCtx.clearRect(0, 0, width, height);

    const verticalScale = 1 - shadowSkew / 100;
    const shadowHeight = silhouetteCanvas.height * verticalScale;

    for (let y = 0; y < silhouetteCanvas.height; y++) {
      const progress = y / silhouetteCanvas.height;
      const perspectiveScale = 1 - (shadowPerspective / 100) * (1 - progress);
      const scaledWidth = silhouetteCanvas.width * perspectiveScale;
      const offsetX = (silhouetteCanvas.width - scaledWidth) / 2;

      transformedCtx.drawImage(
        silhouetteCanvas,
        0,
        y,
        silhouetteCanvas.width,
        1,
        shadowX * scale + offsetX,
        y * verticalScale,
        scaledWidth,
        Math.ceil(verticalScale)
      );
    }

    const horizontalBlurCanvas = document.createElement("canvas");
    horizontalBlurCanvas.width = width;
    horizontalBlurCanvas.height = height;
    const horizontalBlurCtx = horizontalBlurCanvas.getContext("2d");
    if (!horizontalBlurCtx) return;

    if (horizontalBlur > 0) {
      const numPasses = 20;
      horizontalBlurCtx.globalAlpha = 1 / numPasses;
      const offsetStep = (horizontalBlur * scale) / (numPasses / 2);
      for (let i = 0; i < numPasses; i++) {
        const offsetX = (i - numPasses / 2) * offsetStep;
        horizontalBlurCtx.drawImage(transformedCanvas, offsetX, 0);
      }
    } else {
      horizontalBlurCtx.drawImage(transformedCanvas, 0, 0);
    }

    const gaussianBlurCanvas = document.createElement("canvas");
    gaussianBlurCanvas.width = width;
    gaussianBlurCanvas.height = height;
    const gaussianBlurCtx = gaussianBlurCanvas.getContext("2d");
    if (!gaussianBlurCtx) return;

    gaussianBlurCtx.filter = `blur(${shadowBlur * scale}px)`;
    gaussianBlurCtx.drawImage(horizontalBlurCanvas, 0, 0);

    ctx.globalAlpha = shadowOpacity;
    const finalShadowY = height - shadowHeight - shadowY * scale;
    ctx.drawImage(gaussianBlurCanvas, shadowX * scale, finalShadowY);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
  }
}

export function extractSilhouetteFromWebGL(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  width: number,
  height: number,
  alphaThreshold = 60,
  useLuminance = false,
  lumaThreshold = 0.95
): ImageData {
  const raw = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);

  const flipped = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = y * width * 4;
    flipped.set(raw.subarray(srcRow, srcRow + width * 4), dstRow);
  }

  for (let i = 0; i < flipped.length; i += 4) {
    let isSubject: boolean;
    if (useLuminance) {
      const r = flipped[i] / 255;
      const g = flipped[i + 1] / 255;
      const b = flipped[i + 2] / 255;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      isSubject = luma < lumaThreshold;
    } else {
      isSubject = flipped[i + 3] > alphaThreshold;
    }
    flipped[i + 3] = isSubject ? 255 : 0;
  }

  return new ImageData(flipped, width, height);
}
