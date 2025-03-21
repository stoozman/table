import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  AlignmentType 
} from 'docx';

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
          // Заголовок
          new Paragraph({
            text: "Арбитражный образец сырья",
            bold: true,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          // Наименование
          createField("Наименование:", data.name),
          
          // Производитель
          createField("Производитель:", data.manufacturer),
          
          // Поставщик
          createField("Поставщик:", data.supplier),

          // Дата производства и номер партии
          new Paragraph({
            text: `Дата производства: ${formatDate(data.manufacture_date)}`,
            spacing: { after: 200 },
          }),
          new Paragraph({
            text: `№ партии ${data.batch_number || "___________"}`,
            spacing: { after: 200 },
          }),

          // Даты поставки и проверки
          new Paragraph({
            text: `Дата поставки: ${formatDate(data.receipt_date)}    дата проверки: ${formatDate(data.check_date)}`,
            spacing: { after: 200 },
          }),

          // Ответственное лицо
          createField("Образец отобрал:", data.full_name),

          // Даты отбора и хранения
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