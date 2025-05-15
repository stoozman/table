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

// Преобразует объект в JSON с ASCII-escape не-ASCII символов (для Dropbox-API-Arg)
function toAsciiJson(obj) {
    return JSON.stringify(obj).replace(/[\u007F-\uFFFF]/g, function(chr) {
        return '\\u' + ('0000' + chr.charCodeAt(0).toString(16)).slice(-4);
    });
}

export async function saveDocumentToDropbox(fileBlob, path, accessToken) {
    // Убираем начальный слеш, если он есть
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const dropboxPath = `/${cleanPath}`;
    console.log('[DROPBOX UPLOAD] path:', dropboxPath);
    try {
        const response = await axios.post(
            'https://content.dropboxapi.com/2/files/upload',
            fileBlob,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/octet-stream',
                    'Dropbox-API-Arg': toAsciiJson({
                        path: dropboxPath,
                        mode: 'overwrite'
                    })
                }
            }
        );
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 409) {
            console.error('[DROPBOX UPLOAD] 409 Conflict! path:', dropboxPath, 'error:', error.response.data);
            alert('Ошибка Dropbox: 409 Conflict при загрузке файла!\n' +
                  'Путь: ' + dropboxPath + '\n' +
                  'Возможно, файл заблокирован, путь некорректен или есть конфликт версий.');
        } else {
            console.error('[DROPBOX UPLOAD] Ошибка загрузки файла:', error.response ? error.response.data : error.message);
        }
        throw error;
    }
}

export async function getDropboxShareableLink(filePath, accessToken) {
    // Убираем начальный слеш, если он есть
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

    try {
        // Получаем temporary link
        const response = await axios.post(
            'https://api.dropboxapi.com/2/files/get_temporary_link',
            { path: `/${cleanPath}` },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data.link;
    } catch (error) {
        console.error('Ошибка получения temporary link из Dropbox:', error.response ? error.response.data : error.message);
        throw new Error('Не удалось получить временную ссылку Dropbox');
    }
}


export async function createDropboxFolder(path, accessToken) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    try {
        await axios.post(
            'https://api.dropboxapi.com/2/files/create_folder_v2',
            { path: cleanPath, autorename: false },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch (error) {
        // Если папка уже есть — не ошибка
        if (!(error.response && error.response.data && error.response.data.error_summary && error.response.data.error_summary.startsWith('path/conflict/folder'))) {
            console.error('Ошибка создания папки Dropbox:', error.response ? error.response.data : error.message);
        }
    }
}

export async function listDropboxFiles(path, accessToken) {
    // Получить список файлов в папке Dropbox
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    try {
        const response = await axios.post(
            'https://api.dropboxapi.com/2/files/list_folder',
            {
                path: cleanPath === '/' ? '' : cleanPath,
                recursive: false
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data.entries;
    } catch (error) {
        console.error('Ошибка получения списка файлов Dropbox:', error.response ? error.response.data : error.message);
        return [];
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