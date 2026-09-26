import {
  DocumentModelData,
  BlockNode,
  ParagraphBlock,
  HeadingBlock,
  ListItemBlock,
  TableBlock,
  TextRun,
  TextMarks,
  ParagraphStyle,
  DocumentSettings,
} from './types';
import { createInitialDocument, DEFAULT_TEXT_MARKS, DEFAULT_PARAGRAPH_STYLE } from './defaults';
import { generateBlockId, generateRunId } from '../utils/id-generator';

export class DocumentModel {
  public data: DocumentModelData;

  constructor(initialData?: DocumentModelData | string) {
    if (typeof initialData === 'string') {
      try {
        this.data = JSON.parse(initialData);
      } catch {
        this.data = createInitialDocument(generateBlockId('doc'));
      }
    } else if (initialData && initialData.blocks && initialData.blocks.length > 0) {
      this.data = initialData;
    } else {
      this.data = createInitialDocument(generateBlockId('doc'));
    }
  }

  get id(): string {
    return this.data.id;
  }

  get title(): string {
    return this.data.title;
  }

  set title(val: string) {
    this.data.title = val;
    this.data.metadata.updatedAt = new Date().toISOString();
  }

  get revision(): number {
    return this.data.revision;
  }

  set revision(val: number) {
    this.data.revision = val;
  }

  get settings(): DocumentSettings {
    return this.data.settings;
  }

  set settings(val: DocumentSettings) {
    this.data.settings = val;
    this.data.metadata.updatedAt = new Date().toISOString();
  }

  get blocks(): BlockNode[] {
    return this.data.blocks;
  }

  set blocks(val: BlockNode[]) {
    this.data.blocks = val;
  }

  public clone(): DocumentModel {
    return new DocumentModel(JSON.parse(JSON.stringify(this.data)));
  }

  public getBlockIndex(blockId: string): number {
    return this.data.blocks.findIndex((b) => b.id === blockId);
  }

  public getBlockById(blockId: string): BlockNode | null {
    const block = this.data.blocks.find((b) => b.id === blockId);
    if (block) return block;

    // Search in table cells
    for (const b of this.data.blocks) {
      if (b.type === 'table') {
        for (const row of b.rows) {
          for (const cell of row.cells) {
            const cellBlock = cell.blocks.find((cb) => cb.id === blockId);
            if (cellBlock) return cellBlock;
          }
        }
      }
    }
    return null;
  }

  public getBlockLocation(blockId: string): { parentArray: BlockNode[]; index: number; table?: TableBlock; cell?: any } | null {
    const topIdx = this.data.blocks.findIndex((b) => b.id === blockId);
    if (topIdx !== -1) {
      return { parentArray: this.data.blocks, index: topIdx };
    }

    for (const b of this.data.blocks) {
      if (b.type === 'table') {
        for (const row of b.rows) {
          for (const cell of row.cells) {
            const cellIdx = cell.blocks.findIndex((cb) => cb.id === blockId);
            if (cellIdx !== -1) {
              return { parentArray: cell.blocks, index: cellIdx, table: b, cell };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Helper to get plain text of a block
   */
  public getBlockText(block: BlockNode): string {
    if ('runs' in block && Array.isArray(block.runs)) {
      return block.runs.map((r) => r.text).join('');
    }
    return '';
  }

  /**
   * Helper to get total character length of a block
   */
  public getBlockLength(block: BlockNode): number {
    return this.getBlockText(block).length;
  }

  /**
   * Normalizes adjacent text runs with identical marks and removes empty runs (unless whole block is empty)
   */
  public static normalizeRuns(runs: TextRun[]): TextRun[] {
    if (!runs || runs.length === 0) {
      return [{ id: generateRunId(), text: '', marks: {} }];
    }

    const merged: TextRun[] = [];
    for (const run of runs) {
      if (run.text.length === 0 && runs.length > 1) {
        continue;
      }
      if (merged.length === 0) {
        merged.push({ ...run });
        continue;
      }

      const prev = merged[merged.length - 1];
      if (DocumentModel.areMarksEqual(prev.marks, run.marks)) {
        prev.text += run.text;
      } else {
        merged.push({ ...run });
      }
    }

    if (merged.length === 0) {
      return [{ id: generateRunId(), text: '', marks: runs[0]?.marks || {} }];
    }

    return merged;
  }

  public static areMarksEqual(a?: TextMarks, b?: TextMarks): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (
      a.fontFamily === b.fontFamily &&
      a.fontSize === b.fontSize &&
      Boolean(a.bold) === Boolean(b.bold) &&
      Boolean(a.italic) === Boolean(b.italic) &&
      Boolean(a.underline) === Boolean(b.underline) &&
      Boolean(a.strike) === Boolean(b.strike) &&
      (a.foregroundColor || DEFAULT_TEXT_MARKS.foregroundColor) ===
        (b.foregroundColor || DEFAULT_TEXT_MARKS.foregroundColor) &&
      (a.backgroundColor || '') === (b.backgroundColor || '') &&
      (a.link || '') === (b.link || '')
    );
  }

  public static cloneMarks(marks?: TextMarks): TextMarks {
    return marks ? { ...marks } : {};
  }

  public static cloneStyle(style?: ParagraphStyle): ParagraphStyle {
    return style ? { ...style } : { ...DEFAULT_PARAGRAPH_STYLE };
  }
}
