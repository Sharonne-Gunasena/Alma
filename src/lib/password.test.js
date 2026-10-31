import { describe, expect, it } from 'vitest';
import { passwordStrength } from './password.js';

describe('passwordStrength', () => {
  it('rejects short passwords', () => {
    expect(passwordStrength('abc123').score).toBe(0);
  });

  it('rejects common passwords and repeated characters', () => {
    expect(passwordStrength('Password123').score).toBe(0);
    expect(passwordStrength('aaaaaaaaaa').score).toBe(0);
  });

  it('rejects passwords that contain the email name', () => {
    expect(passwordStrength('sharonne2026!', 'sharonne@example.com').score).toBe(0);
  });

  it('grades by length and variety', () => {
    expect(passwordStrength('studying').score).toBe(1);
    expect(passwordStrength('Studying7!').score).toBe(3);
    expect(passwordStrength('studyinghard').score).toBe(2);
    expect(passwordStrength('correct horse battery').score).toBe(3);
  });
});
