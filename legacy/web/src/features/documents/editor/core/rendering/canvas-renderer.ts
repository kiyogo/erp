import { PaintCommand } from './display-list';
import { PageLayout } from '../layout/layout-types';

export class CanvasRenderer {
  private static imageCache: Map<string, HTMLImageElement> = new Map();

  /**
   * Renders the base document content of a page to an HTML Canvas
   */
  public static renderPage(
    canvas: HTMLCanvasElement,
    pageLayout: PageLayout,
    dpr: number = window.devicePixelRatio || 1
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cssWidth = pageLayout.width;
    const cssHeight = pageLayout.height;

    // Set high-DPI retina sharpness
    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
    }
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Execute display list commands
    for (const cmd of pageLayout.displayList) {
      CanvasRenderer.executeCommand(ctx, cmd, () => {
        if (canvas.isConnected) {
          CanvasRenderer.renderPage(canvas, pageLayout, dpr);
        }
      });
    }
  }

  private static executeCommand(ctx: CanvasRenderingContext2D, cmd: PaintCommand, requestRepaint?: () => void): void {
    switch (cmd.type) {
      case 'rect': {
        ctx.save();
        if (cmd.fill) {
          ctx.fillStyle = cmd.fill;
          if (cmd.radius && cmd.radius > 0) {
            ctx.beginPath();
            ctx.roundRect(cmd.x, cmd.y, cmd.width, cmd.height, cmd.radius);
            ctx.fill();
          } else {
            ctx.fillRect(cmd.x, cmd.y, cmd.width, cmd.height);
          }
        }
        if (cmd.stroke) {
          ctx.strokeStyle = cmd.stroke;
          ctx.lineWidth = cmd.strokeWidth || 1;
          if (cmd.radius && cmd.radius > 0) {
            ctx.beginPath();
            ctx.roundRect(cmd.x, cmd.y, cmd.width, cmd.height, cmd.radius);
            ctx.stroke();
          } else {
            ctx.strokeRect(cmd.x, cmd.y, cmd.width, cmd.height);
          }
        }
        ctx.restore();
        break;
      }

      case 'line': {
        ctx.save();
        ctx.strokeStyle = cmd.stroke;
        ctx.lineWidth = cmd.strokeWidth;
        if (cmd.dash) ctx.setLineDash(cmd.dash);
        ctx.beginPath();
        ctx.moveTo(cmd.x1, cmd.y1);
        ctx.lineTo(cmd.x2, cmd.y2);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'text': {
        ctx.save();
        const weight = cmd.fontWeight || 'normal';
        const style = cmd.fontStyle || 'normal';
        ctx.font = `${style} ${weight} ${cmd.fontSize}pt ${cmd.fontFamily}, sans-serif`;
        ctx.fillStyle = cmd.fill;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(cmd.text, cmd.x, cmd.y);
        ctx.restore();
        break;
      }

      case 'image': {
        const cachedImg = CanvasRenderer.imageCache.get(cmd.src);
        if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
          ctx.drawImage(cachedImg, cmd.x, cmd.y, cmd.width, cmd.height);
        } else if (!cachedImg) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = cmd.src;
          img.onload = () => {
            CanvasRenderer.imageCache.set(cmd.src, img);
            requestRepaint?.();
          };
          img.onerror = () => {
            CanvasRenderer.imageCache.delete(cmd.src);
          };
          CanvasRenderer.imageCache.set(cmd.src, img);
        }
        break;
      }

      case 'push-clip': {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cmd.x, cmd.y, cmd.width, cmd.height);
        ctx.clip();
        break;
      }

      case 'pop-clip': {
        ctx.restore();
        break;
      }

      default:
        break;
    }
  }
}
