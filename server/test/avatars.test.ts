import { describe, expect, it } from 'vitest';
import { pictureAllowed, sizedPictureUrl } from '../src/avatars';

describe('profile pictures', () => {
  it('asks Google for a 256 px square', () => {
    expect(sizedPictureUrl('https://lh3.googleusercontent.com/a/ACg8ocK=s96-c')).toBe('https://lh3.googleusercontent.com/a/ACg8ocK=s256-c');
    expect(sizedPictureUrl('https://lh3.googleusercontent.com/a-/AOh14Gj=s96')).toBe('https://lh3.googleusercontent.com/a-/AOh14Gj=s256-c');
    expect(sizedPictureUrl('https://lh3.googleusercontent.com/a/XYZ')).toBe('https://lh3.googleusercontent.com/a/XYZ=s256-c');
  });
  it('only downloads from Google (or the mock provider in test mode)', () => {
    const prod = { google: { testIssuer: false, issuer: 'https://accounts.google.com' } } as never;
    const test = { google: { testIssuer: true, issuer: 'http://localhost:9090' } } as never;
    expect(pictureAllowed('https://lh3.googleusercontent.com/a/x=s256-c', prod)).toBe(true);
    expect(pictureAllowed('http://lh3.googleusercontent.com/a/x', prod)).toBe(false);
    expect(pictureAllowed('https://evil.com/googleusercontent.com/x', prod)).toBe(false);
    expect(pictureAllowed('https://googleusercontent.com.evil.com/x', prod)).toBe(false);
    expect(pictureAllowed('http://169.254.169.254/latest', prod)).toBe(false);
    expect(pictureAllowed('http://localhost:9090/avatar/abc=s256-c', prod)).toBe(false);
    expect(pictureAllowed('http://localhost:9090/avatar/abc=s256-c', test)).toBe(true);
  });
});
