import { TextMarks } from '../model/types';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE } from '../model/defaults';
import { getGraphemeClusters } from '../utils/unicode';

export interface MeasuredTextMetrics {
  width: number;
  ascent: number;
  descent: number;
  height: number;
  lineHeightPx: number;
}

export interface ClusterMeasurement {
  cluster: string;
  width: number;
  xOffset: number; // relative to start of run
}

export class FontMetricsService {
  private ctx: CanvasRenderingContext2D | null = null;
  private metricsCache: Map<string, MeasuredTextMetrics> = new Map();
  private widthCache: Map<string, number> = new Map();
  private clusterCache: Map<string, ClusterMeasurement[]> = new Map();

  constructor() {
    this.initContext();
  }

  private initContext(): void {
    if (this.ctx) return;
    try {
      if (typeof document !== 'undefined' && document.createElement) {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        this.ctx = canvas.getContext('2d', { willReadFrequently: true });
      } else if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(100, 100);
        this.ctx = canvas.getContext('2d') as any;
      }
    } catch {
      this.ctx = null;
    }
  }

  /**
   * Generates a standard CSS font string from marks
   */
  public getFontString(marks?: TextMarks): string {
    const family = marks?.fontFamily || DEFAULT_FONT_FAMILY;
    const size = marks?.fontSize || DEFAULT_FONT_SIZE;
    const weight = marks?.bold ? 'bold' : 'normal';
    const style = marks?.italic ? 'italic' : 'normal';
    return `${style} ${weight} ${size}pt ${family}, sans-serif`;
  }

  private getCacheKey(fontStr: string, text: string): string {
    return `${fontStr}::${text}`;
  }

  /**
   * Measure full text run metrics
   */
  public measureRun(text: string, marks?: TextMarks, lineHeightMultiplier: number = 1.25): MeasuredTextMetrics {
    const fontStr = this.getFontString(marks);
    const key = this.getCacheKey(fontStr, text);

    const cached = this.metricsCache.get(key);
    if (cached) return cached;

    this.initContext();

    const fontSizePt = marks?.fontSize || DEFAULT_FONT_SIZE;
    const fontSizePx = (fontSizePt * 96) / 72;

    let width = 0;
    let fontAscent = fontSizePx * 0.8;
    let fontDescent = fontSizePx * 0.2;

    if (this.ctx) {
      this.ctx.font = fontStr;
      const metrics = this.ctx.measureText(text || ' ');
      fontAscent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent || fontSizePx * 0.8;
      fontDescent = metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent || fontSizePx * 0.2;
      width = text.length === 0 ? 0 : metrics.width;
    } else {
      // Heuristic fallback for non-browser/node environments
      width = text.length === 0 ? 0 : text.length * (fontSizePx * 0.55);
    }

    const height = fontAscent + fontDescent;
    const lineHeightPx = fontSizePx * lineHeightMultiplier;

    const result: MeasuredTextMetrics = {
      width,
      ascent: fontAscent,
      descent: fontDescent,
      height,
      lineHeightPx,
    };

    this.metricsCache.set(key, result);
    return result;
  }

  /**
   * Measure single cluster or word width quickly
   */
  public measureWidth(text: string, marks?: TextMarks): number {
    if (!text) return 0;
    const fontStr = this.getFontString(marks);
    const key = this.getCacheKey(fontStr, text);

    const cached = this.widthCache.get(key);
    if (cached !== undefined) return cached;

    this.initContext();
    const fontSizePt = marks?.fontSize || DEFAULT_FONT_SIZE;
    const fontSizePx = (fontSizePt * 96) / 72;

    let width = 0;
    if (this.ctx) {
      this.ctx.font = fontStr;
      width = this.ctx.measureText(text).width;
    } else {
      width = text.length * (fontSizePx * 0.55);
    }

    this.widthCache.set(key, width);
    return width;
  }

  /**
   * Measure each grapheme cluster position within a text run for accurate hit testing and selection highlighting
   */
  public measureClusters(text: string, marks?: TextMarks): ClusterMeasurement[] {
    if (!text) return [];
    const fontStr = this.getFontString(marks);
    const key = this.getCacheKey(fontStr, text);

    const cached = this.clusterCache.get(key);
    if (cached) return cached;

    const clusters = getGraphemeClusters(text);
    const result: ClusterMeasurement[] = [];

    this.initContext();
    if (this.ctx) {
      this.ctx.font = fontStr;
    }
    let currentX = 0;

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const clusterWidth = this.measureWidth(cluster, marks);
      result.push({
        cluster,
        width: clusterWidth,
        xOffset: currentX,
      });
      currentX += clusterWidth;
    }

    this.clusterCache.set(key, result);
    return result;
  }

  /**
   * Clear font caches if fonts load or change dynamically
   */
  public clearCache(): void {
    this.metricsCache.clear();
    this.widthCache.clear();
    this.clusterCache.clear();
  }
}

// Global Singleton Instance
export const fontMetrics = new FontMetricsService();

