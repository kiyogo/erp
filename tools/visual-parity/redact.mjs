export function redactDiagnostics(value, secrets=[]) {
  let text=String(value);
  for(const secret of secrets)if(secret)text=text.replaceAll(secret,'[redacted]');
  return text.replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi,'$1[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[redacted-jwt]');
}
