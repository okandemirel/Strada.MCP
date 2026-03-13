const SECRET_PATTERNS: [RegExp, string | ((match: string) => string)][] = [
  [/\bsk-[a-zA-Z0-9]{20,}/g, '[REDACTED]'],
  [/\bAIza[a-zA-Z0-9_-]{30,}/g, '[REDACTED]'],
  [/Bearer\s+[a-zA-Z0-9._-]+/g, '[REDACTED]'],
  [/\bghp_[a-zA-Z0-9]{36,}/g, '[REDACTED]'],
  [/\bgho_[a-zA-Z0-9]{36,}/g, '[REDACTED]'],
  [/\bxox[bpras]-[a-zA-Z0-9-]+/g, '[REDACTED]'],
  [/\bkey-[a-zA-Z0-9]{20,}/g, '[REDACTED]'],
  [/https?:\/\/[^:]+:[^@]+@/g, (match) => match.replace(/\/\/[^:]+:[^@]+@/, '//[REDACTED]@')],
];

export function sanitizeOutput(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    if (typeof replacement === 'string') {
      result = result.replace(pattern, replacement);
    } else {
      result = result.replace(pattern, replacement);
    }
  }
  return result;
}
