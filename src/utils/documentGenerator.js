import { Document, Packer, Paragraph, Table, TableCell, TableRow, BorderStyle, WidthType, AlignmentType, HeadingLevel, TableLayoutType, Header } from 'docx';
import axios from 'axios';

export async function generateDocument(data) {
    const doc = new Document({
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: 1000, // Увеличенный верхний отступ для размещения колонтитула
                        }
                    }
                },
                
                children: [
                    // Пустые параграфы для отступа сверху
                    new Paragraph({
                        text: "",
                        spacing: {
                            after: 200,
                        },
                    }),
                    new Paragraph({
                        text: "",
                        spacing: {
                            after: 200,
                        },
                    }),

                    // Заголовок "АКТ"
                    new Paragraph({
                        text: "АКТ",
                        heading: HeadingLevel.HEADING_1,
                        alignment: AlignmentType.CENTER,
                        bold: true,
                        spacing: {
                            after: 200,
                        },
                    }),

                    // Данные в виде текста вместо первой таблицы
                    new Paragraph({
                        text: `Наименование: ${data.name || ""}`,
                        spacing: { after: 100 },
                    }),
                    new Paragraph({
                        text: `Поставщик: ${data.supplier || ""}`,
                        spacing: { after: 100 },
                    }),
                    new Paragraph({
                        text: `Производитель: ${data.manufacturer || ""}`,
                        spacing: { after: 100 },
                    }),
                    new Paragraph({
                        text: `Дата поступления: ${data.receipt_date ? new Date(data.receipt_date).toLocaleDateString() : ""}`,
                        spacing: { after: 100 },
                    }),
                    new Paragraph({
                        text: `Дата проверки: ${data.check_date ? new Date(data.check_date).toLocaleDateString() : ""}`,
                        spacing: { after: 100 },
                    }),
                    new Paragraph({
                        text: `№ партии: ${data.batch_number || ""}`,
                        spacing: { after: 100 },
                    }),
                    new Paragraph({
                        text: `Дата изготовления: ${data.manufacture_date ? new Date(data.manufacture_date).toLocaleDateString() : ""}`,
                        spacing: { after: 100 },
                    }),

                    // Результаты проверки
                    new Paragraph({
                        text: "Результаты проверки:",
                        bold: true,
                        spacing: {
                            before: 400,
                            after: 200,
                        },
                    }),

                    // Вторая таблица результатов остается без изменений
                    new Table({
                        width: {
                            size: 100,
                            type: WidthType.PERCENTAGE,
                        },
                        layout: TableLayoutType.FIXED,
                        borders: {
                            top: { style: BorderStyle.SINGLE, size: 1, color: "#000000" },
                            bottom: { style: BorderStyle.SINGLE, size: 1, color: "#000000" },
                            left: { style: BorderStyle.SINGLE, size: 1, color: "#000000" },
                            right: { style: BorderStyle.SINGLE, size: 1, color: "#000000" },
                            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "#000000" },
                            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "#000000" },
                        },
                        rows: [
                            // Заголовок таблицы
                            new TableRow({
                                children: [
                                    new TableCell({
                                        width: {
                                            size: 10,
                                            type: WidthType.PERCENTAGE,
                                        },
                                        children: [new Paragraph({
                                            text: "№ п/п",
                                            bold: true,
                                            alignment: AlignmentType.CENTER,
                                            spacing: { before: 50, after: 50 },
                                        })],
                                    }),
                                    new TableCell({
                                        width: {
                                            size: 40,
                                            type: WidthType.PERCENTAGE,
                                        },
                                        children: [new Paragraph({
                                            text: "Наименование показателя",
                                            bold: true,
                                            alignment: AlignmentType.CENTER,
                                            spacing: { before: 50, after: 50 },
                                        })],
                                    }),
                                    new TableCell({
                                        width: {
                                            size: 25,
                                            type: WidthType.PERCENTAGE,
                                        },
                                        children: [new Paragraph({
                                            text: "Норма",
                                            bold: true,
                                            alignment: AlignmentType.CENTER,
                                            spacing: { before: 50, after: 50 },
                                        })],
                                    }),
                                    new TableCell({
                                        width: {
                                            size: 25,
                                            type: WidthType.PERCENTAGE,
                                        },
                                        children: [new Paragraph({
                                            text: "Факт",
                                            bold: true,
                                            alignment: AlignmentType.CENTER,
                                            spacing: { before: 50, after: 50 },
                                        })],
                                    }),
                                ],
                            }),
                            // Строка 1 - Внешний вид
                            new TableRow({
                                children: [
                                    new TableCell({
                                        width: {
                                            size: 10,
                                            type: WidthType.PERCENTAGE,
                                        },
                                        children: [new Paragraph({
                                            text: "1.",
                                            spacing: { before: 50, after: 50 },
                                        })],
                                    }),
                                    new TableCell({
                                        width: {
                                            size: 40,
                                            type: WidthType.PERCENTAGE,
                                        },
                                        children: [new Paragraph({
                                            text: "Внешний вид",
                                            spacing: { before: 50, after: 50 },
                                        })],
                                    }),
                                    new TableCell({
                                        width: {
                                            size: 25,
                                            type: WidthType.PERCENTAGE,
                                        },
                                        children: [new Paragraph({
                                            text: data.appearance || "", // Используем значение из data.appearance
                                            spacing: { before: 50, after: 50 },
                                        })],
                                    }),
                                    new TableCell({
                                        width: {
                                            size: 25,
                                            type: WidthType.PERCENTAGE,
                                        },
                                        children: [new Paragraph({
                                            text: data.appearance_match || "Соотв.",
                                            spacing: { before: 50, after: 50 },
                                        })],
                                    }),
                                ],
                            }),
                            // Строка 2 - Проверяемые показатели
                            new TableRow({
                                children: [
                                    new TableCell({
                                        width: {
                                            size: 10,
                                            type: WidthType.PERCENTAGE,
                                        },
                                        children: [new Paragraph({
                                            text: "2.",
                                            spacing: { before: 50, after: 50 },
                                        })],
                                    }),
                                    new TableCell({
                                        width: {
                                            size: 40,
                                            type: WidthType.PERCENTAGE,
                                        },
                                        children: [new Paragraph({
                                            text: data.inspected_metrics || "",
                                            spacing: { before: 50, after: 50 },
                                        })],
                                    }),
                                    new TableCell({
                                        width: {
                                            size: 25,
                                            type: WidthType.PERCENTAGE,
                                        },
                                        children: [new Paragraph({
                                            text: data.passport_standard || "",
                                            spacing: { before: 50, after: 50 },
                                        })],
                                    }),
                                    new TableCell({
                                        width: {
                                            size: 25,
                                            type: WidthType.PERCENTAGE,
                                        },
                                        children: [new Paragraph({
                                            text: data.investigation_result || "",
                                            spacing: { before: 50, after: 50 },
                                        })],
                                    }),
                                ],
                            }),
                        ],
                    }),

                    // Подпись
                    new Paragraph({
                        text: "Заведующий лаборатории: _________________________________Гадзиковский С.В.",
                        spacing: {
                            before: 400,
                        },
                    }),
                ],
            },
        ],
    });

    // Заменяем Buffer на Blob для работы в браузере
    return Packer.toBlob(doc);
}

