const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /hash/i,
  /token/i,
  /secret/i,
  /jwt/i,
  /auth/i,
  /cookie/i,
  /key/i,
  /cccd/i,
  /id_number/i,
  /idnumber/i,
  /docnumber/i,
  /bank_account/i,
  /bankaccount/i,
  /salary/i,
  /allowance/i,
  /contract_value/i,
];

function redactValue(key, value) {
  if (typeof value !== 'string') return value;
  if (!key) return value;

  const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pat) => pat.test(key));
  if (isSensitiveKey) {
    if (value.length <= 4) return '***';
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return value;
}

export function redactObject(obj, depth = 0) {
  if (depth > 6) return '[MAX_DEPTH]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // Redact JWT tokens if embedded in raw strings
    if (obj.startsWith('Bearer ') || (obj.split('.').length === 3 && obj.length > 50)) {
      return '[REDACTED_TOKEN]';
    }
    // Redact encrypted envelope data dumps
    if (obj.startsWith('ENC:{"v":1,')) {
      return '[ENCRYPTED_ENVELOPE]';
    }
    return obj;
  }
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1));
  }

  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'object' && v !== null) {
      clean[k] = redactObject(v, depth + 1);
    } else {
      clean[k] = redactValue(k, v);
    }
  }
  return clean;
}

export const logger = {
  info: (...args) => {
    const cleanArgs = args.map((arg) => (typeof arg === 'object' ? redactObject(arg) : arg));
    console.log(`[INFO ${new Date().toISOString()}]`, ...cleanArgs);
  },
  warn: (...args) => {
    const cleanArgs = args.map((arg) => (typeof arg === 'object' ? redactObject(arg) : arg));
    console.warn(`[WARN ${new Date().toISOString()}]`, ...cleanArgs);
  },
  error: (...args) => {
    const cleanArgs = args.map((arg) => {
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}\n${arg.stack}`;
      }
      return typeof arg === 'object' ? redactObject(arg) : arg;
    });
    console.error(`[ERROR ${new Date().toISOString()}]`, ...cleanArgs);
  },
};

export default logger;
