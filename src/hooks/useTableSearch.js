import { useState, useEffect } from 'react';
import _debounce from 'lodash.debounce';

const useTableSearch = (initialData) => {
    const [searchParams, setSearchParams] = useState({
        name: '',
        appearance: '',
        supplier: '',
        manufacturer: '',
        receipt_date: '',
        batch_number: '',
        manufacture_date: '',
        expiration_date: '',
        appearance_match: '',
        actual_mass: '',
        inspected_metrics: '',
        investigation_result: '',
        passport_standard: '',
        full_name: '',
        comment: ''
    });

    const [filteredData, setFilteredData] = useState(initialData);

    useEffect(() => {
        const filterData = _debounce(() => {
            const result = initialData.filter(item => {
                // Проверяем каждое поле поиска
                return Object.entries(searchParams).every(([key, value]) => {
                    if (!value) return true; // Если поле пустое, не фильтруем по нему
                    
                    // Получаем значение соответствующего поля из записи
                    let itemValue = item[key];
                    
                    // Преобразуем даты в строки для поиска
                    if (key.includes('date') && itemValue) {
                        try {
                            itemValue = new Date(itemValue).toLocaleDateString();
                        } catch (e) {
                            console.error('Ошибка при обработке даты:', e);
                        }
                    }
                    
                    // Преобразуем значение в строку и выполняем поиск без учета регистра
                    return String(itemValue || '')
                        .toLowerCase()
                        .includes(String(value).toLowerCase());
                });
            });
            
            setFilteredData(result);
        }, 300);

        filterData();

        return () => filterData.cancel();
    }, [searchParams, initialData]);

    const handleSearchChange = (e) => {
        const { name, value } = e.target;
        setSearchParams(prev => ({
            ...prev,
            [name]: value
        }));
    };

    return { searchParams, filteredData, handleSearchChange };
};

export default useTableSearch;