export async function saveDocumentToDropbox(fileBlob, fileName, accessToken) {
    const url = 'https://content.dropboxapi.com/2/files/upload';
    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
            path: `/${fileName}`,
            mode: 'add',
            autorename: true,
            mute: false
        })
    };

    try {
        const response = await axios.post(url, fileBlob, { headers: headers });
        console.log('File uploaded successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error uploading file:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Добавляем новую функцию для получения общедоступной ссылки на файл из Dropbox
export async function getDropboxShareableLink(filePath, accessToken) {
    try {
        const response = await axios({
            method: 'POST',
            url: 'https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            data: {
                path: filePath,
                settings: {
                    requested_visibility: "public",
                    audience: "public",
                    access: "viewer"
                }
            }
        });

        if (response.data && response.data.url) {
            console.log('Shared link created:', response.data.url);
            return response.data.url;
        }

        return null;
    } catch (error) {
        // Проверка на случай, если ссылка уже существует
        if (error.response &&
            error.response.data &&
            error.response.data.error &&
            error.response.data.error['.tag'] === 'shared_link_already_exists') {

            try {
                // Получаем существующие ссылки
                const existingLinksResponse = await axios({
                    method: 'POST',
                    url: 'https://api.dropboxapi.com/2/sharing/list_shared_links',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    data: {
                        path: filePath
                    }
                });

                if (existingLinksResponse.data &&
                    existingLinksResponse.data.links &&
                    existingLinksResponse.data.links.length > 0) {
                    console.log('Found existing shared link:', existingLinksResponse.data.links[0].url);
                    return existingLinksResponse.data.links[0].url;
                }
            } catch (listError) {
                console.error('Ошибка при получении существующих ссылок:', listError);
            }
        }

        console.error('Ошибка при создании общедоступной ссылки:', error.response ? error.response.data : error.message);
        return null;
    }
}