/** Center-crop a photo to a square JPEG. Canvas output has no EXIF. */
export async function squareJpeg(file: File, size = 256): Promise<Blob> {
  if (file.size > 12 * 1024 * 1024) throw new Error('too_large');
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const side = Math.min(bmp.width, bmp.height);
    if (!side) throw new Error('encode');
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('encode');
    ctx.drawImage(bmp, Math.floor((bmp.width - side) / 2), Math.floor((bmp.height - side) / 2), side, side, 0, 0, size, size);
    const blob = await new Promise<Blob | null>(res => c.toBlob(b => res(b), 'image/jpeg', 0.85));
    if (!blob) throw new Error('encode');
    return blob;
  } finally { bmp.close(); }
}
