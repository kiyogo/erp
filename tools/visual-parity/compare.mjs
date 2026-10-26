import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
export function dependency(name) {
  try { return require(name); } catch (error) {
    if (!process.env.KIYO_VISUAL_NODE_MODULES) throw new Error(`Missing ${name}. Set KIYO_VISUAL_NODE_MODULES to an installed node_modules directory.`, { cause:error });
    return createRequire(path.resolve(process.env.KIYO_VISUAL_NODE_MODULES, 'package.json'))(name);
  }
}

// Exact equality: no tolerance, antialias exclusion, masking, cropping or resizing.
export function compareRGBA(reference, actual, width, height) {
  const totalPixels = width * height;
  if (reference.length !== totalPixels * 4 || actual.length !== reference.length) throw new Error('RGBA dimensions do not match');
  const diff = Buffer.alloc(reference.length);
  const overlay = Buffer.alloc(reference.length);
  let differentPixels = 0, sumAbsoluteDifference = 0, maximumChannelDifference = 0;
  let left = width, top = height, right = -1, bottom = -1;
  const tiles = new Map();
  for (let i=0; i<reference.length; i+=4) {
    let different = false;
    for (let c=0; c<4; c++) {
      const delta = Math.abs(reference[i+c] - actual[i+c]);
      different ||= delta !== 0;
      sumAbsoluteDifference += delta;
      maximumChannelDifference = Math.max(maximumChannelDifference, delta);
      overlay[i+c] = c === 3 ? 255 : Math.round((reference[i+c]+actual[i+c])/2);
    }
    if (different) {
      differentPixels++;
      const pixel = i/4, x = pixel%width, y = Math.floor(pixel/width);
      left = Math.min(left,x); top = Math.min(top,y); right = Math.max(right,x); bottom = Math.max(bottom,y);
      const key = `${Math.floor(x/64)*64},${Math.floor(y/64)*64}`;
      tiles.set(key,(tiles.get(key)||0)+1);
      diff[i]=255; diff[i+1]=0; diff[i+2]=64;
    } else {
      const grey = Math.round((reference[i]+reference[i+1]+reference[i+2])/3 * .3 + 178);
      diff[i]=grey; diff[i+1]=grey; diff[i+2]=grey;
    }
    diff[i+3]=255;
  }
  return { diff, overlay, metrics: {
    width, height, totalPixels, differentPixels,
    exactMatchPercentage: (1-differentPixels/totalPixels)*100,
    meanAbsoluteChannelDifference:sumAbsoluteDifference/reference.length,
    maximumChannelDifference, exact:differentPixels===0,
    mismatchBounds: differentPixels ? {x:left,y:top,width:right-left+1,height:bottom-top+1} : null,
    mismatchRegions:[...tiles].map(([key,pixels])=>{const [x,y]=key.split(',').map(Number);return{x,y,width:Math.min(64,width-x),height:Math.min(64,height-y),differentPixels:pixels};}),
  }};
}

export function compareGeometry(reference, actual) {
  const rows = [];
  for (const [name, rect] of Object.entries(reference || {})) {
    const target = actual?.[name];
    if (!target) { rows.push({name,status:'MISSING_ACTUAL_MEASUREMENT'}); continue; }
    const delta = rect.map((v,i)=>target[i]-v);
    rows.push({name,reference:rect,actual:target,delta,exact:delta.every(v=>v===0)});
  }
  const measured = rows.filter(r=>r.delta);
  return { rows,
    maximumElementPositionDeviation: measured.length ? Math.max(...measured.flatMap(r=>r.delta.slice(0,2).map(Math.abs))) : null,
    maximumElementSizeDeviation: measured.length ? Math.max(...measured.flatMap(r=>r.delta.slice(2).map(Math.abs))) : null,
    unmeasured:rows.filter(r=>!r.delta).length };
}

export async function comparePNGs(referencePath, actualPath, differencePath, overlayPath) {
  const sharp=dependency('sharp');
  const reference=await sharp(referencePath).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const actual=await sharp(actualPath).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(reference.info.width!==actual.info.width || reference.info.height!==actual.info.height) throw new Error('Screenshot size mismatch; images will not be resized');
  const {diff,overlay,metrics}=compareRGBA(reference.data,actual.data,reference.info.width,reference.info.height);
  const raw={width:reference.info.width,height:reference.info.height,channels:4};
  await sharp(diff,{raw}).png().toFile(differencePath);
  await sharp(overlay,{raw}).png().toFile(overlayPath);
  return metrics;
}
