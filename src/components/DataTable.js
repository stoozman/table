import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import DataForm from './DataForm';
import { 
    generateDocument, 
    saveDocumentToDropbox, 
    getDropboxShareableLink,
    deleteDocumentFromDropbox // Новая функция для удаления файла из Dropbox
} from '../utils/documentGenerator';
import { generateLabelDocument } from '../utils/labelGenerator';
import useTableSearch from '../hooks/useTableSearch';
import SearchControls from './SearchControls';

function DataTable({ data, table, onAdd, onEdit, onDelete, supabase }) {
    const [documentLinks, setDocumentLinks] = useState({});
    const [labelLinks, setLabelLinks] = useState({});
    const [isTableVisible, setIsTableVisible] = useState(true);
    const [isSearchVisible, setIsSearchVisible] = useState(true);
    const [editingItem, setEditingItem] = useState(null);

    const { searchParams, filteredData, handleSearchChange } = useTableSearch(data);

    // Функция очистки имени файла
    const cleanFileName = (name) => {
        const transliterate = (str) => {
            const ru = {
                'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
                'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
                'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
                'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
                'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
                'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '',
                'э': 'e', 'ю': 'yu', 'я': 'ya'
            };

            return str.toLowerCase().split('').map(char => ru[char] || char).join('');
        };

        let cleanName = transliterate(name);
        cleanName = cleanName
            .replace(/[^a-z0-9_\-.]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .substring(0, 100);

        return cleanName || `file_${Date.now()}`;
    };

    // Экспорт в Excel
    const exportToExcel = () => {
        const headers = [
            'Наименование', 'Внешний вид', 'Поставщик', 'Производитель',
            'Дата поступления', 'Дата проверки', 'Номер партии',
            'Дата изготовления', 'Срок годности', 'Соответствие внешнего вида',
            'Фактическая масса', 'Проверяемые показатели', 'Результат исследования',
            'Норматив по паспорту', 'ФИО', 'Комментарий'
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
        XLSX.writeFile(wb, `${table === 'raw_materials' ? 'Сырьё' : 'Продукция'}.xlsx`);
    };

    // Создание акта
    const handleActClick = async (item) => {
        try {
            const docBlob = await generateDocument(item);
            const fileName = cleanFileName(`${item.name}_${item.batch_number}.docx`);
            const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;

            // Создаем ссылку для скачивания документа
            const url = URL.createObjectURL(docBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();

            // Загружаем документ в Dropbox
            const uploadPath = `/${fileName}`;
            const fileData = await saveDocumentToDropbox(docBlob, uploadPath, accessToken);

            if (fileData) {
                // Получаем общедоступную ссылку Dropbox
                const shareableLink = await getDropboxShareableLink(uploadPath, accessToken);
                if (shareableLink) {
                    const formattedLink = shareableLink.replace('?dl=0', '?raw=1');
                    const { data: updatedData, error } = await supabase
                        .from(table)
                        .update({ act_link: formattedLink })
                        .eq('id', item.id)
                        .select();

                    if (error) {
                        console.error('Ошибка обновления в Supabase:', error);
                        throw error;
                    }

                    // Обновляем данные родительского компонента, заменяя элемент на месте
                    if (updatedData && updatedData.length > 0) {
                        onEdit(updatedData[0]);
                    }

                    setDocumentLinks(prev => ({ ...prev, [item.id]: formattedLink }));
                }
            }

            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Ошибка:', error.message);
            alert(`Ошибка создания акта: ${error.message}`);
        }
    };

    // Удаление акта (очищаем act_link и удаляем файл из Dropbox)
    const handleActDelete = async (item) => {
        try {
            const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
            // Определяем имя файла и путь (предполагается, что имя файла можно получить так же, как при загрузке)
            const fileName = cleanFileName(`${item.name}_${item.batch_number}.docx`);
            const uploadPath = `/${fileName}`;

            // Пытаемся удалить файл из Dropbox
            const dropboxDeleteSuccess = await deleteDocumentFromDropbox(uploadPath, accessToken);
            if (!dropboxDeleteSuccess) {
                console.error("Ошибка удаления файла из Dropbox");
                // Можно решить: продолжать обновление записи или остановиться
            }

            // Очищаем поле act_link в Supabase (устанавливаем null)
            const { data: updatedData, error } = await supabase
                .from(table)
                .update({ act_link: null })
                .eq('id', item.id)
                .select();

            if (error) {
                console.error('Ошибка обновления записи в Supabase:', error);
                throw error;
            }

            // Обновляем данные родительского компонента
            if (updatedData && updatedData.length > 0) {
                onEdit(updatedData[0]);
            }

            // Обновляем локальное состояние для ссылки
            setDocumentLinks(prev => {
                const newState = { ...prev };
                delete newState[item.id];
                return newState;
            });
        } catch (error) {
            console.error('Ошибка удаления акта:', error.message);
            alert(`Ошибка удаления акта: ${error.message}`);
        }
    };

    // Создание этикетки
    const handleLabelClick = async (item) => {
        try {
            const docBlob = await generateLabelDocument(item);
            const fileName = cleanFileName(`${item.name}_${item.batch_number}_label.docx`);
            const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;

            const url = URL.createObjectURL(docBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();

            const uploadPath = `/${fileName}`;
            const fileData = await saveDocumentToDropbox(docBlob, uploadPath, accessToken);

            if (fileData) {
                const shareableLink = await getDropboxShareableLink(uploadPath, accessToken);
                if (shareableLink) {
                    setLabelLinks(prev => ({ ...prev, [item.id]: shareableLink }));
                }
            }

            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Ошибка создания этикетки!');
        }
    };

    // Просмотр документа
    const handleViewDocument = (itemId, type = 'act') => {
        const item = filteredData.find(item => item.id === itemId);
        if (!item) return;

        const documentLink = type === 'act'
            ? item.act_link
            : item.label_link;

        if (documentLink?.startsWith('http')) {
            window.open(documentLink, '_blank', 'noopener,noreferrer');
        } else {
            alert('Документ ещё не доступен! Обновите страницу через несколько секунд.');
        }
    };

    // Управление интерфейсом
    const toggleTableVisibility = () => setIsTableVisible(!isTableVisible);
    const toggleSearchVisibility = () => setIsSearchVisible(!isSearchVisible);
    const handleEditLocal = (item) => setEditingItem(item);
    const handleDelete = (id) => onDelete(id);

    // Сброс фильтров
    const resetFilters = () => {
        Object.keys(searchParams).forEach(key => {
            handleSearchChange({ target: { name: key, value: '' } });
        });
    };

    return (
        <div className="table-container">
            <h2>{table === 'raw_materials' ? 'Сырье' : 'Готовая продукция'}</h2>

            <div className="controls" style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '10px',
                flexWrap: 'wrap'
            }}>
                <button onClick={toggleSearchVisibility} className="toggle-search-button">
                    {isSearchVisible ? "Скрыть поиск" : "Показать поиск"}
                </button>

                <button onClick={toggleTableVisibility} className="toggle-table-button">
                    {isTableVisible ? "Свернуть таблицу" : "Развернуть таблицу"}
                </button>

                <button onClick={exportToExcel} className="export-excel-button">
                    Экспорт в Excel
                </button>
            </div>

            {isSearchVisible && (
                <div>
                    <SearchControls
                        searchParams={searchParams}
                        handleSearchChange={handleSearchChange}
                    />
                    <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        margin: '10px 0'
                    }}>
                        <button onClick={resetFilters} className="reset-filters-button">
                            Сбросить фильтры
                        </button>
                    </div>
                </div>
            )}

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
                                    <td>
                                        {item.act_link ? (
                                            <>
                                                <button
                                                    onClick={() => handleViewDocument(item.id, 'act')}
                                                    className="view-document-button"
                                                >
                                                    Просмотр
                                                </button>
                                                <button
                                                    onClick={() => handleActDelete(item)}
                                                    className="delete-document-button"
                                                >
                                                    Удалить
                                                </button>
                                            </>
                                        ) : (
                                            <button onClick={() => handleActClick(item)}>
                                                Создать акт
                                            </button>
                                        )}
                                    </td>
                                    <td>
                                        <button onClick={() => handleLabelClick(item)}>
                                            Создать наклейку
                                        </button>
                                    </td>
                                    <td>{item.comment}</td>
                                    <td>
                                        <button onClick={() => handleEditLocal(item)}>Редактировать</button>
                                        <button onClick={() => handleDelete(item.id)}>Удалить</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="input-scroll">
                <DataForm
                    onAdd={onAdd}
                    onEdit={onEdit}
                    editingItem={editingItem}
                    setEditingItem={setEditingItem}
                />
            </div>
        </div>
    );
}

export default DataTable;
