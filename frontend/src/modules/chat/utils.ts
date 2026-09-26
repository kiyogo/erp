export function cn(...inputs: any[]) {
  return inputs
    .flat()
    .filter(Boolean)
    .map(x => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
    .join(' ');
}
