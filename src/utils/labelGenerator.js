import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  AlignmentType 
} from 'docx';

// Этот файл больше не нужен для генерации этикетки с QR-кодом — генерация происходит на сервере.
// Можно оставить только экспорт-заглушку, если где-то есть старые импорты.

// Функция для преобразования dataURL в Uint8Array через base64
async function dataURLtoUint8ArrayAsync(dataurl) {
  return new Promise((resolve, reject) => {
    try {
      const arr = dataurl.split(',');
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while(n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      resolve(u8arr);
    } catch (err) {
      reject(err);
    }
  });
}

export async function generateLabelDocument(data) {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 500,
              bottom: 500,
              left: 500,
              right: 500,
            }
          }
        },
        children: [
          new Paragraph({
            text: "Арбитражный образец сырья",
            bold: true,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          createField("Наименование:", data.name),
          createField("Производитель:", data.manufacturer),
          createField("Поставщик:", data.supplier),
          new Paragraph({
            text: `Дата производства: ${formatDate(data.manufacture_date)}`,
            spacing: { after: 200 },
          }),
          new Paragraph({
            text: `№ партии ${data.batch_number || "___________"}`,
            spacing: { after: 200 },
          }),
          new Paragraph({
            text: `Дата поставки: ${formatDate(data.receipt_date)}    дата проверки: ${formatDate(data.check_date)}`,
            spacing: { after: 200 },
          }),
          createField("Образец отобрал:", data.full_name),
          new Paragraph({
            text: `Дата отбора: ${formatDate(data.check_date)}    Хранить до: ${formatDate(data.expiration_date)}`,
            spacing: { after: 200 },
          }),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}

// Вспомогательные функции
function createField(label, value) {
  return new Paragraph({
    children: [
      new TextRun({
        text: `${label} `,
        bold: true,
      }),
      new TextRun({
        text: value || "_________________________",
        underline: {},
      }),
    ],
    spacing: { after: 200 },
  });
}

function formatDate(dateString) {
  if (!dateString) return "__________";
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU');
}