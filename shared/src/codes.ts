/** Join-code alphabet with look-alike characters (0/O, 1/I/L) removed. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export function generateCode(isTaken: (code: string) => boolean = () => false, random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
    if (!isTaken(code)) return code;
  }
  throw new Error('Could not generate a unique room code');
}

/** Uppercases and strips spaces/dashes so "k7q 2xm" and "K7Q-2XM" both work. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function isValidCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}
