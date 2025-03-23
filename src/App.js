import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import DataTable from './components/DataTable';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function App() {
    const [data, setData] = useState([]);
    const [table, setTable] = useState('raw_materials');

    useEffect(() => {
        fetchData();
    }, [table]);

    const fetchData = async () => {
        let { data, error } = await supabase
            .from(table)
            .select('*');

        if (error) console.error('Error fetching data:', error);
        else {
            console.log('Fetched data:', data); // Отладочный вывод
            setData(data);
        }
    };

    const addData = async (newData) => {
        const dataToInsert = {
            name: newData.name,
            appearance: newData.appearance,
            supplier: newData.supplier,
            manufacturer: newData.manufacturer,
            receipt_date: newData.receipt_date || null, // Обработка пустого значения
            batch_number: newData.batch_number,
            manufacture_date: newData.manufacture_date || null, // Обработка пустого значения
            expiration_date: newData.expiration_date || null, // Обработка пустого значения
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
    
        console.log('Adding data:', dataToInsert); // Отладочный вывод
    
        const { data: insertedData, error } = await supabase
            .from(table)
            .insert([dataToInsert]);
    
        if (error) console.error('Error adding data:', error);
        else {
            console.log('Successfully added data');
            fetchData(); // Обновить данные после добавления
        }
    };

    const editData = async (updatedData) => {
        const { data, error } = await supabase
            .from(table)
            .update(updatedData)
            .eq('id', updatedData.id);

        if (error) console.error('Error updating data:', error);
        else {
            console.log('Successfully updated data');
            fetchData(); // Обновить данные после редактирования
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
            fetchData(); // Обновить данные после удаления
        }
    };

    const switchTable = (newTable) => {
        setTable(newTable);
    };

    // Функция для загрузки данных из Excel
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Предполагаем, что данные находятся на первом листе
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Преобразуем данные из Excel в массив объектов
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            // Преобразуем данные в формат, подходящий для Supabase
            const formattedData = jsonData.map(row => ({
                name: row['Наименование'],
                appearance: row['Внешний вид'],
                supplier: row['Поставщик'],
                manufacturer: row['Производитель'],
                receipt_date: row['Дата поступления'],
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
            }));

            // Сохраняем данные в Supabase
            const { data: insertedData, error } = await supabase
                .from(table)
                .insert(formattedData);

            if (error) {
                console.error('Error uploading data:', error);
                alert('Ошибка при загрузке данных из Excel!');
            } else {
                console.log('Successfully uploaded data:', insertedData);
                alert('Данные успешно загружены!');
                fetchData(); // Обновляем данные после загрузки
            }
        };

        reader.readAsArrayBuffer(file);
    };

    return (
        <div>
            <h1>Table App</h1>
            <button onClick={() => switchTable('raw_materials')}>Raw Materials</button>
            <button onClick={() => switchTable('finished_products')}>Finished Products</button>

            {/* Кнопка для загрузки Excel */}
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

            <DataTable data={data} table={table} onAdd={addData} onEdit={editData} onDelete={deleteData} />
        </div>
    );
}

export default App;
