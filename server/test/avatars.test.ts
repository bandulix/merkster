import { describe, expect, it } from 'vitest';
import { keepUserAvatar, pictureAllowed, prepareAvatarUpload, sizedPictureUrl } from '../src/avatars';

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
  it('keeps a picture the student chose or removed', () => {
    expect(keepUserAvatar(true)).toBe(true);
    expect(keepUserAvatar(false)).toBe(false);
    expect(keepUserAvatar(null)).toBe(false);
    expect(keepUserAvatar(undefined)).toBe(false);
  });
  it('accepts a jpeg and drops embedded metadata', () => {
    const gps = Buffer.from('GPS latitude SECRET_LOCATION');
    const app = Buffer.concat([Buffer.from([0xff, 0xe1, (gps.length + 2) >> 8, (gps.length + 2) & 0xff]), gps]);
    const rest = Buffer.concat([Buffer.from([0xff, 0xda]), Buffer.alloc(40, 7)]);
    const raw = Buffer.concat([Buffer.from([0xff, 0xd8]), app, rest]);
    const out = prepareAvatarUpload(raw);
    expect(out?.type).toBe('image/jpeg');
    expect(out?.etag).toMatch(/^[a-f0-9]{16}$/);
    expect(out!.bytes.includes(Buffer.from('SECRET_LOCATION'))).toBe(false);
    expect(out!.bytes[0]).toBe(0xff);
    expect(out!.bytes[1]).toBe(0xd8);
  });
  it('refuses a file that is not a still photo', () => {
    expect(prepareAvatarUpload(Buffer.alloc(64, 1))).toBeNull();
    expect(prepareAvatarUpload(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(40, 2)]))).toBeNull();
    expect(prepareAvatarUpload(Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(8)]))).toBeNull();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    expect(prepareAvatarUpload(png)?.type).toBe('image/png');
  });
});
