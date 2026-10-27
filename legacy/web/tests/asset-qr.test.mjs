import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import jsQR from 'jsqr';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/assets/qrCode.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const qr = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('asset QR output is a scannable QR Model 2 symbol with a quiet zone', () => {
  const matrix = qr.buildQrMatrix('TS-IT-020');
  assert.equal(matrix.length, 21);
  assert.ok(matrix.every((row) => row.length === 21));
  const moduleSize = 8;
  const quietZone = 4;
  const dimension = (matrix.length + quietZone * 2) * moduleSize;
  const data = new Uint8ClampedArray(dimension * dimension * 4);
  for (let y = 0; y < dimension; y++) {
    for (let x = 0; x < dimension; x++) {
      const mx = Math.floor(x / moduleSize) - quietZone;
      const my = Math.floor(y / moduleSize) - quietZone;
      const dark = mx >= 0 && my >= 0 && mx < matrix.length && my < matrix.length && matrix[my][mx];
      const offset = (y * dimension + x) * 4;
      const color = dark ? 0 : 255;
      data[offset] = color;
      data[offset + 1] = color;
      data[offset + 2] = color;
      data[offset + 3] = 255;
    }
  }
  assert.equal(jsQR(data, dimension, dimension)?.data, 'TS-IT-020');
  const longer = '01234567890123456789012345678901';
  const matrixV2 = qr.buildQrMatrix(longer);
  assert.equal(matrixV2.length, 25);
  const version2Dimension = (matrixV2.length + quietZone * 2) * moduleSize;
  const version2Data = new Uint8ClampedArray(version2Dimension * version2Dimension * 4);
  for (let y = 0; y < version2Dimension; y++) {
    for (let x = 0; x < version2Dimension; x++) {
      const mx = Math.floor(x / moduleSize) - quietZone;
      const my = Math.floor(y / moduleSize) - quietZone;
      const dark = mx >= 0 && my >= 0 && mx < matrixV2.length && my < matrixV2.length && matrixV2[my][mx];
      const offset = (y * version2Dimension + x) * 4;
      const color = dark ? 0 : 255;
      version2Data[offset] = color;
      version2Data[offset + 1] = color;
      version2Data[offset + 2] = color;
      version2Data[offset + 3] = 255;
    }
  }
  assert.equal(jsQR(version2Data, version2Dimension, version2Dimension)?.data, longer);
  assert.throws(() => qr.buildQrMatrix('ASSET-CODE-TOO-LONG-1234567890123'), /32 UTF-8 bytes/);
  assert.ok(qr.qrMatrixToSvg(matrix).includes('<svg'));
});
