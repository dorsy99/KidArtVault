export interface Point {
  x: number;
  y: number;
}

/**
 * Solve an 8x8 linear system using Gaussian elimination with partial pivoting.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) {
        maxRow = row;
      }
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-10) continue;

    for (let j = col; j <= n; j++) M[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = col; j <= n; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }

  return M.map((row) => row[n]);
}

/**
 * Compute 3x3 homography matrix mapping destination (u,v) -> source (x,y).
 * Corners order: [top-left, top-right, bottom-right, bottom-left].
 */
export function computeHomography(src: [Point, Point, Point, Point], dstW: number, dstH: number): number[] {
  const dst: [Point, Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: dstW, y: 0 },
    { x: dstW, y: dstH },
    { x: 0, y: dstH },
  ];

  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const u = dst[i].x;
    const v = dst[i].y;
    const x = src[i].x;
    const y = src[i].y;
    A.push([u, v, 1, 0, 0, 0, -x * u, -x * v]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -y * u, -y * v]);
    b.push(y);
  }

  const h = solveLinearSystem(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Rotate an HTMLImageElement / Canvas by 0, 90, 180, 270 degrees into a new canvas.
 */
export function rotateToCanvas(img: HTMLImageElement, rotationDeg: number): HTMLCanvasElement {
  const norm = ((rotationDeg % 360) + 360) % 360;
  const swap = norm === 90 || norm === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;

  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((norm * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.restore();
  return canvas;
}

/**
 * Perform a 4-point perspective warp from `srcCanvas` using normalized corners (0..1)
 * and optionally apply gentle paper brightness/contrast enhancement.
 */
export function warpPerspective(
  srcCanvas: HTMLCanvasElement,
  normCorners: [Point, Point, Point, Point],
  autoEnhance: boolean,
  maxOutputDim = 2400,
): Promise<Blob> {
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;

  const srcPts: [Point, Point, Point, Point] = [
    { x: normCorners[0].x * sw, y: normCorners[0].y * sh },
    { x: normCorners[1].x * sw, y: normCorners[1].y * sh },
    { x: normCorners[2].x * sw, y: normCorners[2].y * sh },
    { x: normCorners[3].x * sw, y: normCorners[3].y * sh },
  ];

  let outW = Math.round(Math.max(dist(srcPts[0], srcPts[1]), dist(srcPts[3], srcPts[2])));
  let outH = Math.round(Math.max(dist(srcPts[0], srcPts[3]), dist(srcPts[1], srcPts[2])));
  outW = Math.max(64, outW);
  outH = Math.max(64, outH);

  const scale = Math.min(1, maxOutputDim / Math.max(outW, outH));
  outW = Math.round(outW * scale);
  outH = Math.round(outH * scale);

  const srcCtx = srcCanvas.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, sw, sh).data;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d')!;
  const outImg = outCtx.createImageData(outW, outH);
  const dstData = outImg.data;

  const H = computeHomography(srcPts, outW, outH);

  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const denom = H[6] * u + H[7] * v + H[8];
      const sx = (H[0] * u + H[1] * v + H[2]) / denom;
      const sy = (H[3] * u + H[4] * v + H[5]) / denom;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const dx = sx - x0;
      const dy = sy - y0;

      const x1 = Math.min(sw - 1, Math.max(0, x0 + 1));
      const y1 = Math.min(sh - 1, Math.max(0, y0 + 1));
      const cx0 = Math.min(sw - 1, Math.max(0, x0));
      const cy0 = Math.min(sh - 1, Math.max(0, y0));

      const i00 = (cy0 * sw + cx0) * 4;
      const i10 = (cy0 * sw + x1) * 4;
      const i01 = (y1 * sw + cx0) * 4;
      const i11 = (y1 * sw + x1) * 4;

      const w00 = (1 - dx) * (1 - dy);
      const w10 = dx * (1 - dy);
      const w01 = (1 - dx) * dy;
      const w11 = dx * dy;

      const outIdx = (v * outW + u) * 4;
      for (let c = 0; c < 3; c++) {
        let val =
          srcData[i00 + c] * w00 +
          srcData[i10 + c] * w10 +
          srcData[i01 + c] * w01 +
          srcData[i11 + c] * w11;

        if (autoEnhance) {
          // Gentle contrast + brightness lift to make A4 paper look crisp
          val = (val - 128) * 1.12 + 136;
        }
        dstData[outIdx + c] = Math.max(0, Math.min(255, val));
      }
      dstData[outIdx + 3] = 255;
    }
  }

  outCtx.putImageData(outImg, 0, 0);

  return new Promise((resolve, reject) => {
    outCanvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode cropped image'));
      },
      'image/jpeg',
      0.92,
    );
  });
}
