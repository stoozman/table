import { Document, Packer, Paragraph, Table, TableCell, TableRow, BorderStyle, WidthType, AlignmentType, HeadingLevel, TableLayoutType, ImageRun } from 'docx';
import axios from 'axios';

// Создание строк таблицы
const createTableRow = (cells, isHeader = false) => {
    return new TableRow({
        children: cells.map((text, index) => {
            const cellWidths = [10, 40, 25, 25];
            return new TableCell({
                width: { size: cellWidths[index], type: WidthType.PERCENTAGE },
                children: [
                    new Paragraph({
                        text: text || '-',
                        bold: isHeader,
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 50, after: 50 }
                    })
                ]
            });
        })
    });
};

export async function generateDocument(data) {
    try {
        // Загружаем логотип из public (используем fetch)
        let logoBuffer = null;
        try {
            const response = await fetch('/logo.png');
            if (response.ok) {
                logoBuffer = await response.arrayBuffer();
            } else {
                // Если png нет, пробуем jpg
                const jpgResponse = await fetch('/logo.jpg');
                if (jpgResponse.ok) {
                    logoBuffer = await jpgResponse.arrayBuffer();
                }
            }
        } catch (e) {
            logoBuffer = null;
        }

        const children = [];
        if (logoBuffer) {
            children.push(
                new Paragraph({
                    children: [
                        new ImageRun({
                            data: logoBuffer,
                            transformation: { width: 120, height: 48 },
                        })
                    ],
                    alignment: AlignmentType.LEFT,
                    spacing: { after: 200 },
                })
            );
        }

        children.push(
            new Paragraph({
                text: "АКТ",
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                bold: true,
                spacing: { after: 400 }
            })
        );

        children.push(...[
            `Наименование: ${data.name || "Не указано"}`,
            `Поставщик: ${data.supplier || "Не указан"}`,
            `Производитель: ${data.manufacturer || "Не указан"}`,
            `Дата поступления: ${data.receipt_date ? new Date(data.receipt_date).toLocaleDateString() : "Не указана"}`,
            `Дата проверки: ${data.check_date ? new Date(data.check_date).toLocaleDateString() : "Не указана"}`,
            `№ партии: ${data.batch_number || "Не указан"}`,
            `Дата изготовления: ${data.manufacture_date ? new Date(data.manufacture_date).toLocaleDateString() : "Не указана"}`
        ].map(text => new Paragraph({ 
            text, 
            spacing: { after: 100 },
            alignment: AlignmentType.LEFT 
        })));

        children.push(
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                layout: TableLayoutType.FIXED,
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 2, color: "#000000" },
                    bottom: { style: BorderStyle.SINGLE, size: 2, color: "#000000" },
                    left: { style: BorderStyle.SINGLE, size: 2, color: "#000000" },
                    right: { style: BorderStyle.SINGLE, size: 2, color: "#000000" },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "#000000" },
                    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "#000000" },
                },
                rows: [
                    createTableRow(["№ п/п", "Наименование показателя", "Норма", "Факт"], true),
                    createTableRow([
                        "1.",
                        "Внешний вид",
                        data.appearance || "Стандартный",
                        data.appearance_match || "Соответствует"
                    ]),
                    createTableRow([
                        "2.",
                        "Показатели безопасности",
                        data.inspected_metrics || "-",
                        data.investigation_result || "-"
                    ])
                ]
            })
        );

        children.push(
            new Paragraph({
                text: "Заведующий лаборатории: _________________________________Гадзиковский С.В.",
                spacing: { before: 400 },
                alignment: AlignmentType.LEFT
            })
        );

        const doc = new Document({
            sections: [{
                properties: { 
                    page: { 
                        margin: { top: 1000 },
                        size: { width: 11906, height: 16838, orientation: 'portrait' }
                    } 
                },
                children
            }]
        });

        return await Packer.toBlob(doc);
    } catch (error) {
        console.error('Ошибка генерации документа:', error);
        throw new Error('Не удалось создать документ');
    }
}

export async function saveDocumentToDropbox(fileBlob, path, accessToken) {
    // Убираем начальный слеш, если он есть
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    
    const response = await axios.post(
        'https://content.dropboxapi.com/2/files/upload',
        fileBlob,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/octet-stream',
                'Dropbox-API-Arg': JSON.stringify({
                    path: `/${cleanPath}`,
                    mode: 'overwrite'
                })
            }
        }
    );
    return response.data;
}

export async function getDropboxShareableLink(filePath, accessToken) {
    // Убираем начальный слеш, если он есть
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

    try {
        // Первый способ - создание новой общей ссылки
        const createResponse = await axios.post(
            'https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings',
            { 
                path: `/${cleanPath}`, 
                settings: { 
                    requested_visibility: 'public',
                    audience: 'public'
                } 
            },
            { 
                headers: { 
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                } 
            }
        );
        
        return createResponse.data.url.replace('?dl=0', '?raw=1');

    } catch (error) {
        // Если ошибка связана с существованием ссылки
        if (error.response && error.response.data.error_summary.includes('shared_link_already_exists')) {
            try {
                // Получаем существующую ссылку
                const listResponse = await axios.post(
                    'https://api.dropboxapi.com/2/sharing/list_shared_links',
                    { 
                        path: `/${cleanPath}`,
                        direct_only: true
                    },
                    { 
                        headers: { 
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        } 
                    }
                );
                
                const existingLink = listResponse.data.links?.[0]?.url;
                return existingLink ? existingLink.replace('?dl=0', '?raw=1') : null;

            } catch (listError) {
                console.error('Ошибка получения существующей ссылки:', listError.response ? listError.response.data : listError.message);
                
                // Возвращаем исходную ссылку, если не удалось получить новую
                return `https://www.dropbox.com/scl/fi/${cleanPath}`.replace('?dl=0', '?raw=1');
            }
        }

        // Для других типов ошибок
        console.error('Ошибка создания общей ссылки:', error.response ? error.response.data : error.message);
        throw new Error('Не удалось создать общедоступную ссылку');
    }
}

export async function deleteDocumentFromDropbox(filePath, accessToken) {
    // Убираем начальный слеш, если он есть
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

    try {
        const response = await axios.post(
            'https://api.dropboxapi.com/2/files/delete_v2',
            { 
                path: `/${cleanPath}`
            },
            { 
                headers: { 
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                } 
            }
        );
        
        return true; // Возвращаем true, если удаление успешно
    } catch (error) {
        console.error('Ошибка удаления файла из Dropbox:', error.response ? error.response.data : error.message);
        return false; // Возвращаем false в случае ошибки
    }
}