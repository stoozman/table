import QRCode from 'qrcode';

// Возвращает dataURL JPEG-картинки QR-кода для заданного текста
export async function generateQRDataUrl(text) {
  try {
    // Используем тип 'image/jpeg' вместо PNG
    return await QRCode.toDataURL(text, { margin: 1, width: 200, type: 'image/jpeg' });
  } catch (err) {
    console.error('Ошибка генерации QR:', err);
    return null;
  }
}
