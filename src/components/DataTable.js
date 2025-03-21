import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import DataForm from './DataForm';
import { generateDocument, saveDocumentToDropbox, getDropboxShareableLink } from '../utils/documentGenerator';
import { generateLabelDocument } from '../utils/labelGenerator';

function DataTable({ data, table, onAdd }) {
    const [documentLinks, setDocumentLinks] = useState({});
    const [labelLinks, setLabelLinks] = useState({});
    const [isTableVisible, setIsTableVisible] = useState(true);

    // Функция для экспорта в Excel
    const exportToExcel = () => {
        const headers = [
            'Наименование', 
            'Внешний вид', 
            'Поставщик', 
            'Производитель',
            'Дата поступления', 
            'Дата проверки', 
            'Номер партии', 
            'Дата изготовления',
            'Срок годности', 
            'Соответствие внешнего вида', 
            'Фактическая масса',
            'Проверяемые показатели', 
            'Результат исследования', 
            'Норматив по паспорту',
            'ФИО', 
            'Комментарий'
        ];
        
        const wsData = [
            headers,
            ...data.map(item => [
                item.name || '',
                item.appearance || '',
                item.supplier || '',
                item.manufacturer || '',
                item.receipt_date ? new Date(item.receipt_date).toLocaleDateString() : '',
                item.check_date ? new Date(item.check_date).toLocaleDateString() : '',
                item.batch_number || '',
                item.manufacture_date ? new Date(item.manufacture_date).toLocaleDateString() : '',
                item.expiration_date || '',
                item.appearance_match || '',
                item.actual_mass || '',
                item.inspected_metrics || '',
                item.investigation_result || '',
                item.passport_standard || '',
                item.full_name || '',
                item.comment || ''
            ])
        ];

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Данные');
        XLSX.writeFile(wb, 'Сырьё.xlsx');
    };

    // Функция для создания акта
    const handleActClick = async (item) => {
        try {
            const docBlob = await generateDocument(item);
            const fileName = `${item.name}_${item.batch_number}.docx`;
            const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;

            // Локальное скачивание
            const url = URL.createObjectURL(docBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();

            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            // Загрузка в Dropbox
            const fileData = await saveDocumentToDropbox(docBlob, fileName, accessToken);
            if (fileData) {
                const shareableLink = await getDropboxShareableLink(fileData.path_lower, accessToken);
                if (shareableLink) {
                    setDocumentLinks(prev => ({
                        ...prev,
                        [item.id]: shareableLink
                    }));
                }
            }
        } catch (error) {
            console.error('Ошибка при создании документа:', error);
            alert('Ошибка при создании документа!');
        }
    };

    // Функция для создания наклейки
    const handleLabelClick = async (item) => {
        try {
            const docBlob = await generateLabelDocument(item);
            const fileName = `${item.name}_${item.batch_number}_label.docx`;
            const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;

            // Локальное скачивание
            const url = URL.createObjectURL(docBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();

            // Загрузка в Dropbox
            const fileData = await saveDocumentToDropbox(docBlob, fileName, accessToken);
            if (fileData) {
                const shareableLink = await getDropboxShareableLink(fileData.path_lower, accessToken);
                if (shareableLink) {
                    setLabelLinks(prev => ({
                        ...prev,
                        [item.id]: shareableLink
                    }));
                }
            }

            // Очистка
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Ошибка при создании этикетки:', error);
            alert('Ошибка генерации этикетки!');
        }
    };

    // Функция для просмотра документа
    const handleViewDocument = (itemId, type = 'act') => {
        const link = type === 'act' ? documentLinks[itemId] : labelLinks[itemId];
        if (link) {
            window.open(link, '_blank');
        } else {
            alert('Документ еще не доступен!');
        }
    };

    // Функция для переключения видимости таблицы
    const toggleTableVisibility = () => {
        setIsTableVisible(!isTableVisible);
    };

    return (
        <div className="table-container">
            <h2>{table === 'raw_materials' ? 'Сырье' : 'Готовая продукция'}</h2>

            {/* Кнопки управления */}
            <div className="controls">
                <button 
                    onClick={toggleTableVisibility}
                    className="toggle-table-button"
                >
                    {isTableVisible ? "Свернуть таблицу" : "Развернуть таблицу"}
                </button>
                
                <button 
                    onClick={exportToExcel}
                    className="export-excel-button"
                >
                    Экспорт в Excel
                </button>
            </div>

            {/* Таблица */}
            {isTableVisible && (
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Наименование</th>
                                <th>Внешний вид</th>
                                <th>Поставщик</th>
                                <th>Производитель</th>
                                <th>Дата поступления</th>
                                <th>Дата проверки</th>
                                <th>Номер партии</th>
                                <th>Дата изготовления</th>
                                <th>Срок годности</th>
                                <th>Соответствие внешнего вида</th>
                                <th>Фактическая масса</th>
                                <th>Проверяемые показатели</th>
                                <th>Результат исследования</th>
                                <th>Норматив по паспорту</th>
                                <th>ФИО</th>
                                <th>Акт</th>
                                <th>Просмотр акта</th>
                                <th>Наклейка</th>
                                <th>Просмотр наклейки</th>
                                <th>Комментарий</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((item) => (
                                <tr key={item.id}>
                                    <td>{item.name}</td>
                                    <td>{item.appearance}</td>
                                    <td>{item.supplier}</td>
                                    <td>{item.manufacturer}</td>
                                    <td>{new Date(item.receipt_date).toLocaleDateString()}</td>
                                    <td>{new Date(item.check_date).toLocaleDateString()}</td>
                                    <td>{item.batch_number}</td>
                                    <td>{new Date(item.manufacture_date).toLocaleDateString()}</td>
                                    <td>{item.expiration_date}</td>
                                    <td>{item.appearance_match}</td>
                                    <td>{item.actual_mass}</td>
                                    <td>{item.inspected_metrics}</td>
                                    <td>{item.investigation_result}</td>
                                    <td>{item.passport_standard}</td>
                                    <td>{item.full_name}</td>
                                    
                                    {/* Кнопки для акта */}
                                    <td>
                                        <button onClick={() => handleActClick(item)}>
                                            Создать акт
                                        </button>
                                    </td>
                                    <td>
                                        <button 
                                            onClick={() => handleViewDocument(item.id, 'act')}
                                            disabled={!documentLinks[item.id]}
                                            className={!documentLinks[item.id] ? "disabled-button" : ""}
                                        >
                                            {documentLinks[item.id] ? "Просмотр" : "Не готово"}
                                        </button>
                                    </td>
                                    
                                    {/* Кнопки для наклейки */}
                                    <td>
                                        <button onClick={() => handleLabelClick(item)}>
                                            Создать наклейку
                                        </button>
                                    </td>
                                    <td>
                                        <button 
                                            onClick={() => handleViewDocument(item.id, 'label')}
                                            disabled={!labelLinks[item.id]}
                                            className={!labelLinks[item.id] ? "disabled-button" : ""}
                                        >
                                            {labelLinks[item.id] ? "Просмотр" : "Не готово"}
                                        </button>
                                    </td>
                                    
                                    <td>{item.comment}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Форма для добавления данных */}
            <div className="input-scroll">
                <DataForm onAdd={onAdd} />
            </div>
        </div>
    );
}

export default DataTable;