import { describe, it, expect } from 'vitest';
import { authMessage, passwordStrength, safeReturnTo } from '@/lib/auth';

describe('auth rules', () => {
  it('passwords shorter than 8 characters are rejected', () => { expect(passwordStrength('abc1234').score).toBe(0); expect(passwordStrength('abcd1234').score).toBeGreaterThan(0); });
  it('unverified email gets a clear message', () => { expect(authMessage({ message: 'Email not confirmed', code: 'email_not_confirmed' })).toMatch(/verify your email/); });
  it('wrong password gets a clear message', () => { expect(authMessage({ message: 'Invalid login credentials', code: 'invalid_credentials' })).toBe('Wrong email or password.'); });
  it('too many attempts gets a clear message', () => { expect(authMessage({ message: 'x', status: 429 })).toMatch(/Too many attempts/); });
  it('return-to only allows same-app paths', () => {
    expect(safeReturnTo('/forex')).toBe('/forex');
    expect(safeReturnTo('https://evil.com')).toBe('/terminal');
    expect(safeReturnTo('//evil.com')).toBe('/terminal');
    expect(safeReturnTo(undefined)).toBe('/terminal');
  });
});
