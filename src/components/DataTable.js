import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import DataForm from './DataForm';
import { 
  generateDocument, 
  saveDocumentToDropbox, 
  getDropboxShareableLink, 
  deleteDocumentFromDropbox 
} from '../utils/documentGenerator';
import { generateLabelPdf } from '../utils/labelPdfGenerator';
import useTableSearch from '../hooks/useTableSearch';
import SearchControls from './SearchControls';
import './DataTable.css';

function DataTable({ data, table, onAdd, onEdit, onDelete, supabase }) {
  const [documentLinks, setDocumentLinks] = useState({});
  const { searchParams, filteredData, handleSearchChange } = useTableSearch(data);
  // Debug: inspect array fields and filtering
  console.log('DataTable full data:', data);
  console.log('DataTable first item.inspected_metrics:', data[0]?.inspected_metrics, 'type:', typeof data[0]?.inspected_metrics, 'isArray:', Array.isArray(data[0]?.inspected_metrics));
  console.log('DataTable searchParams:', searchParams);
  console.log('DataTable filteredData count:', filteredData.length);
  const [labelLinks, setLabelLinks] = useState({});
  const [isTableVisible, setIsTableVisible] = useState(true);
  const [isSearchVisible, setIsSearchVisible] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  // Состояние для хранения введённых названий документов по id элемента
  const [docNames, setDocNames] = useState({});

  // СНАЧАЛА получаем filteredData!
  // Для всех таблиц используем единый компонент поиска
  const filtersPanel = (
    <SearchControls
      searchParams={searchParams}
      handleSearchChange={handleSearchChange}
      isVisible={isSearchVisible}
    />
  );

  // deep equal для сравнения данных по id
  function isRowEqual(a, b) {
    if (!a || !b) return false;
    const keys = Object.keys(a);
    for (let key of keys) {
      if (typeof a[key] === 'object' && typeof b[key] === 'object') {
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
      } else {
        if (a[key] !== b[key]) return false;
      }
    }
    return true;
  }

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
    const isSamples = table === 'samples' || table === 'samples-table';
    const headers = isSamples ? [
      'Наименование', 'Внешний вид', 'Поставщик', 'Производитель',
      'Дата поступления', 'Дата проверки', 'Номер партии',
      'Дата изготовления', 'Срок годности', 'Соответствие внешнего вида',
      'Фактическая масса', 'Проверяемые показатели', 'Результат исследования',
      'Норматив по паспорту', 'Комментарий'
    ] : [
      'Наименование', 'Внешний вид', 'Поставщик', 'Производитель',
      'Дата поступления', 'Дата проверки', 'Номер партии',
      'Дата изготовления', 'Срок годности', 'Соответствие внешнего вида',
      'Фактическая масса', 'Проверяемые показатели', 'Результат исследования',
      'Норматив по паспорту', 'ФИО', 'Комментарий'
    ];

    const wsData = [
      headers,
      ...filteredData.map(item => isSamples ? [
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
        item.comment || ''
      ] : [
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
    XLSX.writeFile(wb, `${table === 'raw_materials' ? 'Сырьё' : table === 'finished_products' ? 'Продукция' : 'Образцы'}.xlsx`);
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
            console.error('Error fetching latest data:', error);
          } else {
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

  // Создание этикетки (с изменениями)
  const handleLabelClick = async (item) => {
    try {
      const pdfBlob = await generateLabelPdf(item);
      const fileName = cleanFileName(`${item.name}_${item.batch_number}_label.pdf`);
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
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

  // Функция загрузки документов (для нового столбца "Документы")
  const handleDocumentUpload = async (item, customName, file) => {
    if (!file || !customName) {
      alert("Введите название документов и выберите файл");
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
      console.error("Ошибка загрузки документов:", error);
      alert("Ошибка загрузки документов");
    }
  };

  // Функция удаления документов из нового столбца "Документы"
  const handleDocumentDelete = async (item, index) => {
    try {
      const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
      const docToDelete = item.documents[index];
      if (!docToDelete || !docToDelete.fileName) {
        alert("Нет информации для удаления документов");
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
      console.error("Ошибка удаления документов:", error);
      alert("Ошибка удаления документов");
    }
  };

  // Функция просмотра документов (открывает ссылку в новом окне)
  const handleViewDocument = (link) => {
    if (link && link.startsWith('http')) {
      window.open(link, '_blank', 'noopener,noreferrer');
    } else {
      alert("Документ недоступен");
    }
  };

  // Универсальная ячейка для документов (всегда с формой добавления)
  function renderDocumentsCell(item) {
    return (
      <div style={{ minWidth: 260, maxWidth: 350 }}>
        {(item.documents && item.documents.length > 0) && item.documents.map((doc, index) => (
          <div key={index} style={{ marginBottom: '5px', border: '1px solid #ccc', padding: '5px' }}>
            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
            <button onClick={() => handleViewDocument(doc.link)}>Просмотр</button>
            <button onClick={() => handleDocumentDelete(item, index)}>Удалить</button>
          </div>
        ))}
        <div style={{ marginTop: '10px', display: 'flex', gap: 4, flexDirection: 'column', minWidth: 220, maxWidth: 320 }}>
          <input
            type="text"
            placeholder="Название документов"
            value={docNames[item.id] || ''}
            onChange={(e) => setDocNames({ ...docNames, [item.id]: e.target.value })}
            style={{ marginBottom: '5px', width: '100%' }}
          />
          {/* Удалено поле выбора файла из верхней части страницы */}
        </div>
      </div>
    );
  }

  // --- Мемоизированная строка таблицы для сырья и продукции (TableRow) ---
  const TableRow = React.memo(function TableRow({ item, getRowStyle, supabase, table, onEdit, handleViewDocument, handleActClick, handleLabelClick, handleDocumentDelete, handleDocumentUpload, handleEditLocal, handleDelete, docNames, setDocNames, renderList }) {
    const rowStyle = getRowStyle(item.status);
    const hasStatusColor = rowStyle && rowStyle.backgroundColor;
    return (
      <tr
        key={item.id}
        className={hasStatusColor ? 'status-colored-row' : ''}
        style={rowStyle}
      >
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
        <td>{item.comment}</td>
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
        <td>{renderDocumentsCell(item)}</td>
        {/* Столбец "Действия" */}
        <td>
          <button onClick={() => handleEditLocal(item)}>Редактировать</button>
          <button onClick={() => handleDelete(item.id)}>Удалить</button>
        </td>
      </tr>
    );
  });

  // Функция для отображения действий (без изменений)
  function renderActions(item) {
    return (
      <div>
        <button onClick={() => handleEditLocal(item)}>Редактировать</button>
        <button onClick={() => handleDelete(item.id)}>Удалить</button>
        <button onClick={() => handleActClick(item)}>Создать акт</button>
        <button onClick={() => handleLabelClick(item)}>Создать этикетку</button>
        {item.act_link && (
          <button onClick={() => handleViewDocument(item.act_link)}>Просмотр акта</button>
        )}
        {item.act_link && (
          <button onClick={() => handleActDelete(item)}>Удалить акт</button>
        )}
      </div>
    );
  }

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

  // Сброс редактирования при отмене
  const handleCancelEdit = () => {
    setEditingItem(null);
  };

  // После успешного обновления (onEdit), сбрасываем editingItem
  const handleEdit = (item) => {
    if (item === null) {
      setEditingItem(null);
    } else {
      onEdit(item);
      setEditingItem(null);
    }
  };

  // Определяем набор столбцов и фильтров по типу таблицы
  const isSamples = table === 'samples' || table === 'samples-table';

  // Столбцы для samples (образцы)
  const samplesColumns = [
    'Наименование', 'Внешний вид', 'Поставщик', 'Производитель',
    'Дата поступления', 'Дата проверки', 'Номер партии',
    'Дата изготовления', 'Срок годности', 'Соответствие внешнего вида',
    'Фактическая масса', 'Проверяемые показатели', 'Результат исследования',
    'Норматив по паспорту', 'Комментарий', 'Документы', 'Действия'
  ];
  // Полный набор столбцов (сырье, продукция)
  const fullColumns = [
    'Наименование', 'Внешний вид', 'Поставщик', 'Производитель',
    'Дата поступления', 'Дата проверки', 'Номер партии',
    'Дата изготовления', 'Срок годности', 'Соответствие внешнего вида',
    'Фактическая масса', 'Проверяемые показатели', 'Результат исследования',
    'Норматив по паспорту', 'ФИО', 'Комментарий', 'Акт', 'Наклейка', 'Статус', 'Документы', 'Действия'
  ];

  // Фильтры для samples
  const samplesFilters = (
    <div className="search-controls">
      <input type="text" placeholder="Поиск по наименованию" name="name" value={searchParams.name || ''} onChange={handleSearchChange} />
      <input type="text" placeholder="Поиск по поставщику" name="supplier" value={searchParams.supplier || ''} onChange={handleSearchChange} />
      <input type="text" placeholder="Поиск по производителю" name="manufacturer" value={searchParams.manufacturer || ''} onChange={handleSearchChange} />
      <input type="text" placeholder="Поиск по результату исследования" name="investigation_result" value={searchParams.investigation_result || ''} onChange={handleSearchChange} />
    </div>
  );

  // Фильтры для остальных таблиц
  const fullFilters = (
    <SearchControls searchParams={searchParams} handleSearchChange={handleSearchChange} isVisible={isSearchVisible} />
  );

  // Рендер строк
  const renderRows = filteredData.map((item, idx) => {
    if (isSamples) {
      return (
        <tr key={item.id || idx} style={getRowStyle(item.status)}>
          <td>{item.name}</td>
          <td>{item.appearance}</td>
          <td>{item.supplier}</td>
          <td>{item.manufacturer}</td>
          <td>{item.receipt_date ? new Date(item.receipt_date).toLocaleDateString() : ''}</td>
          <td>{item.check_date ? new Date(item.check_date).toLocaleDateString() : ''}</td>
          <td>{item.batch_number}</td>
          <td>{item.manufacture_date ? new Date(item.manufacture_date).toLocaleDateString() : ''}</td>
          <td>{item.expiration_date}</td>
          <td>{item.appearance_match}</td>
          <td>{item.actual_mass}</td>
          <td>{renderList(item.inspected_metrics)}</td>
          <td>{renderList(item.investigation_result)}</td>
          <td>{renderList(item.passport_standard)}</td>
          <td>{item.comment}</td>
          <td>{renderDocumentsCell(item)}</td>
          <td>{renderActions(item)}</td>
        </tr>
      );
    } else {
      // Обычный (сырье, продукция) — старый рендер
      return (
        <TableRow
          key={item.id || idx}
          item={item}
          getRowStyle={getRowStyle}
          supabase={supabase}
          table={table}
          onEdit={onEdit}
          handleViewDocument={handleViewDocument}
          handleActClick={handleActClick}
          handleLabelClick={handleLabelClick}
          handleDocumentDelete={handleDocumentDelete}
          handleDocumentUpload={handleDocumentUpload}
          handleEditLocal={handleEditLocal}
          handleDelete={handleDelete}
          docNames={docNames}
          setDocNames={setDocNames}
          renderList={renderList}
        />
      );
    }
  });

  // Рендер таблицы
  const columnsToRender = isSamples ? samplesColumns : fullColumns;

  return (
    <div className="table-container">
      <h2>{table === 'raw_materials' ? 'Сырье' : table === 'finished_products' ? 'Продукция' : 'Образцы'}</h2>

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
          {filtersPanel}
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
                {columnsToRender.map((col, idx) => (
                  <th key={idx}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {renderRows}
            </tbody>
          </table>
        </div>
      )}

      <div className="input-scroll">
        <DataForm
          onAdd={onAdd}
          onEdit={handleEdit}
          editingItem={editingItem}
          setEditingItem={setEditingItem}
        />
        {editingItem && (
          <button
            type="button"
            style={{ margin: '16px 0 0 8px', padding: '8px 16px', background: '#ccc', color: '#333', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            onClick={handleCancelEdit}
          >
            Отменить редактирование
          </button>
        )}
      </div>
    </div>
  );
}

export default DataTable;
