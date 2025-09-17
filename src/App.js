import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { BrowserRouter as Router, Route, Routes, Link, Navigate, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import DataTable from './components/DataTable';
import TasksPage from './TasksPage';
import RawMaterialPage from './RawMaterialPage';
import SamplesTable from './SamplesTable';
import OrdersPage from './OrdersPage';
import SignDocumentPage from './SignDocumentPage';
import AuthPage from './AuthPage';
import UserDashboard from './UserDashboard';
import SignDocumentUploadPage from './SignDocumentUploadPage';
import SignDocumentSignPage from './SignDocumentSignPage';
import { ProductRawMaterialLinker as OCRUpload, ProductRawMaterialSearch } from './pages/OCRUpload';
import LiveColorCheck from './pages/LiveColorCheck';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function AppContent() {
    const [isAuth, setIsAuth] = useState(false);
    const [data, setData] = useState([]);
    const [table, setTable] = useState('raw_materials');
    const location = useLocation();

    useEffect(() => {
        if (location.pathname === '/raw-materials-table') {
            setTable('raw_materials');
        } else if (location.pathname === '/finished-products') {
            setTable('finished_products');
        } else if (location.pathname === '/samples-table') {
            setTable('samples');
        }
    }, [location.pathname]);

    const fetchData = useCallback(async () => {
        let { data: fetchedData, error } = await supabase
            .from(table)
            .select('*')
            .order(table === 'raw_materials' ? 'receipt_date' : 'id', { ascending: false });

        if (error) console.error('Error fetching data:', error);
        else {
            setData(fetchedData || []);
        }
    }, [table]);

    // Обновляем данные при монтировании компонента и при изменении table
    useEffect(() => {
        fetchData();
    }, [table, fetchData]);

    // Обновляем данные каждые 5 секунд
    useEffect(() => {
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const addData = async (newData) => {
        const dataToInsert = {
            name: newData.name,
            appearance: newData.appearance,
            supplier: newData.supplier,
            manufacturer: newData.manufacturer,
            receipt_date: newData.receipt_date || null,
            batch_number: newData.batch_number,
            manufacture_date: newData.manufacture_date || null,
            expiration_date: newData.expiration_date || null,
            appearance_match: newData.appearance_match,
            actual_mass: newData.actual_mass,
            inspected_metrics: newData.inspected_metrics,
            investigation_result: newData.investigation_result,
            passport_standard: newData.passport_standard,
            full_name: newData.full_name,
            act: newData.act,
            label: newData.label,
            comment: newData.comment
        };

        const { data: insertedData, error } = await supabase
            .from(table)
            .insert([dataToInsert]);

        if (error) console.error('Error adding data:', error);
        else {
            console.log('Successfully added data');
            fetchData();
        }
    };

    const editData = async (updatedData) => {
        const { data: updatedRecord, error } = await supabase
            .from(table)
            .update(updatedData)
            .eq('id', updatedData.id)
            .select();
    
        if (error) {
            console.error('Error updating data:', error);
        } else if (updatedRecord && updatedRecord.length > 0) {
            setData(prevData =>
                prevData.map(item => item.id === updatedData.id ? updatedRecord[0] : item)
            );
        }
    };

    const deleteData = async (id) => {
        const { data, error } = await supabase
            .from(table)
            .delete()
            .eq('id', id);

        if (error) console.error('Error deleting data:', error);
        else {
            console.log('Successfully deleted data');
            fetchData();
        }
    };

    const switchTable = (newTable) => {
        setTable(newTable);
    };

    // --- ДОРАБОТАННАЯ ФУНКЦИЯ ДЛЯ КОНВЕРТАЦИИ ДАТЫ ИЗ EXCEL ---
    function excelDateToISO(dateNum) {
        if (typeof dateNum === 'number') {
            const date = new Date(Math.round((dateNum - 25569) * 86400 * 1000));
            date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
            return date.toISOString().slice(0, 10);
        }
        if (typeof dateNum === 'string' && dateNum.trim() !== '') {
            const parsed = new Date(dateNum);
            if (!isNaN(parsed)) {
                return parsed.toISOString().slice(0, 10);
            }
        }
        return null;
    }

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            let formattedData = [];

            // ЛОГИРУЕМ что парсится из Excel
            console.log('jsonData:', jsonData);
            if (jsonData.length > 0) {
                console.log('jsonData[0]:', jsonData[0]);
                console.log('Ключи:', Object.keys(jsonData[0]));
            }

            if (table === 'raw_materials') {
                formattedData = jsonData.map(row => ({
                    name: row['Наименование'],
                    appearance: row['Внешний вид'],
                    supplier: row['Поставщик'],
                    manufacturer: row['Производитель'],
                    receipt_date: excelDateToISO(row['Дата поступления']),
                    check_date: null, // всегда null, чтобы не было пустых строк
                    batch_number: row['№ партии'],
                    manufacture_date: excelDateToISO(row['Дата изготовления']),
                    expiration_date: excelDateToISO(row['Срок годности (годен до)']),
                    appearance_match: row['Соответствие внешнего вида'],
                    actual_mass: row['Фактическая масса (кг)'],
                    inspected_metrics: row['Проверяемые показатели '],
                    investigation_result: row['Результат исследований'],
                    passport_standard: row['Норматив по паспорту'],
                    full_name: '',
                    act: '',
                    label: '',
                    comment: ''
                })).filter(row => row.name || row.supplier || row.manufacturer);
            } else if (table === 'finished_products' || table === 'samples') {
                formattedData = jsonData.map(row => ({
                    name: row['Наименование'],
                    appearance: row['Внешний вид'],
                    supplier: row['Поставщик'],
                    manufacturer: row['Производитель'],
                    receipt_date: row['Дата поступления'],
                    check_date: row['Дата проверки'],
                    batch_number: row['Номер партии'],
                    manufacture_date: row['Дата изготовления'],
                    expiration_date: row['Срок годности'],
                    appearance_match: row['Соответствие внешнего вида'],
                    actual_mass: row['Фактическая масса'],
                    inspected_metrics: row['Проверяемые показатели'],
                    investigation_result: row['Результат исследования'],
                    passport_standard: row['Норматив по паспорту'],
                    full_name: row['ФИО'],
                    act: row['Акт'],
                    label: row['Наклейка'],
                    comment: row['Комментарий']
                }))
                .filter(row =>
                    (row.name && row.name.trim() !== '') ||
                    (row.batch_number && row.batch_number.trim() !== '') ||
                    (row.supplier && row.supplier.trim() !== '') ||
                    (row.manufacturer && row.manufacturer.trim() !== '')
                );
            }

            // ЛОГИРУЕМ что реально пойдет в базу
            console.log('formattedData:', formattedData);

            // ЛОГ перед отправкой данных в Supabase
            console.log('formattedData to upload:', formattedData);

            const { data: insertedData, error } = await supabase
                .from(table)
                .insert(formattedData);

            if (error) {
                console.error('Error uploading data:', error);
                alert('Ошибка при загрузке данных из Excel!');
            } else {
                alert('Данные успешно загружены!');
                fetchData();
            }

            event.target.value = '';
        };

        reader.readAsArrayBuffer(file);
    };

    useEffect(() => {
        // Проверяем сессию при загрузке приложения
        supabase.auth.getSession().then(({ data }) => {
            if (data.session) setIsAuth(true);
            else setIsAuth(false);
        });
        // Подписка на изменения сессии (например, выход)
        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            setIsAuth(!!session);
        });
        return () => {
            listener?.subscription?.unsubscribe?.();
        };
    }, []);

    if (!isAuth) {
        return <AuthPage onAuth={() => setIsAuth(true)} />;
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button
                    onClick={async () => {
                        await supabase.auth.signOut();
                        Object.keys(localStorage).forEach(key => {
                            if (key.startsWith('sb-')) localStorage.removeItem(key);
                        });
                        setIsAuth(false);
                    }}
                    style={{ background: '#f44336', color: 'white', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}
                >
                    Выйти
                </button>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <Link to="/raw-materials-table">
                    <button>Таблица сырья</button>
                </Link>
                <Link to="/finished-products">
                    <button>Таблица готовой продукции</button>
                </Link>
                <Link to="/tasks">
                    <button>Задачи</button>
                </Link>
                <Link to="/raw-materials">
                    <button>Приход сырья</button>
                </Link>
                <Link to="/samples-table">
                    <button>Таблица образцов</button>
                </Link>
                <Link to="/orders">
                    <button>Заказы</button>
                </Link>
                <Link to="/sign-document/upload">
                    <button>Загрузка/скачивание документа</button>
                </Link>
                <Link to="/sign-document/sign">
                    <button>Подписать документ</button>
                </Link>
                <Link to="/ocr-upload">
                    <button>Связи продукт — сырьё</button>
                </Link>
                <Link to="/product-raw-search">
                    <button>Поиск сырья по продукту</button>
                </Link>
                <Link to="/live-check">
                    <button>Проверка цвета (камера)</button>
                </Link>
                {/* <Link to="/sign-document">
                    <button>Подписать документ</button>
                </Link> */}
            </div>
            <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<UserDashboard />} />
                <Route path="/raw-materials" element={<RawMaterialPage />} />
                <Route path="/raw-materials-table" element={
                  <>
                    <div style={{ margin: '20px 0' }}>
                      <input
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                        id="fileInput"
                      />
                      <label htmlFor="fileInput" style={{ cursor: 'pointer', padding: '10px', backgroundColor: '#007bff', color: 'white', borderRadius: '5px' }}>
                        Загрузить данные из Excel
                      </label>
                    </div>
                    <DataTable 
                      data={data} 
                      table="raw_materials"
                      onAdd={addData} 
                      onEdit={editData} 
                      onDelete={deleteData} 
                      supabase={supabase} 
                    />
                  </>
                } />
                <Route path="/finished-products" element={
                  <>
                    <div style={{ margin: '20px 0' }}>
                      <input
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                        id="fileInput"
                      />
                      <label htmlFor="fileInput" style={{ cursor: 'pointer', padding: '10px', backgroundColor: '#007bff', color: 'white', borderRadius: '5px' }}>
                        Загрузить данные из Excel
                      </label>
                    </div>
                    <DataTable 
                      data={data} 
                      table="finished_products"
                      onAdd={addData} 
                      onEdit={editData} 
                      onDelete={deleteData} 
                      supabase={supabase} 
                    />
                  </>
                } />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/samples-table" element={
                  <>
                    <div style={{ margin: '20px 0' }}>
                      <input
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                        id="fileInput"
                      />
                      <label htmlFor="fileInput" style={{ cursor: 'pointer', padding: '10px', backgroundColor: '#007bff', color: 'white', borderRadius: '5px' }}>
                        Загрузить данные из Excel
                      </label>
                    </div>
                    <DataTable 
                      data={data} 
                      table="samples"
                      onAdd={addData} 
                      onEdit={editData} 
                      onDelete={deleteData} 
                      supabase={supabase} 
                    />
                  </>
                } />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/sign-document/upload" element={<SignDocumentUploadPage />} />
                <Route path="/sign-document/sign" element={<SignDocumentSignPage />} />
                <Route path="/ocr-upload" element={<OCRUpload />} />
                <Route path="/product-raw-search" element={<ProductRawMaterialSearch />} />
                <Route path="/live-check" element={<LiveColorCheck />} />
            </Routes>
        </div>
    );
}

export default function App() {
    return (
        <Router>
            <AppContent />
        </Router>
    );
}