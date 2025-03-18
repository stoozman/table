import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import DataTable from './components/DataTable';
import DocumentGenerator from './components/DocumentGenerator';

const supabaseUrl = 'https://diiogcgzqpvikbkeqmov.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpaW9nY2d6cXB2aWtia2VxbW92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDIyOTA3NTIsImV4cCI6MjA1Nzg2Njc1Mn0.CZ2OtYnOK8F90GBoCHZCh9HVbywABtC9kFc2JS1CXfE';
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
        else setData(data);
    };

    const addData = async (newData) => {
        const { name, supplier, manufacturer, batch_number, date } = newData;
        const { data, error } = await supabase
            .from(table)
            .insert([{
                name,
                ...(table === 'raw_materials' ? { supplier } : {}),
                ...(table === 'finished_products' ? { manufacturer } : {}),
                batch_number,
                date
            }]);

        if (error) console.error('Error adding data:', error);
        else {
            fetchData(); // Обновить данные после добавления
        }
    };

    const switchTable = (newTable) => {
        setTable(newTable);
    };

    return (
        <div>
            <h1>Table App</h1>
            <button onClick={() => switchTable('raw_materials')}>Raw Materials</button>
            <button onClick={() => switchTable('finished_products')}>Finished Products</button>
            <DataTable data={data} table={table} onAdd={addData} />
            <DocumentGenerator />
        </div>
    );
}

export default App;