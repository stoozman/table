import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import DataForm from './DataForm';
import { generateDocument, saveDocumentToDropbox, getDropboxShareableLink } from '../utils/documentGenerator';
import { generateLabelDocument } from '../utils/labelGenerator';
import useTableSearch from '../hooks/useTableSearch';
import SearchControls from './SearchControls';

function DataTable({ data, table, onAdd, onEdit, onDelete }) {
    const [documentLinks, setDocumentLinks] = useState({});
    const [labelLinks, setLabelLinks] = useState({});
    const [isTableVisible, setIsTableVisible] = useState(true);
    const [isSearchVisible, setIsSearchVisible] = useState(true); // По умолчанию панель поиска видима
    const [editingItem, setEditingItem] = useState(null);

    // Логика поиска
    const { searchParams, filteredData, handleSearchChange } = useTableSearch(data);

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
            ...filteredData.map(item => [
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
    
            // Загрузка в Dropbox и получение публичной ссылки
            const fileData = await saveDocumentToDropbox(docBlob, fileName, accessToken);
            if (fileData) {
                const shareableLink = await getDropboxShareableLink(fileData.path_lower, accessToken);
                if (shareableLink) {
                    // Обновление состояния компонента
                    setDocumentLinks(prev => ({
                        ...prev,
                        [item.id]: shareableLink
                    }));
    
                    // Обновление записи в базе данных
                    await supabase
                        .from(table)
                        .update({ act_link: shareableLink }) // Имя поля в вашей БД может отличаться
                        .eq('id', item.id);
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
    const item = filteredData.find(item => item.id === itemId);
    if (item) {
        if (type === 'act' && item.act_link) {
            window.open(item.act_link, '_blank');
        } else if (type === 'label' && item.label_link) {
            window.open(item.label_link, '_blank');
        } else {
            alert('Документ еще не доступен!');
        }
    }
};

    // Функция для переключения видимости таблицы
    const toggleTableVisibility = () => {
        setIsTableVisible(!isTableVisible);
    };

    // Функция для переключения видимости панели поиска
    const toggleSearchVisibility = () => {
        setIsSearchVisible(prevState => !prevState);
        console.log("Search visibility toggled:", !isSearchVisible); // Отладочный вывод
    };

    // Функция для редактирования
    const handleEdit = (item) => {
        setEditingItem(item);
    };

    // Функция для удаления
    const handleDelete = (id) => {
        onDelete(id);
    };

    // Добавим функцию для сброса фильтров
    const resetFilters = () => {
        // Здесь мы сбрасываем все поля поиска
        const emptyParams = Object.keys(searchParams).reduce((acc, key) => {
            acc[key] = '';
            return acc;
        }, {});
        
        Object.keys(emptyParams).forEach(key => {
            handleSearchChange({ target: { name: key, value: '' } });
        });
    };

    return (
        <div className="table-container">
            <h2>{table === 'raw_materials' ? 'Сырье' : 'Готовая продукция'}</h2>

            {/* Кнопки управления */}
            <div className="controls" style={{ 
                display: 'flex', 
                gap: '10px', 
                marginBottom: '10px',
                flexWrap: 'wrap'
            }}>
                <button
                    onClick={toggleSearchVisibility}
                    className="toggle-search-button"
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    {isSearchVisible ? "Скрыть поиск" : "Показать поиск"}
                </button>

                <button
                    onClick={toggleTableVisibility}
                    className="toggle-table-button"
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#2196F3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    {isTableVisible ? "Свернуть таблицу" : "Развернуть таблицу"}
                </button>

                <button
                    onClick={exportToExcel}
                    className="export-excel-button"
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#ff9800',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Экспорт в Excel
                </button>
            </div>

            {/* Поля для поиска с проверкой isSearchVisible */}
            {isSearchVisible && (
                <div>
                    <SearchControls 
                        searchParams={searchParams} 
                        handleSearchChange={handleSearchChange} 
                        isVisible={true} // Всегда true, т.к. мы уже проверили isSearchVisible выше
                    />
                    <div style={{ 
                        display: 'flex', 
                        justifyContent: 'flex-end', 
                        marginTop: '10px',
                        marginBottom: '10px'
                    }}>
                        <button
                            onClick={resetFilters}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Сбросить фильтры
                        </button>
                    </div>
                </div>
            )}

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
                                
                                <th>Комментарий</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.map((item) => (
                                <tr key={item.id}>
                                    <td>{item.name}</td>
                                    <td>{item.appearance}</td>
                                    <td>{item.supplier}</td>
                                    <td>{item.manufacturer}</td>
                                    <td>{item.receipt_date ? new Date(item.receipt_date).toLocaleDateString() : '-'}</td>
                                    <td>{item.check_date ? new Date(item.check_date).toLocaleDateString() : '-'}</td>
                                    <td>{item.batch_number}</td>
                                    <td>{item.manufacture_date ? new Date(item.manufacture_date).toLocaleDateString() : '-'}</td>
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
        disabled={!item.act_link} // Предполагается, что в данных есть поле act_link
        style={{ 
            padding: '4px 8px',
            backgroundColor: item.act_link ? '#28a745' : '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: item.act_link ? 'pointer' : 'not-allowed'
        }}
    >
        {item.act_link ? "Просмотр" : "Не готово"}
    </button>
</td>

                                    {/* Кнопки для наклейки */}
                                    <td>
                                        <button onClick={() => handleLabelClick(item)}>
                                            Создать наклейку
                                        </button>
                                    </td>
                                    

                                    <td>{item.comment}</td>
                                    <td>
                                        <button onClick={() => handleEdit(item)}>Редактировать</button>
                                        <button onClick={() => handleDelete(item.id)}>Удалить</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Форма для добавления данных */}
            <div className="input-scroll">
                <DataForm onAdd={onAdd} onEdit={onEdit} editingItem={editingItem} />
            </div>
        </div>
    );
}

export default DataTable;