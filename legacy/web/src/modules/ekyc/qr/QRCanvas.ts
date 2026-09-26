export interface QRRenderOpts {
  size?: number;
  foreground?: string;
  background?: string;
  quietZone?: number;
  logo?: string;
  logoSizeRatio?: number;
}

export function renderToCanvas(matrix: number[][], canvas: HTMLCanvasElement, opts: QRRenderOpts = {}): void {
  const {
    size = 256,
    foreground = '#000000',
    background = '#ffffff',
    quietZone = 4,
    logo,
    logoSizeRatio = 0.2,
  } = opts;

  const n = matrix.length;
  const total = n + quietZone * 2;
  const mod = size / total;

  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = foreground;
  for (let r = 0; r < n; r++) {
    const y0 = Math.round((r + quietZone) * mod);
    const y1 = Math.round((r + quietZone + 1) * mod);
    const h = y1 - y0;

    for (let c = 0; c < n; c++) {
      if (matrix[r][c] === 1) {
        const x0 = Math.round((c + quietZone) * mod);
        const x1 = Math.round((c + quietZone + 1) * mod);
        const w = x1 - x0;
        ctx.fillRect(x0, y0, w, h);
      }
    }
  }

  if (logo) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ls = size * logoSizeRatio;
      const lx = (size - ls) / 2;
      const ly = (size - ls) / 2;
      const pad = ls * 0.15;
      ctx.fillStyle = background;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(lx - pad, ly - pad, ls + pad * 2, ls + pad * 2, 4);
        ctx.fill();
      } else {
        ctx.fillRect(lx - pad, ly - pad, ls + pad * 2, ls + pad * 2);
      }
      ctx.drawImage(img, lx, ly, ls, ls);
    };
    img.src = logo;
  }
}


export function matrixToDataUrl(matrix: number[][], opts: QRRenderOpts={}): string {
  const c=document.createElement('canvas');
  renderToCanvas(matrix,c,opts);
  return c.toDataURL('image/png');
}
