import { describe, expect, it } from 'vitest';
import { credentialMessage, generatePassword, isValidPassword } from './credentials';

describe('generatePassword', () => {
  it('gera 8 caracteres no formato xxxx-xxxx, sem letras que se confundem', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}$/);
      expect(isValidPassword(p)).toBe(true);
    }
  });
  it('usa o sorteio recebido', () => {
    expect(generatePassword(() => 0)).toBe('aaaa-aaaa');
  });
});

describe('isValidPassword', () => {
  it('exige 8 caracteres', () => {
    expect(isValidPassword('1234567')).toBe(false);
    expect(isValidPassword('12345678')).toBe(true);
  });
});

describe('credentialMessage', () => {
  it('traz link, e-mail e senha', () => {
    const m = credentialMessage({
      appName: 'App',
      url: 'https://x/y/',
      email: 'a@b.com',
      password: 'abcd-efgh',
    });
    expect(m).toContain('Link: https://x/y/');
    expect(m).toContain('E-mail: a@b.com');
    expect(m).toContain('Senha: abcd-efgh');
  });
});
