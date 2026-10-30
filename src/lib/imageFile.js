// Shrinks a picture so it's cheap to send to a vision model: longest side 1600px, JPEG, white behind transparency.
export async function imageToPart(file, maxSide = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return { mime: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] };
}
