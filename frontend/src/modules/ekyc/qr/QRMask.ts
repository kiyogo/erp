import { QRMatrix } from './QRMatrix';
export type { ECLevel } from './QREncoder';

const MASKS = [
  (r:number,c:number)=>(r+c)%2===0,
  (r:number)=>r%2===0,
  (_:number,c:number)=>c%3===0,
  (r:number,c:number)=>(r+c)%3===0,
  (r:number,c:number)=>(Math.floor(r/2)+Math.floor(c/3))%2===0,
  (r:number,c:number)=>((r*c)%2)+((r*c)%3)===0,
  (r:number,c:number)=>(((r*c)%2)+((r*c)%3))%2===0,
  (r:number,c:number)=>(((r+c)%2)+((r*c)%3))%2===0,
];

function applyMask(m: QRMatrix, idx: number): QRMatrix {
  const cp=m.clone(), n=m.size, fn=MASKS[idx];
  for (let r=0;r<n;r++) for (let c=0;c<n;c++)
    if (!cp.isReserved(r,c) && fn(r,c)) cp.set(r,c,cp.get(r,c)===0);
  return cp;
}

function penalty(mat: number[][]): number {
  const n=mat.length; let p=0;
  const scan=(line:number[])=>{ let k=1; for(let i=1;i<line.length;i++){ if(line[i]===line[i-1]){k++;if(k===5)p+=3;else if(k>5)p+=1;}else k=1;} };
  for (let r=0;r<n;r++) scan(mat[r]);
  for (let c=0;c<n;c++) scan(mat.map(row=>row[c]));
  for (let r=0;r<n-1;r++) for (let c=0;c<n-1;c++) {
    const v=mat[r][c]; if(v===mat[r][c+1]&&v===mat[r+1][c]&&v===mat[r+1][c+1]) p+=3;
  }
  const p1=[1,0,1,1,1,0,1,0,0,0,0], p2=[0,0,0,0,1,0,1,1,1,0,1];
  const chk=(line:number[],pat:number[])=>{ for(let i=0;i<=line.length-11;i++) if(pat.every((v,j)=>line[i+j]===v)) p+=40; };
  for (let r=0;r<n;r++) { chk(mat[r],p1);chk(mat[r],p2); const col=mat.map(row=>row[r]); chk(col,p1);chk(col,p2); }
  let dk=0; for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(mat[r][c]===1) dk++;
  const pct=(dk/(n*n))*100, prev=Math.floor(pct/5)*5, next=prev+5;
  p+=Math.min(Math.abs(prev-50),Math.abs(next-50))/5*10;
  return p;
}

const EC_BITS: Record<string,number> = {L:0b01,M:0b00,Q:0b11,H:0b10};
function bch(data:number): number {
  let d=data<<10;
  for(let i=14;i>=10;i--) if(d&(1<<i)) d^=0x537<<(i-10);
  return (data<<10)|d;
}
export function buildFormatInfo(ec:string, mask:number): number {
  return bch((EC_BITS[ec]<<3)|mask)^0b101010000010010;
}

export function applyBestMask(matrix: QRMatrix, ec: string): {masked:QRMatrix;maskIdx:number;formatBits:number} {
  let best=0, bestP=Infinity, bestM=matrix;
  for (let m=0;m<8;m++) {
    const cand=applyMask(matrix,m), fb=buildFormatInfo(ec,m);
    cand.applyFormatInfo(fb);
    const p=penalty(cand.toArray());
    if(p<bestP){bestP=p;best=m;bestM=cand;}
  }
  return {masked:bestM,maskIdx:best,formatBits:buildFormatInfo(ec,best)};
}
