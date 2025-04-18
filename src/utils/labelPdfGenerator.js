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
  let y = 8;

  // Загрузка шрифта Roboto
  const fontUrl = robotoFont;
  const fontBuffer = await fetch(fontUrl).then(r => r.arrayBuffer());
  const fontBase64 = btoa(String.fromCharCode(...new Uint8Array(fontBuffer)));
  doc.addFileToVFS('Roboto.ttf', fontBase64);
  doc.addFont('Roboto.ttf', 'Roboto', 'normal');
  doc.setFont('Roboto');

  doc.setFontSize(13);
  doc.text('Арбитражный образец сырья', 40, y, { align: 'center' });
  y += 7;

  // QR-код
  const qrData = String(data.id); // Можно заменить на ссылку или другой уникальный текст
  const qrUrl = await QRCode.toDataURL(qrData, { margin: 1, width: 80 });
  doc.addImage(qrUrl, 'PNG', 5, y, 22, 22);
  doc.setFontSize(9);
  doc.text(`ID: ${data.id}`, 40, y + 7, { align: 'center' });
  y += 24;

  doc.setFontSize(10);
  function field(label, value) {
    doc.text(`${label} ${value || '__________'}`, 30, y);
    y += 5;
  }

  field('Наименование:', data.name);
  field('Производитель:', data.manufacturer);
  field('Поставщик:', data.supplier);
  field('Дата производства:', formatDate(data.manufacture_date));
  field('№ партии:', data.batch_number);
  field('Дата поставки:', formatDate(data.receipt_date));
  field('Дата проверки:', formatDate(data.check_date));
  field('Образец отобрал:', data.full_name);
  field('Дата отбора:', formatDate(data.check_date));
  field('Хранить до:', formatDate(data.expiration_date));

  return doc.output('blob');
}

function formatDate(dateString) {
  if (!dateString) return '__________';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU');
}
