import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import robotoFont from './fonts/ofont.ru_Roboto.ttf';

/**
 * Генерирует PDF-этикетку с QR-кодом и всеми полями, как в docx.
 * @param {Object} data - объект строки таблицы
 * @returns {Promise<Blob>} - PDF-файл как Blob
 */
export async function generateLabelPdf(data) {
  const doc = new jsPDF({ unit: 'mm', format: [80, 60] }); // размер этикетки
  let y = 7;

  // Загрузка шрифта Roboto
  const fontUrl = robotoFont;
  const fontBuffer = await fetch(fontUrl).then(r => r.arrayBuffer());
  const fontBase64 = btoa(String.fromCharCode(...new Uint8Array(fontBuffer)));
  doc.addFileToVFS('Roboto.ttf', fontBase64);
  doc.addFont('Roboto.ttf', 'Roboto', 'normal');
  doc.setFont('Roboto');

  doc.setFontSize(10);
  doc.text('Арбитражный образец', 40, y, { align: 'center' });
  y += 5;

  // QR-код
  const qrData = String(data.id); // Можно заменить на ссылку или другой уникальный текст
  const qrUrl = await QRCode.toDataURL(qrData, { margin: 0, width: 56 }); // 14 мм при 300 dpi
  doc.addImage(qrUrl, 'PNG', 4, y, 14, 14);
  // Убрали вывод ID на наклейке
  y += 15;

  // Компактная функция вывода полей
  function field(label, value) {
    doc.setFontSize(6);
    const text = `${label} ${value || '__________'}`;
    const lines = doc.splitTextToSize(text, 34); // ширина 34 мм
    doc.text(lines, 22, y);
    y += lines.length * 2.9 + 0.3;
  }

  field('Наим.:', data.name);
  field('Изг.:', data.manufacturer);
  field('Пост.:', data.supplier);
  field('Изг. дата:', formatDate(data.manufacture_date));
  field('Партия:', data.batch_number);
  field('Поставка:', formatDate(data.receipt_date));
  field('Годен до:', formatDate(data.expiration_date));

  return doc.output('blob');
}

function formatDate(dateString) {
  if (!dateString) return '__________';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU');
}
