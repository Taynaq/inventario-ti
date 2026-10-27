/** Senha provisória fácil de ditar e de digitar no celular (sem letras que se confundem). */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export const MIN_PASSWORD = 8;

/** `random(n)` devolve um inteiro de 0 a n-1. Por padrão usa o sorteio seguro do navegador. */
export function generatePassword(
  random: (n: number) => number = (n) => crypto.getRandomValues(new Uint32Array(1))[0]! % n,
): string {
  const pick = (): string => ALPHABET[random(ALPHABET.length)] ?? 'a';
  const part = (): string => Array.from({ length: 4 }, pick).join('');
  return `${part()}-${part()}`;
}

export const isValidPassword = (p: string): boolean => p.length >= MIN_PASSWORD;

/** Mensagem pronta para mandar à pessoa (WhatsApp, e-mail…). */
export function credentialMessage(c: {
  appName: string;
  url: string;
  email: string;
  password: string;
}): string {
  return [
    `Seu acesso à ${c.appName} está pronto.`,
    '',
    `Link: ${c.url}`,
    `E-mail: ${c.email}`,
    `Senha: ${c.password}`,
    '',
    'No primeiro acesso, troque a senha por uma só sua (botão "Trocar senha" no topo do app).',
  ].join('\n');
}
