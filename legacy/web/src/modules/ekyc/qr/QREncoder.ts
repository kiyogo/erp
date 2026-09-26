import { generateECCodewords } from './QRErrorCorrection';

const BYTE_CAPACITY: readonly (readonly number[])[] = [
  [17,14,11,7],[32,26,20,14],[53,42,32,24],[78,62,46,34],[106,84,60,44],
  [134,106,74,58],[154,122,86,64],[192,152,108,84],[230,180,130,98],
  [271,213,151,119],[321,251,177,137],[367,287,203,155],[425,331,241,177],
  [458,362,258,194],[520,412,292,220],
];

const EC_BLOCKS: readonly (readonly (readonly number[])[])[] = [
  [[1,19,0,0,7],[1,16,0,0,10],[1,13,0,0,13],[1,9,0,0,17]],
  [[1,34,0,0,10],[1,28,0,0,16],[1,22,0,0,22],[1,16,0,0,28]],
  [[1,55,0,0,15],[1,44,0,0,26],[2,17,0,0,18],[2,13,0,0,22]],
  [[1,80,0,0,20],[2,32,0,0,18],[2,24,0,0,26],[4,9,0,0,16]],
  [[1,108,0,0,26],[2,43,0,0,18],[2,15,2,16,24],[2,11,2,12,28]],
  [[2,68,0,0,18],[4,27,0,0,16],[4,19,0,0,18],[4,15,0,0,22]],
  [[2,78,0,0,20],[4,31,0,0,18],[2,14,4,15,18],[4,13,1,14,26]],
  [[2,97,0,0,24],[2,38,2,39,22],[4,18,2,19,22],[4,14,2,15,26]],
  [[2,116,0,0,30],[3,36,2,37,22],[4,16,4,17,20],[4,12,4,13,24]],
  [[2,68,2,69,18],[4,43,1,44,26],[6,19,2,20,24],[6,15,2,16,28]],
  [[4,81,0,0,20],[1,50,4,51,30],[4,22,4,23,28],[3,12,8,13,24]],
  [[2,92,2,93,24],[6,36,2,37,22],[4,20,6,21,26],[7,14,4,15,28]],
  [[4,107,0,0,26],[8,37,1,38,22],[8,20,4,21,24],[12,11,4,12,22]],
  [[3,115,1,116,30],[4,40,5,41,24],[11,16,5,17,20],[11,12,5,13,24]],
  [[5,87,1,88,22],[5,41,5,42,24],[5,24,7,25,30],[11,12,7,13,24]],
];

export type ECLevel = 'L' | 'M' | 'Q' | 'H';
const EC_IDX: Record<ECLevel,number> = {L:0,M:1,Q:2,H:3};

export interface QREncoded {
  version: number;
  size: number;
  ecLevel: ECLevel;
  data: number[];
}

export function selectVersion(byteLen: number, ec: ECLevel): number {
  const ei = EC_IDX[ec];
  for (let v = 0; v < BYTE_CAPACITY.length; v++) {
    if (BYTE_CAPACITY[v][ei] >= byteLen) return v + 1;
  }
  throw new Error('Text too long for QR version 1-15');
}

export function encodeQR(text: string, ecLevel: ECLevel = 'M'): QREncoded {
  const bytes = new TextEncoder().encode(text);
  const ecIdx = EC_IDX[ecLevel];
  const version = selectVersion(bytes.length, ecLevel);
  const [n1,d1,n2,d2,ecPer] = EC_BLOCKS[version-1][ecIdx];

  const bits: number[] = [];
  const push = (v: number, len: number) => { for (let i=len-1;i>=0;i--) bits.push((v>>i)&1); };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);

  const totalCW = n1*d1 + n2*d2;
  const totalBits = totalCW * 8;
  for (let i=0; i<4 && bits.length<totalBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const pads = [0xEC,0x11]; let pi=0;
  while (bits.length < totalBits) push(pads[pi++%2], 8);

  const cw: number[] = [];
  for (let i=0; i<bits.length; i+=8) {
    let b=0; for (let j=0;j<8;j++) b=(b<<1)|(bits[i+j]??0);
    cw.push(b);
  }

  const blocks: {data:number[];ec:number[]}[] = [];
  let pos=0;
  for (let i=0;i<n1;i++) { const d=cw.slice(pos,pos+d1); pos+=d1; blocks.push({data:d,ec:generateECCodewords(d,ecPer)}); }
  for (let i=0;i<n2;i++) { const d=cw.slice(pos,pos+d2); pos+=d2; blocks.push({data:d,ec:generateECCodewords(d,ecPer)}); }

  const out: number[] = [];
  const maxD = Math.max(d1,d2);
  for (let i=0;i<maxD;i++) for (const b of blocks) if (i<b.data.length) out.push(b.data[i]);
  for (let i=0;i<ecPer;i++) for (const b of blocks) out.push(b.ec[i]);

  return { version, size: 4*version+17, ecLevel, data: out };
}
