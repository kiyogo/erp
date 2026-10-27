function appendBits(target: number[], value: number, length: number): void {
  for (let bit = length - 1; bit >= 0; bit--) target.push((value >>> bit) & 1);
}

function multiply(a: number, b: number): number {
  let product = 0;
  for (let bit = 7; bit >= 0; bit--) {
    product = (product << 1) ^ ((product >>> 7) * 0x11d);
    product ^= ((b >>> bit) & 1) * a;
  }
  return product;
}

function makeErrorCorrection(data: number[], eccCodewords: number): number[] {
  let generator = [1];
  let root = 1;
  for (let index = 0; index < eccCodewords; index++) {
    const next = Array(generator.length + 1).fill(0);
    for (let i = 0; i < generator.length; i++) {
      next[i] ^= generator[i];
      next[i + 1] ^= multiply(generator[i], root);
    }
    generator = next;
    root = multiply(root, 2);
  }
  const remainder = [...data, ...Array(eccCodewords).fill(0)];
  for (let index = 0; index < data.length; index++) {
    const factor = remainder[index];
    for (let i = 0; i < generator.length; i++) remainder[index + i] ^= multiply(generator[i], factor);
  }
  return remainder.slice(data.length);
}

function formatBits(mask: number): number {
  const data = (1 << 3) | mask; // Error correction level L.
  let remainder = data << 10;
  for (let bit = 14; bit >= 10; bit--) {
    if ((remainder >>> bit) & 1) remainder ^= 0x537 << (bit - 10);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

export function buildQrMatrix(value: string): boolean[][] {
  const payload = new TextEncoder().encode(String(value));
  if (payload.length === 0 || payload.length > 32) throw new Error('Asset code must contain between 1 and 32 UTF-8 bytes for this QR format.');
  const version = payload.length <= 17 ? 1 : 2;
  const size = 17 + version * 4;
  const dataCodewords = version === 1 ? 19 : 34;
  const eccCodewords = version === 1 ? 7 : 10;

  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, payload.length, 8);
  for (const byte of payload) appendBits(bits, byte, 8);
  const capacity = dataCodewords * 8;
  for (let i = 0; i < Math.min(4, capacity - bits.length); i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const data = Array.from({ length: bits.length / 8 }, (_, i) => bits.slice(i * 8, i * 8 + 8).reduce((sum, bit) => (sum << 1) | bit, 0));
  for (let pad = 0; data.length < dataCodewords; pad++) data.push(pad % 2 === 0 ? 0xec : 0x11);
  const codewords = [...data, ...makeErrorCorrection(data, eccCodewords)];
  const dataBits = codewords.flatMap((byte) => Array.from({ length: 8 }, (_, bit) => (byte >>> (7 - bit)) & 1));

  const matrix = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const setFunction = (x: number, y: number, dark: boolean) => {
    if (x >= 0 && x < size && y >= 0 && y < size) {
      matrix[y][x] = dark;
      reserved[y][x] = true;
    }
  };

  for (let i = 8; i < size - 8; i++) {
    setFunction(i, 6, i % 2 === 0);
    setFunction(6, i, i % 2 === 0);
  }
  const drawFinder = (left: number, top: number) => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const distance = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        const insideFinder = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        setFunction(left + dx, top + dy, insideFinder && (distance === 3 || distance <= 1));
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);
  if (version === 2) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(18 + dx, 18 + dy, distance === 2 || distance === 0);
      }
    }
  }

  const format = formatBits(0);
  for (let i = 0; i <= 5; i++) setFunction(8, i, ((format >>> i) & 1) !== 0);
  setFunction(8, 7, ((format >>> 6) & 1) !== 0);
  setFunction(8, 8, ((format >>> 7) & 1) !== 0);
  setFunction(7, 8, ((format >>> 8) & 1) !== 0);
  for (let i = 9; i < 15; i++) setFunction(14 - i, 8, ((format >>> i) & 1) !== 0);
  for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, ((format >>> i) & 1) !== 0);
  for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, ((format >>> i) & 1) !== 0);
  setFunction(8, size - 8, true);

  let bitIndex = 0;
  for (let right = size - 1, upward = true; right >= 1; right -= 2, upward = !upward) {
    if (right === 6) right = 5;
    for (let offset = 0; offset < size; offset++) {
      const y = upward ? size - 1 - offset : offset;
      for (let column = 0; column < 2; column++) {
        const x = right - column;
        if (reserved[y][x]) continue;
        const raw = dataBits[bitIndex++] ?? 0;
        matrix[y][x] = ((x + y) % 2 === 0) ? raw === 0 : raw !== 0;
      }
    }
  }
  return matrix;
}

export function qrMatrixToSvg(matrix: boolean[][], quietZone = 4): string {
  const size = matrix.length;
  const viewSize = size + quietZone * 2;
  const paths = matrix.flatMap((row, y) => row.flatMap((dark, x) => dark ? [`M${x + quietZone},${y + quietZone}h1v1h-1z`] : [])).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${viewSize} ${viewSize}" role="img" aria-label="Mã QR tài sản"><rect width="100%" height="100%" fill="#fff"/><path d="${paths}" fill="#0f172a"/></svg>`;
}
