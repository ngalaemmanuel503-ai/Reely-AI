import enMessages from '../messages/en.json';

type Messages = typeof enMessages;

function getNestedValue(obj: unknown, path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = getNestedValue(enMessages as Messages, key);
  if (!raw) {
    return key;
  }
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_match, name) => {
    const val = vars[name];
    return val !== undefined ? String(val) : `{${name}}`;
  });
}
