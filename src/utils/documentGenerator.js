import { Document, Packer, Paragraph, Table, TableCell, TableRow, BorderStyle, WidthType, AlignmentType, HeadingLevel, TableLayoutType, ImageRun } from 'docx';
import axios from 'axios';
import supabase from '../supabase';

// Аккуратное форматирование полей для документа (избегаем отображения [] и сырых JSON-строк)
const formatDocField = (v) => {
    if (v == null) return '-';
    // Если массив
    if (Array.isArray(v)) {
        if (v.length === 0) return '-';
        // Преобразуем элементы в строки
        return v.map(x => {
            if (x == null) return '';
            if (typeof x === 'object') {
                // попытаемся взять понятное поле
                return x.name || x.link || JSON.stringify(x);
            }
            return String(x);
        }).filter(Boolean).join(', ');
    }
    // Строки: пробуем распарсить JSON, иначе чистим скобки
    let s = String(v).trim();
    if (!s) return '-';
    // Попробуем распарсить JSON (например, '[]', '["a","b"]').
    try {
        const parsed = JSON.parse(s);
        return formatDocField(parsed);
    } catch (_) {
        // не JSON — продолжаем
    }
    // Если выглядит как массив в строке
    if (s === '[]') return '-';
    if (s.startsWith('[') && s.endsWith(']')) {
        const inner = s.slice(1, -1).trim();
        if (!inner) return '-';
        const parts = inner
            .split(',')
            .map(p => p.replace(/^\s*["']?|["']?\s*$/g, '').trim())
            .filter(Boolean);
        return parts.length ? parts.join(', ') : '-';
    }
    return s;
};

// Создание строк таблицы
const createTableRow = (cells, isHeader = false) => {
    return new TableRow({
        children: cells.map((text, index) => {
            const cellWidths = [10, 40, 25, 25];
            return new TableCell({
                width: { size: cellWidths[index], type: WidthType.PERCENTAGE },
                children: [
                    new Paragraph({
                        text: formatDocField(text),
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
                        formatDocField(data.inspected_metrics),
                        formatDocField(data.investigation_result)
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

// Удалены все функции Dropbox и их импорты. Используйте Supabase аналоги ниже.

// --- SUPABASE STORAGE ANALOGS ---

// Сохранить файл в Supabase Storage
export async function saveDocumentToSupabase(file, path, bucket = 'documents') {
    // path: путь внутри бакета, например 'unsigned/filename.pdf'
    const { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) throw error;
    return data;
}

// Получить публичную ссылку на файл в Supabase Storage
export function getSupabasePublicUrl(path, bucket = 'documents') {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
}

// Удалить файл из Supabase Storage
export async function deleteDocumentFromSupabase(path, bucket = 'documents') {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) throw error;
    return true;
}

// Получить список файлов в папке Supabase Storage
export async function listSupabaseFiles(folder = '', bucket = 'documents') {
    const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 100, offset: 0 });
    if (error) throw error;
    return data;
}

// Создать "папку" в Supabase Storage (фактически, просто заглушка)
export async function createSupabaseFolder(folder, bucket = 'documents') {
    // В Supabase Storage папки создаются автоматически при загрузке файла
    return true;
}