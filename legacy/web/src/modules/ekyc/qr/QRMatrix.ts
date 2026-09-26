const ALIGN_POS: readonly (readonly number[])[] = [
  [], // V1
  [6, 18], // V2
  [6, 22], // V3
  [6, 26], // V4
  [6, 30], // V5
  [6, 34], // V6
  [6, 22, 38], // V7
  [6, 24, 42], // V8
  [6, 26, 46], // V9
  [6, 28, 50], // V10
  [6, 30, 54], // V11
  [6, 32, 58], // V12
  [6, 34, 62], // V13
  [6, 26, 46, 66], // V14
  [6, 26, 48, 70], // V15
];

// 18-bit Version info bits for Version 7 - 15 (BCH 18,6)
const VERSION_INFO_BITS: Record<number, number> = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3,
  11: 0x0bbf6,
  12: 0x0c762,
  13: 0x0d847,
  14: 0x0e60d,
  15: 0x0f928,
};

export class QRMatrix {
  private mat: Int8Array;
  private res: Uint8Array;
  readonly size: number;
  readonly version: number;

  constructor(version: number) {
    this.version = version;
    this.size = 4 * version + 17;
    const n = this.size * this.size;
    this.mat = new Int8Array(n).fill(-1);
    this.res = new Uint8Array(n);
  }

  private i(r: number, c: number) {
    return r * this.size + c;
  }

  set(r: number, c: number, dark: boolean, reserve = false) {
    if (r < 0 || r >= this.size || c < 0 || c >= this.size) return;
    const idx = this.i(r, c);
    this.mat[idx] = dark ? 1 : 0;
    if (reserve) this.res[idx] = 1;
  }

  get(r: number, c: number): number {
    if (r < 0 || r >= this.size || c < 0 || c >= this.size) return 0;
    return this.mat[this.i(r, c)];
  }

  isReserved(r: number, c: number): boolean {
    if (r < 0 || r >= this.size || c < 0 || c >= this.size) return true;
    return this.res[this.i(r, c)] === 1;
  }

  // 1. Finder Pattern (7x7) + Separator (1 module trắng quanh mỗi Finder)
  private setupFinderAndSeparator(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const pr = row + r;
        const pc = col + c;
        if (pr < 0 || pr >= this.size || pc < 0 || pc >= this.size) continue;

        let dark = false;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          if (r === 0 || r === 6 || c === 0 || c === 6) {
            dark = true; // Viền ngoài đen
          } else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) {
            dark = true; // Lõi 3x3 đen
          } else {
            dark = false; // Vòng 1 module trắng
          }
        } else {
          dark = false; // Separator trắng
        }

        this.set(pr, pc, dark, true);
      }
    }
  }

  // 2. Timing Patterns (row 6, col 6 xen kẽ đen/trắng)
  private setupTiming() {
    for (let i = 8; i < this.size - 8; i++) {
      if (!this.isReserved(6, i)) {
        this.set(6, i, i % 2 === 0, true);
      }
      if (!this.isReserved(i, 6)) {
        this.set(i, 6, i % 2 === 0, true);
      }
    }
  }

  // 3. Alignment Patterns (5x5) — loại trừ 3 góc đã có Finder
  private setupAlignment() {
    if (this.version < 2) return;
    const pos = ALIGN_POS[this.version - 1];
    const len = pos.length;

    for (let i = 0; i < len; i++) {
      for (let j = 0; j < len; j++) {
        // Bỏ qua 3 góc: Top-Left, Top-Right, Bottom-Left
        if (
          (i === 0 && j === 0) ||
          (i === 0 && j === len - 1) ||
          (i === len - 1 && j === 0)
        ) {
          continue;
        }

        const r = pos[i];
        const c = pos[j];

        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dark = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
            this.set(r + dr, c + dc, dark, true);
          }
        }
      }
    }
  }

  // 4. Reserve Format Info & Version Info
  private setupReservations() {
    const n = this.size;

    // Format Info
    for (let i = 0; i < 9; i++) {
      if (!this.isReserved(8, i)) this.set(8, i, false, true);
      if (!this.isReserved(i, 8)) this.set(i, 8, false, true);
    }
    for (let i = 0; i < 8; i++) {
      if (!this.isReserved(8, n - 1 - i)) this.set(8, n - 1 - i, false, true);
    }
    for (let i = 0; i < 7; i++) {
      if (!this.isReserved(n - 1 - i, 8)) this.set(n - 1 - i, 8, false, true);
    }

    // Fixed Dark Module tại (size - 8, 8)
    this.set(4 * this.version + 9, 8, true, true);

    // Version Info cho Version >= 7
    if (this.version >= 7) {
      const vBits = VERSION_INFO_BITS[this.version];
      for (let i = 0; i < 18; i++) {
        const bit = ((vBits >> i) & 1) === 1;
        const row = Math.floor(i / 3);
        const col = i % 3;

        // Khối 1: Trên Bottom-Left Finder
        this.set(n - 11 + col, row, bit, true);

        // Khối 2: Trái Top-Right Finder
        this.set(row, n - 11 + col, bit, true);
      }
    }
  }

  init() {
    const n = this.size;
    this.setupFinderAndSeparator(0, 0);
    this.setupFinderAndSeparator(0, n - 7);
    this.setupFinderAndSeparator(n - 7, 0);

    this.setupTiming();
    this.setupAlignment();
    this.setupReservations();
  }

  placeData(codewords: number[]) {
    const n = this.size;
    let bi = 0;
    const total = codewords.length * 8;

    const getBit = () => {
      if (bi >= total) return 0;
      const v = (codewords[Math.floor(bi / 8)] >> (7 - (bi % 8))) & 1;
      bi++;
      return v;
    };

    let col = n - 1;
    let up = true;

    while (col >= 0) {
      if (col === 6) col--; // Bỏ qua cột timing 6

      if (up) {
        for (let r = n - 1; r >= 0; r--) {
          for (let dc = 0; dc < 2; dc++) {
            const c = col - dc;
            if (!this.isReserved(r, c)) {
              this.set(r, c, getBit() === 1);
            }
          }
        }
      } else {
        for (let r = 0; r < n; r++) {
          for (let dc = 0; dc < 2; dc++) {
            const c = col - dc;
            if (!this.isReserved(r, c)) {
              this.set(r, c, getBit() === 1);
            }
          }
        }
      }

      up = !up;
      col -= 2;
    }
  }

  applyFormatInfo(bits: number) {
    const n = this.size;
    const pos = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
      [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8],
      [2, 8], [1, 8], [0, 8],
    ];

    for (let i = 0; i < 15; i++) {
      const isDark = ((bits >> (14 - i)) & 1) === 1;
      this.set(pos[i][0], pos[i][1], isDark, true);
    }

    for (let i = 0; i < 8; i++) {
      const isDark = ((bits >> i) & 1) === 1;
      this.set(8, n - 1 - i, isDark, true);
    }

    for (let i = 0; i < 7; i++) {
      const isDark = ((bits >> (i + 8)) & 1) === 1;
      this.set(n - 7 + i, 8, isDark, true);
    }
  }

  toArray(): number[][] {
    return Array.from({ length: this.size }, (_, r) =>
      Array.from({ length: this.size }, (_, c) => this.mat[this.i(r, c)])
    );
  }

  clone(): QRMatrix {
    const cp = new QRMatrix(this.version);
    cp.mat.set(this.mat);
    cp.res.set(this.res);
    return cp;
  }
}
