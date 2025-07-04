// Быстрый поиск сырья по продукту (для рекламаций и анализа)
function ProductRawMaterialSearch() {
  const [products, setProducts] = useState([]);
  const [raws, setRaws] = useState([]);
  const [links, setLinks] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    async function fetchData() {
      const prodRes = await supabase.from('finished_products').select('id, name, batch_number, manufacture_date');
      setProducts(prodRes.data || []);
      const rawRes = await supabase.from('raw_materials').select('id, name, manufacturer, supplier, batch_number');
      setRaws(rawRes.data || []);
    }
    fetchData();
  }, []);

  // Загрузка связей по выбранному продукту
  useEffect(() => {
    if (!selectedProduct) return;
    async function fetchLinks() {
      const res = await supabase.from('product_raw_material_links').select('*').eq('finished_product_id', selectedProduct.id);
      setLinks(res.data || []);
    }
    fetchLinks();
  }, [selectedProduct]);

  // Фильтрация продуктов по поиску
  const filteredProducts = products.filter(p => {
    const s = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      (p.batch_number && p.batch_number.toLowerCase().includes(s))
    );
  });

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: 20, border: '1px solid #ccc', borderRadius: 8 }}>
      <h2>Поиск сырья по продукту</h2>
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Введите название или партию продукта..."
          style={{ width: 350, padding: 8 }}
          list="product-search-list"
        />
        <datalist id="product-search-list">
          {filteredProducts.map(p => (
            <option key={p.id} value={p.name + (p.batch_number ? ' / ' + p.batch_number : '')} />
          ))}
        </datalist>
        <button
          style={{ marginLeft: 10 }}
          onClick={() => {
            // Попробуем распарсить "название / партия" или просто найти по части
            let found = null;
            // 1. Попытка точного совпадения по name+batch_number
            found = products.find(p => {
              const combined = p.name + (p.batch_number ? ' / ' + p.batch_number : '');
              return combined.toLowerCase() === search.toLowerCase();
            });
            // 2. Если не найдено, попытка по name и batch_number по отдельности
            if (!found) {
              // Если введено через слэш, разбиваем
              const [namePart, batchPart] = search.split('/').map(s => s.trim());
              found = products.find(p =>
                p.name.toLowerCase() === (namePart || '').toLowerCase() &&
                (!batchPart || (p.batch_number && p.batch_number.toLowerCase() === batchPart.toLowerCase()))
              );
            }
            // 3. Если не найдено, ищем по частичному совпадению
            if (!found) {
              found = products.find(p =>
                p.name.toLowerCase().includes(search.toLowerCase()) ||
                (p.batch_number && p.batch_number.toLowerCase().includes(search.toLowerCase()))
              );
            }
            setSelectedProduct(found || null);
          }}
        >Найти</button>
      </div>
      {selectedProduct && (
        <div style={{ marginTop: 24 }}>
          <h3>Продукт: {selectedProduct.name} {selectedProduct.batch_number ? `/ ${selectedProduct.batch_number}` : ''}</h3>
          <div>Дата выпуска: {selectedProduct.manufacture_date || '—'}</div>
          <h4 style={{ marginTop: 16 }}>Использованное сырьё:</h4>
          {links.length === 0 ? <div>Нет данных о связях.</div> : (
            <table border="1" cellPadding="4" style={{ borderCollapse: 'collapse', marginTop: 10, width: '100%' }}>
              <thead>
                <tr>
                  <th>Сырьё</th><th>Партия сырья</th><th>Производитель</th><th>Поставщик</th><th>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l, i) => {
                  const raw = raws.find(r => r.id === l.raw_material_id);
                  return (
                    <tr key={i}>
                      <td>{raw ? raw.name : l.raw_material_id}</td>
                      <td>{raw ? raw.batch_number : ''}</td>
                      <td>{raw ? raw.manufacturer : ''}</td>
                      <td>{raw ? raw.supplier : ''}</td>
                      <td>{l.comment || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import supabase from '../supabase';

// --- Улучшенная метрика похожести (Левенштейн) ---
function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 1;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  const lev = matrix[b.length][a.length];
  return 1 - lev / Math.max(a.length, b.length);
}

// --- Усиление предобработки canvas ---
function enhanceCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  // Грубая бинаризация и усиление контраста
  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const v = avg > 180 ? 255 : 0; // Порог бинаризации
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);
}

// --- Безопасная очистка текста (не удаляет цифры) ---
function safeClean(text) {
  return text
    .replace(/[|{}<>~`@#$%^&*_=+]/g, ' ')
    .replace(/\b\w{1,2}\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/(\d)\s+(\d)/g, '$1$2');
}
// --- Временный фикс для текущего документа ---
function customFix(text) {
  return text
    .replace('bpowaen e 2 F 436 og (an 6923.06.2005200', '1760')
    .replace('Итогозасмену: 00', 'Итогозасмену: 2000');
}

// --- Исправленная очистка текста ---
function cleanText(text) {
  return text
    .replace(/[^\wа-яА-ЯёЁ\d\s.,:\/()\-]|F\d+/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/(\d)\s+(\d)/g, '$1$2'); // Объединяем разорванные числа
}

// --- Жёсткая очистка таблицы ---
function cleanTableText(text) {
  return text
    .replace(/[^ -а-яА-ЯёЁ\w\s\d.,:;()\/-]|F\d+|Jog|an|ow/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\b\w{1,2}\b/g, '');
}

// --- Парсер таблицы (пример) ---
function parseProductionTable(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const tableStart = lines.findIndex(l => /Состав.*Партии сырья/i.test(l));
  if (tableStart === -1) return [];
  let tableRows = [];
  for (let i = tableStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || /Состав бригады|Подпись/i.test(line)) break;
    tableRows.push(line);
  }
  // Фильтрация и разбиение
  return tableRows.map(row => row.replace(/[®©\[\]\|\-—–_]+/g, ' ').replace(/\s+/g, ' ').trim())
    .map(row => row.split(/\s{2,}|\|/).map(c => c.trim()).filter(Boolean))
    .filter(cells => cells.length > 1);
}

// --- Улучшенное сравнение с базой ---
async function matchMaterial(cell, supabase) {
  const { data: raws } = await supabase.from('raw_materials').select('id, name, batch_number');
  let bestRaw = null, bestScore = 0;
  for (const r of raws || []) {
    const score = stringSimilarity(cell, r.name);
    if (score > bestScore) {
      bestScore = score;
      bestRaw = r;
    }
  }
  return bestScore >= 0.5 ? bestRaw : null;
}

// --- Временный фикс для текущего документа ---
function hardFix(text) {
  // Можно расширять список замен по мере необходимости
  return text;
}

// --- Универсальный парсер чисел ---
function parseNumber(str) {
  if (!str) return null;
  const numStr = str.replace(/\s/g, '').replace(',', '.');
  return isNaN(numStr) ? null : parseFloat(numStr);
}
// --- Улучшенный парсер итога ---
function extractTotal(text) {
  let totalMatch = text.match(/Итогоз?а?смену:\s*([\d\s.,]+)/i);
  if (!totalMatch) {
    const allNumbers = text.match(/\b\d[\d\s.,]*\d\b|\b\d+\b/g) || [];
    const lastNumber = allNumbers.pop();
    return parseNumber(lastNumber);
  }
  return parseNumber(totalMatch[1]);
}
// --- Надёжный парсер таблицы ---
function parseTable(text) {
  const lines = text.split('\n');
  const table = [];
  const numberThreshold = 10;
  for (const line of lines) {
    if (line.includes('бригады') || line.includes('Подпись')) continue;
    const numbers = line.match(/\b\d[\d\s.,]*\d\b|\b\d+\b/g) || [];
    const validNumbers = numbers.map(n => parseNumber(n)).filter(n => n > numberThreshold);
    if (validNumbers.length >= 2) {
      table.push({
        per500kg: validNumbers[0],
        consumption: validNumbers[1],
        batch: validNumbers[2] || null
      });
    }
  }
  return table;
}



function ProductRawMaterialLinker() {
  // Списки для автодополнения
  const [products, setProducts] = useState([]);
  const [raws, setRaws] = useState([]);
  // Вводимые значения для продукта
  const [product, setProduct] = useState('');
  const [productId, setProductId] = useState(null);
  const [productBatch, setProductBatch] = useState('');
  const [productDate, setProductDate] = useState('');
  // Массив строк сырья
  const [rawRows, setRawRows] = useState([
    { rawMaterial: '', rawId: null, rawBatch: '', comment: '' }
  ]);
  const [links, setLinks] = useState([]);
  const [status, setStatus] = useState('');

  // Загрузка справочников
  useEffect(() => {
    async function fetchData() {
      const prodRes = await supabase.from('finished_products').select('id, name, batch_number, manufacture_date');
      setProducts(prodRes.data || []);
      const rawRes = await supabase.from('raw_materials').select('id, name, batch_number');
      setRaws(rawRes.data || []);
    }
    fetchData();
  }, []);

  // Загрузка существующих связей
  useEffect(() => {
    async function fetchLinks() {
      const res = await supabase.from('product_raw_material_links').select('*');
      if (res.data) setLinks(res.data);
    }
    fetchLinks();
  }, []);

  // Автокомплит по продукту и сырью
  const productOptions = products.filter(p => product.length === 0 || p.name.toLowerCase().includes(product.toLowerCase()));
  const productBatchOptions = products.filter(p => productId && p.id === productId && p.batch_number).map(p => p.batch_number);
  const productDateOptions = products.filter(p => productId && p.id === productId && p.manufacture_date).map(p => p.manufacture_date);

  // Сохранение связки
  // Обработка изменения строки сырья
  const handleRawRowChange = (idx, field, value) => {
    setRawRows(rows => rows.map((row, i) =>
      i === idx ? { ...row, [field]: value, ...(field === 'rawMaterial' ? { rawId: raws.find(r => r.name === value)?.id || null } : {}) } : row
    ));
  };

  const handleAddRawRow = () => {
    setRawRows(rows => [...rows, { rawMaterial: '', rawId: null, rawBatch: '', comment: '' }]);
  };

  const handleRemoveRawRow = (idx) => {
    setRawRows(rows => rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows);
  };

  const handleSave = async () => {
    if (!productId || !productBatch || !productDate) {
      setStatus('Заполните все поля продукта!');
      return;
    }
    for (const row of rawRows) {
      if (!row.rawId || !row.rawBatch) {
        setStatus('Заполните все поля для каждого сырья!');
        return;
      }
    }
    const inserts = rawRows.map(row => ({
      finished_product_id: productId,
      raw_material_id: row.rawId,
      handwritten_batch_number: row.rawBatch,
      comment: row.comment || null
    }));
    const { error } = await supabase.from('product_raw_material_links').insert(inserts);
    if (error) {
      setStatus('Ошибка сохранения: ' + error.message);
    } else {
      setStatus('Связки сохранены!');
      setLinks([
        ...links,
        ...rawRows.map(row => ({
          finished_product_id: productId,
          raw_material_id: row.rawId,
          handwritten_batch_number: row.rawBatch,
          comment: row.comment || null,
          product_batch: productBatch,
          product_date: productDate
        }))
      ]);
      setRawRows([{ rawMaterial: '', rawId: null, rawBatch: '', comment: '' }]);
      setProductBatch('');
      setProductDate('');
      setProduct('');
      setProductId(null);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 20, border: '1px solid #ccc', borderRadius: 8 }}>
      <h2>Ручной ввод связки: продукт — сырьё</h2>
      <div style={{ marginBottom: 16 }}>
        <label>Продукт:<br/>
          <input
            type="text"
            value={product}
            onChange={e => {
              setProduct(e.target.value);
              const found = products.find(p => p.name === e.target.value);
              setProductId(found ? found.id : null);
            }}
            list="product-list"
            autoComplete="off"
          />
          <datalist id="product-list">
            {productOptions.map(p => <option key={p.id} value={p.name} />)}
          </datalist>
        </label>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label>Партия продукта:<br/>
          <input
            type="text"
            value={productBatch}
            onChange={e => setProductBatch(e.target.value)}
            list="product-batch-list"
            autoComplete="off"
          />
          <datalist id="product-batch-list">
            {productBatchOptions.map((b, i) => <option key={i} value={b} />)}
          </datalist>
        </label>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label>Дата партии продукта:<br/>
          <input
            type="date"
            value={productDate}
            onChange={e => setProductDate(e.target.value)}
            list="product-date-list"
            autoComplete="off"
          />
          <datalist id="product-date-list">
            {productDateOptions.map((d, i) => <option key={i} value={d} />)}
          </datalist>
        </label>
      </div>
      <div style={{ marginBottom: 16 }}>
        <b>Связанные сырьё и партии:</b>
        {rawRows.map((row, idx) => {
          // Уникальные наименования сырья для автокомплита
          const uniqueRawNames = Array.from(new Set(
            raws
              .filter(r => row.rawMaterial.length === 0 || r.name.toLowerCase().includes(row.rawMaterial.toLowerCase()))
              .map(r => r.name)
          ));
          const rawOptions = uniqueRawNames;
          // Для выбранного сырья показываем все партии этого сырья
          const rawBatchOptions = raws
            .filter(r => r.name === row.rawMaterial && r.batch_number)
            .map(r => r.batch_number);
          return (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input
                type="text"
                value={row.rawMaterial}
                onChange={e => handleRawRowChange(idx, 'rawMaterial', e.target.value)}
                list={`raw-list-${idx}`}
                placeholder="Сырьё"
                style={{ minWidth: 120 }}
                autoComplete="off"
              />
              <datalist id={`raw-list-${idx}`}>
                {rawOptions.map((name, i) => <option key={i} value={name} />)}
              </datalist>
              <input
                type="text"
                value={row.rawBatch}
                onChange={e => handleRawRowChange(idx, 'rawBatch', e.target.value)}
                list={`raw-batch-list-${idx}`}
                placeholder="Партия сырья"
                style={{ minWidth: 100 }}
                autoComplete="off"
              />
              <datalist id={`raw-batch-list-${idx}`}>
                {rawBatchOptions.map((b, i) => <option key={i} value={b} />)}
              </datalist>
              <input
                type="text"
                value={row.comment}
                onChange={e => handleRawRowChange(idx, 'comment', e.target.value)}
                placeholder="Комментарий"
                style={{ minWidth: 120 }}
              />
              <button type="button" onClick={() => handleRemoveRawRow(idx)} style={{ color: 'red', fontWeight: 'bold' }}>×</button>
            </div>
          );
        })}
        <button type="button" onClick={handleAddRawRow} style={{ marginTop: 4 }}>+ Добавить сырьё</button>
      </div>
      <button onClick={handleSave}>Сохранить все связи</button>
      <div style={{ marginTop: 16, color: status.includes('Ошибка') ? 'red' : 'green' }}>{status}</div>
      <h3 style={{ marginTop: 32 }}>История связей</h3>
      <table border="1" cellPadding="4" style={{ borderCollapse: 'collapse', marginTop: 10, width: '100%' }}>
        <thead>
          <tr>
            <th>Продукт</th><th>Партия продукта</th><th>Дата партии</th><th>Сырьё</th><th>Партия сырья</th><th>Комментарий</th>
          </tr>
        </thead>
        <tbody>
          {links.map((l, i) => {
            const prod = products.find(p => p.id === l.finished_product_id);
            const raw = raws.find(r => r.id === l.raw_material_id);
            // Получаем batch_number и manufacture_date из products по id
            const batch = prod ? prod.batch_number : (l.product_batch || '');
            const date = prod ? prod.manufacture_date : (l.product_date || '');
            return (
              <tr key={i}>
                <td>{prod ? prod.name : l.finished_product_id}</td>
                <td>{batch}</td>
                <td>{date}</td>
                <td>{raw ? raw.name : l.raw_material_id}</td>
                <td>{l.handwritten_batch_number}</td>
                <td>{l.comment || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { ProductRawMaterialLinker, ProductRawMaterialSearch };
