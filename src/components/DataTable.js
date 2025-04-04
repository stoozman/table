import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import DataForm from './DataForm';
import { 
  generateDocument, 
  saveDocumentToDropbox, 
  getDropboxShareableLink, 
  deleteDocumentFromDropbox 
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
  // Состояние для хранения введённых названий документов по id элемента
  const [docNames, setDocNames] = useState({});

  const { searchParams, filteredData, handleSearchChange } = useTableSearch(data);

  // Функция для динамического изменения цвета строки по статусу
  const getRowStyle = (status) => {
    switch (status) {
      case 'Годное':
        return { backgroundColor: '#d4edda' }; // светло-зеленый
      case 'На карантине':
        return { backgroundColor: '#fff3cd' }; // светло-желтый
      case 'На исследовании':
        return { backgroundColor: '#cce5ff' }; // светло-голубой
      case 'Брак':
        return { backgroundColor: '#f8d7da' }; // светло-красный
      default:
        return {};
    }
  };

  const renderList = (value) => {
    let arr = [];
    try {
      if (typeof value === 'string') {
        arr = JSON.parse(value);
        if (!Array.isArray(arr)) {
          arr = [value];
        }
      } else if (Array.isArray(value)) {
        arr = value;
      }
    } catch (e) {
      arr = Array.isArray(value) ? value : [value];
    }
    return arr.map((item, idx) => <div key={idx}>{item}</div>);
  };

  // Очистка имени файла (транслитерация и замена недопустимых символов)
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

  // Экспорт данных в Excel (без изменений)
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

  // Создание акта (функция без изменений)
  const handleActClick = async (item) => {
    try {
      const docBlob = await generateDocument(item);
      const fileName = cleanFileName(`${item.name}_${item.batch_number}.docx`);
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

  // Создание этикетки (без изменений)
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

  // Удаление акта (без изменений)
  const handleActDelete = async (item) => {
    try {
      const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
      const fileName = cleanFileName(`${item.name}_${item.batch_number}.docx`);
      const uploadPath = `/${fileName}`;

      const dropboxDeleteSuccess = await deleteDocumentFromDropbox(uploadPath, accessToken);
      if (!dropboxDeleteSuccess) {
        console.error("Ошибка удаления файла из Dropbox");
      }

      const { data: updatedData, error } = await supabase
        .from(table)
        .update({ act_link: null })
        .eq('id', item.id)
        .select();

      if (error) {
        console.error('Ошибка обновления записи в Supabase:', error);
        throw error;
      }
      if (updatedData && updatedData.length > 0) {
        onEdit(updatedData[0]);
      }
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

  // Функция загрузки документа (для нового столбца "Документы")
  const handleDocumentUpload = async (item, customName, file) => {
    if (!file || !customName) {
      alert("Введите название документа и выберите файл");
      return;
    }
    try {
      const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
      const extension = file.name.split('.').pop();
      const fileName = cleanFileName(`${customName}_${item.batch_number}_${Date.now()}.${extension}`);
      const uploadPath = `documents/${fileName}`;
      const fileData = await saveDocumentToDropbox(file, uploadPath, accessToken);

      if (fileData) {
        const shareableLink = await getDropboxShareableLink(uploadPath, accessToken);
        if (shareableLink) {
          const newDoc = { name: customName, link: shareableLink, fileName };
          const updatedDocuments = item.documents ? [...item.documents, newDoc] : [newDoc];

          const { data: updatedData, error } = await supabase
            .from(table)
            .update({ documents: updatedDocuments })
            .eq('id', item.id)
            .select();

          if (error) {
            console.error("Ошибка обновления записи в Supabase:", error);
            throw error;
          }
          if (updatedData && updatedData.length > 0) {
            onEdit(updatedData[0]);
          }
          setDocNames(prev => ({ ...prev, [item.id]: '' }));
        }
      }
    } catch (error) {
      console.error("Ошибка загрузки документа:", error);
      alert("Ошибка загрузки документа");
    }
  };

  // Функция удаления документа из нового столбца "Документы"
  const handleDocumentDelete = async (item, index) => {
    try {
      const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
      const docToDelete = item.documents[index];
      if (!docToDelete || !docToDelete.fileName) {
        alert("Нет информации для удаления документа");
        return;
      }
      const filePath = `documents/${docToDelete.fileName}`;
      await deleteDocumentFromDropbox(filePath, accessToken);

      const updatedDocuments = item.documents.filter((_, i) => i !== index);
      const { data: updatedData, error } = await supabase
        .from(table)
        .update({ documents: updatedDocuments })
        .eq('id', item.id)
        .select();

      if (error) {
        console.error("Ошибка обновления записи в Supabase:", error);
        throw error;
      }
      if (updatedData && updatedData.length > 0) {
        onEdit(updatedData[0]);
      }
    } catch (error) {
      console.error("Ошибка удаления документа:", error);
      alert("Ошибка удаления документа");
    }
  };

  // Функция просмотра документа (открывает ссылку в новом окне)
  const handleViewDocument = (link) => {
    if (link && link.startsWith('http')) {
      window.open(link, '_blank', 'noopener,noreferrer');
    } else {
      alert("Документ недоступен");
    }
  };

  // Управление интерфейсом (без изменений)
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
      isVisible={isSearchVisible}
    />
    <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '10px 0' }}>
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
                <th>Статус</th>
                <th>Документы</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
  {filteredData.map((item) => (
    <tr key={item.id} style={getRowStyle(item.status)}>
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
      <td>{renderList(item.inspected_metrics)}</td>
      <td>{renderList(item.investigation_result)}</td>
      <td>{renderList(item.passport_standard)}</td>
      <td>{item.full_name}</td>
      {/* Столбец "Акт" */}
      <td>
        {item.act_link ? (
          <button onClick={() => handleViewDocument(item.act_link)}>Просмотр</button>
        ) : (
          <button onClick={() => handleActClick(item)}>Создать акт</button>
        )}
      </td>
      {/* Столбец "Наклейка" */}
      <td>
        <button onClick={() => handleLabelClick(item)}>Создать наклейку</button>
      </td>
      {/* Столбец "Комментарий" */}
      <td>{item.comment}</td>
      {/* Столбец "Статус" */}
      <td>
        <select
          value={item.status || ''}
          onChange={async (e) => {
            const newStatus = e.target.value;
            const { data: updatedData, error } = await supabase
              .from(table)
              .update({ status: newStatus })
              .eq('id', item.id)
              .select();
            if (error) {
              console.error("Ошибка обновления статуса:", error);
              alert("Ошибка обновления статуса");
            } else if (updatedData && updatedData.length > 0) {
              onEdit(updatedData[0]);
            }
          }}
        >
          <option value="">--Выберите статус--</option>
          <option value="Годное">Годное</option>
          <option value="На карантине">На карантине</option>
          <option value="На исследовании">На исследовании</option>
          <option value="Брак">Брак</option>
        </select>
      </td>
      {/* Столбец "Документы" */}
      <td>
        {item.documents && item.documents.length > 0 && item.documents.map((doc, index) => (
          <div key={index} style={{ marginBottom: '5px', border: '1px solid #ccc', padding: '5px' }}>
            <div>{doc.name}</div>
            <button onClick={() => handleViewDocument(doc.link)}>Просмотр</button>
            <button onClick={() => handleDocumentDelete(item, index)}>Удалить</button>
          </div>
        ))}
        <div style={{ marginTop: '10px' }}>
          <input
            type="text"
            placeholder="Название документа"
            value={docNames[item.id] || ''}
            onChange={(e) => setDocNames({ ...docNames, [item.id]: e.target.value })} 
            style={{ marginBottom: '5px', width: '100%' }}
          />
          <input
            type="file"
            onChange={(e) => handleDocumentUpload(item, docNames[item.id], e.target.files[0])}
          />
        </div>
      </td>
      {/* Столбец "Действия" */}
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
