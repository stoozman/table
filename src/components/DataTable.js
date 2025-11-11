import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import DataForm from './DataForm';
import { 
  generateDocument, 
  saveDocumentToSupabase, 
  getSupabasePublicUrl, 
  deleteDocumentFromSupabase 
} from '../utils/documentGenerator';
import { generateLabelPdf } from '../utils/labelPdfGenerator';
// removed useTableSearch hook to keep search state local to this component
import SearchControls from './SearchControls';
import './DataTable.css';

function DataTable({ data, table, onAdd, onEdit, onDelete, supabase }) {
  const [documentLinks, setDocumentLinks] = useState({});
  // Local search state (replaces useTableSearch hook)
  const [searchParams, setSearchParams] = useState({});
  const handleSearchChange = (e) => {
    const { name, value } = e.target;
    setSearchParams(prev => ({ ...prev, [name]: value }));
  };
  // Memoize filtered data to avoid recomputing on unrelated renders
  const filteredData = useMemo(() => {
    try {
      return data.filter(item => {
        return Object.entries(searchParams).every(([k, v]) => {
          if (!v || !String(v).trim()) return true;
          const itemVal = item?.[k];
          return itemVal != null && String(itemVal).toLowerCase().includes(String(v).toLowerCase());
        });
      });
    } catch (e) {
      return data;
    }
  }, [data, searchParams]);
  const [labelLinks, setLabelLinks] = useState({});
  const [isTableVisible, setIsTableVisible] = useState(true);
  const [isSearchVisible, setIsSearchVisible] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  // Map to persist per-row document name between renders
  const docNameById = React.useRef(new Map());

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

  const formatScalar = (v) => {
    // Handle null/undefined
    if (v == null) return '';

    // If it's already an array, join nicely. If items are objects, prefer their `name`/`link`.
    if (Array.isArray(v)) {
      if (v.length === 0) return '';
      if (typeof v[0] === 'object') return v.map(it => it?.name || it?.link || JSON.stringify(it)).join(', ');
      return v.join(', ');
    }

    // Work with trimmed string form
    let s = String(v).trim();
    if (!s) return '';

    // Common CSV escaping: fields are quoted and inner quotes are doubled: "" -> "
    // Strip single outer quotes if present
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1).trim();
    }

    // Replace doubled double-quotes (CSV escaping) with a single double-quote
    if (s.includes('""')) {
      s = s.replace(/""/g, '"');
    }

    // Normalize newlines
    s = s.replace(/\r?\n/g, ' ');

    // Try to parse JSON. Many DB exports arrive as JSON-encoded strings.
    try {
      const parsed = JSON.parse(s);
      if (parsed == null) return '';
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return '';
        if (typeof parsed[0] === 'object') return parsed.map(it => it?.name || it?.link || JSON.stringify(it)).join(', ');
        return parsed.join(', ');
      }
      if (typeof parsed === 'object') {
        return parsed.name || Object.values(parsed).join(', ');
      }
      return String(parsed);
    } catch (e) {
      // fallthrough to string heuristics below
    }

    // If it looks like an array literal but JSON.parse failed (escaped quotes etc.),
    // strip brackets and split on commas, then unquote parts.
    if (s.startsWith('[') && s.endsWith(']')) {
      const inner = s.slice(1, -1);
      const parts = inner
        .split(',')
        .map(part => part.replace(/^\s*["']?|["']?\s*$/g, '').trim())
        .filter(Boolean);
      return parts.join(', ');
    }

    return s;
  };

  // Normalize link fields that may be stored as arrays or JSON-encoded arrays
  const normalizeLink = (val) => {
    if (!val && val !== 0) return null;

    // If it's already an array, prefer first string-like or object's link/name
    if (Array.isArray(val)) {
      if (val.length === 0) return null;
      const first = val.find(x => typeof x === 'string') || val[0];
      if (typeof first === 'string') return first;
      if (typeof first === 'object' && first != null) return first.link || first.name || JSON.stringify(first);
      return String(first);
    }

    // Work with string forms (may be JSON-encoded, CSV-escaped, or already plain URL)
    if (typeof val === 'string') {
      let s = val.trim();
      if (!s) return null;

      // Remove surrounding single/double quotes
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
      }

      // Unescape common CSV doubling and backslash-escapes
  s = s.replace(/""/g, '"').replace(/\\"/g, '"').replace(/\\'/g, "'");

  // Strip outer brackets/quotes leftover (e.g. '["..."]') and surrounding whitespace
  s = s.replace(/^[\[\]\s"']+|[\[\]\s"']+$/g, '');

      // If still looks like JSON (array or object), try parsing
      if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
        try {
          const parsed = JSON.parse(s);
          if (parsed == null) return null;
          if (Array.isArray(parsed)) {
            if (parsed.length === 0) return null;
            const first = parsed[0];
            if (typeof first === 'string') return first;
            if (typeof first === 'object' && first != null) return first.link || first.name || JSON.stringify(first);
            return String(first);
          }
          if (typeof parsed === 'object') return parsed.link || parsed.name || Object.values(parsed).find(x => typeof x === 'string') || JSON.stringify(parsed);
          return String(parsed);
        } catch (e) {
          // fallthrough to heuristics
        }
      }

    // Heuristic: try to extract first URL-like substring inside brackets or the string
    const urlMatch = s.match(/https?:\/\/\S+/i);
    if (urlMatch) return urlMatch[0].replace(/[",\)\]\s]+$/g, '');

      // If looks like bracketed list without valid JSON, strip brackets and quotes
      if (s.startsWith('[') && s.endsWith(']')) {
        const inner = s.slice(1, -1).trim();
        const cleaned = inner.split(',').map(p => p.replace(/^\s*["']?|["']?\s*$/g, '').trim()).filter(Boolean);
        if (cleaned.length > 0) return cleaned[0].replace(/^[\[\]\s"']+|[\[\]\s"']+$/g, '');
      }

      return s;
    }

    // Fallback
    return String(val);
  };

  // Normalize documents field: may be an array, or a JSON-stringified array
  const normalizeDocuments = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      let s = val.trim();
      if (!s || s === '[]') return [];
      // remove surrounding quotes/brackets
      s = s.replace(/^[\[\]\s"']+|[\[\]\s"']+$/g, '');
      // Try parse JSON
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object') return [parsed];
      } catch (e) {
        // fallback: try to split simple bracket list
        if (s.startsWith('[') && s.endsWith(']')) {
          const inner = s.slice(1, -1);
          const parts = inner.split(',').map(p => p.replace(/^\s*["']?|["']?\s*$/g, '').trim()).filter(Boolean);
          return parts.map(p => ({ name: p.replace(/^[\[\]\s"']+|[\[\]\s"']+$/g, ''), link: p.replace(/^[\[\]\s"']+|[\[\]\s"']+$/g, '') }));
        }
      }
      return [{ name: s.replace(/^[\[\]\s"']+|[\[\]\s"']+$/g, ''), link: s.replace(/^[\[\]\s"']+|[\[\]\s"']+$/g, '') }];
    }
    // fallback
    return [{ name: String(val), link: String(val) }];
  };

  // Prepare display data with normalized act_link and documents to avoid showing raw brackets
  const displayData = useMemo(() => {
    return filteredData.map(item => {
      try {
        const newItem = { ...item };
        newItem.act_link = normalizeLink(item.act_link);
        newItem.documents = normalizeDocuments(item.documents);
        // (debug removed)
        return newItem;
      } catch (e) {
        return item;
      }
    });
  }, [filteredData]);

  


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
          formatScalar(item.actual_mass),
          formatScalar(item.inspected_metrics),
          formatScalar(item.investigation_result),
          formatScalar(item.passport_standard),
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
          formatScalar(item.actual_mass),
          formatScalar(item.inspected_metrics),
          formatScalar(item.investigation_result),
          formatScalar(item.passport_standard),
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
      const uploadPath = `acts/${fileName}`;
      await saveDocumentToSupabase(docBlob, uploadPath);
      const publicUrl = getSupabasePublicUrl(uploadPath);
      if (publicUrl) {
        const { data: updatedData, error } = await supabase
          .from(table)
          .update({ act_link: publicUrl })
          .eq('id', item.id)
          .select();
        if (error) {
          console.error('Error fetching latest data:', error);
        } else {
          onEdit(updatedData[0]);
        }
        setDocumentLinks(prev => ({ ...prev, [item.id]: publicUrl }));
      }
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

  // Удаление акта
  const handleActDelete = async (item) => {
    try {
      const fileName = cleanFileName(`${item.name}_${item.batch_number}.docx`);
      const uploadPath = `acts/${fileName}`;
      await deleteDocumentFromSupabase(uploadPath);
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
    customName = (customName || '').trim();
    if (!file || !customName) {
      alert("Введите название документов и выберите файл");
      return null;
    }
    try {
      const extension = file.name.split('.').pop();
      const fileName = cleanFileName(`${customName}_${item.batch_number}_${Date.now()}.${extension}`);
      const uploadPath = `documents/${fileName}`;
      await saveDocumentToSupabase(file, uploadPath);
      const publicUrl = getSupabasePublicUrl(uploadPath);
      if (publicUrl) {
        const newDoc = { name: customName, link: publicUrl, fileName };
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
          return updatedData[0];
        }
        // Note: do not touch outer docNames state here; caller (row) will clear its local input
      }
    } catch (error) {
      console.error("Ошибка загрузки документов:", error);
      alert("Ошибка загрузки документов");
      return null;
    }
  };

  // Функция удаления документов из нового столбца "Документы"
  const handleDocumentDelete = async (item, index) => {
    try {
      const docToDelete = item.documents[index];
      if (!docToDelete || !docToDelete.fileName) {
        alert("Нет информации для удаления документов");
        return;
      }
      const filePath = `documents/${docToDelete.fileName}`;
      await deleteDocumentFromSupabase(filePath);
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

  // DocumentsCell — отдельный компонент, локальное состояние для имени документа
  function DocumentsCell({ item, handleDocumentUpload, handleViewDocument, handleDocumentDelete }) {
    const [localDocName, setLocalDocName] = useState('');

    // Always normalize documents at render time to avoid any leftover raw bracketed strings
    const docs = normalizeDocuments(item.documents);

    useEffect(() => {
      const saved = docNameById.current.get(item.id);
      if (saved) setLocalDocName(saved);
    }, [item.id]);

    const handleNameChange = (v) => {
      setLocalDocName(v);
      try {
        docNameById.current.set(item.id, v);
      } catch (e) {
        // ignore
      }
    };

    return (
      <div style={{ minWidth: 260, maxWidth: 350 }}>
        {/* Quick textual summary to avoid any bracketed-array visual */}
        {(docs && docs.length > 0) && (
          <div style={{ marginBottom: 6, color: '#333', fontSize: 13 }}>{docs.map(d => d.name || d.link).join(', ')}</div>
        )}
        {(docs && docs.length > 0) && docs.map((doc, index) => (
          <div key={doc.fileName || doc.link || doc.name || index} style={{ marginBottom: '5px', border: '1px solid #ccc', padding: '5px' }}>
            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
            <button onClick={() => handleViewDocument(doc.link)}>Просмотр</button>
            <button onClick={() => handleDocumentDelete(item, index)}>Удалить</button>
          </div>
        ))}

        <div style={{ marginTop: '10px', display: 'flex', gap: 4, flexDirection: 'column', minWidth: 220, maxWidth: 320 }}>
          <input
            type="text"
            placeholder="Название документов"
            value={localDocName || ''}
            onChange={(e) => handleNameChange(e.target.value)}
            style={{ marginBottom: '5px', width: '100%' }}
          />
          <input
            type="file"
            onChange={e => {
              const file = e.target.files[0];
              if (!file) return;
              const nameTrim = (localDocName || '').trim();
              if (!nameTrim) {
                alert("Введите название документов и выберите файл");
                e.target.value = '';
                return;
              }
              handleDocumentUpload(item, nameTrim, file)
                .then(result => {
                  if (result) {
                    // Очистим локальное поле после успешной загрузки
                    handleNameChange('');
                  }
                  e.target.value = '';
                })
                .catch(() => {
                  e.target.value = '';
                });
            }}
            style={{ marginBottom: '5px', width: '100%' }}
          />
        </div>
      </div>
    );
  }

  // --- Мемоизированная строка таблицы для сырья и продукции (TableRow) ---
  // TableRow is memoized to avoid remounting when irrelevant props change.
  // Comparison checks only the item.id, item.status, item.act_link and item.documents fields.
  const TableRow = React.memo(function TableRow({ item, getRowStyle, supabase, table, onEdit, handleViewDocument, handleActClick, handleActDelete, handleLabelClick, handleDocumentDelete, handleDocumentUpload, handleEditLocal, handleDelete }) {
    const rowStyle = getRowStyle(item.status);
    const hasStatusColor = rowStyle && rowStyle.backgroundColor;
  // Перенос локального состояния имени документа в DocumentsCell
    return (
      <tr
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
  <td>{formatScalar(item.actual_mass)}</td>
  <td>{formatScalar(item.inspected_metrics)}</td>
  <td>{formatScalar(item.investigation_result)}</td>
  <td>{formatScalar(item.passport_standard)}</td>
        <td>{item.full_name}</td>
        <td>{item.comment}</td>
        {/* Столбец "Акт" */}
        <td>
          {(() => {
            const actLink = normalizeLink(item.act_link);
            if (actLink) {
              return (
                <>
                  <button onClick={() => handleViewDocument(actLink)}>Просмотр</button>
                  <button onClick={() => handleActDelete(item)} style={{ marginLeft: 6 }}>Удалить акт</button>
                </>
              );
            }
            return <button onClick={() => handleActClick(item)}>Создать акт</button>;
          })()}
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
        <td>
          <DocumentsCell
            key={item.id}
            item={item}
            handleDocumentUpload={handleDocumentUpload}
            handleViewDocument={handleViewDocument}
            handleDocumentDelete={handleDocumentDelete}
          />
        </td>
        {/* Столбец "Действия" */}
        <td>
          <button onClick={() => handleEditLocal(item)}>Редактировать</button>
          <button onClick={() => handleDelete(item.id)}>Удалить</button>
        </td>
      </tr>
    );
  }, (prevProps, nextProps) => {
    const a = prevProps.item || {};
    const b = nextProps.item || {};
    if (a.id !== b.id) return false;
    if ((a.status || '') !== (b.status || '')) return false;
    if ((a.act_link || '') !== (b.act_link || '')) return false;
    // shallow compare documents via JSON stringify (documents usually small)
    try {
      const da = a.documents || [];
      const db = b.documents || [];
      if (JSON.stringify(da) !== JSON.stringify(db)) return false;
    } catch (e) {
      return false;
    }
    return true;
  });

  // Функция для отображения действий (без изменений)
  function renderActions(item) {
    return (
      <div>
        <button onClick={() => handleEditLocal(item)}>Редактировать</button>
        <button onClick={() => handleDelete(item.id)}>Удалить</button>
        <button onClick={() => handleActClick(item)}>Создать акт</button>
        <button onClick={() => handleLabelClick(item)}>Создать этикетку</button>
        {(() => {
          const actLink = normalizeLink(item.act_link);
          return actLink ? (
            <>
              <button onClick={() => handleViewDocument(actLink)}>Просмотр акта</button>
              <button onClick={() => handleActDelete(item)}>Удалить акт</button>
            </>
          ) : null;
        })()}
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

  // Рендер строк (используем displayData — нормализованные поля)
  const renderRows = displayData.map((item, idx) => {
    if (isSamples) {
      return (
        <tr key={item.id} style={getRowStyle(item.status)}>
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
            <td>{formatScalar(item.actual_mass)}</td>
            <td>{formatScalar(item.inspected_metrics)}</td>
            <td>{formatScalar(item.investigation_result)}</td>
            <td>{formatScalar(item.passport_standard)}</td>
          <td>{item.comment}</td>
          <td>
                  {(normalizeDocuments(item.documents) && normalizeDocuments(item.documents).length > 0) ? (
                    <div style={{ marginBottom: 6, color: '#333', fontSize: 13 }}>{normalizeDocuments(item.documents).map(d => d.name || d.link).join(', ')}</div>
                  ) : null}
                  {(normalizeDocuments(item.documents) && normalizeDocuments(item.documents).length > 0) ? normalizeDocuments(item.documents).map((doc, i) => (
                    <div key={doc.fileName || doc.link || doc.name || i} style={{ marginBottom: '5px' }}>
                      <span style={{ marginRight: 8 }}>{doc.name}</span>
                      <button onClick={() => handleViewDocument(doc.link)}>Просмотр</button>
                    </div>
                  )) : null}
          </td>
          <td>{renderActions(item)}</td>
        </tr>
      );
    } else {
      // Обычный (сырье, продукция) — старый рендер
      return (
        <TableRow
          key={item.id}
          item={item}
          getRowStyle={getRowStyle}
          supabase={supabase}
          table={table}
          onEdit={onEdit}
          handleViewDocument={handleViewDocument}
          handleActClick={handleActClick}
          handleActDelete={handleActDelete}
          handleLabelClick={handleLabelClick}
          handleDocumentDelete={handleDocumentDelete}
          handleDocumentUpload={handleDocumentUpload}
          handleEditLocal={handleEditLocal}
          handleDelete={handleDelete}
        
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
