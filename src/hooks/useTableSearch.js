import { useState, useEffect, useMemo } from 'react';
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

    // filteredData теперь мемоизирован
    const filteredData = useMemo(() => {
        const result = initialData.filter(item => {
            return Object.entries(searchParams).every(([key, value]) => {
                if (!value) return true;
                let itemValue = item[key];
                const searchTerm = String(value).toLowerCase();
                // обработка массивных полей или JSON-строк массивов
                const arrayFields = ['inspected_metrics', 'investigation_result', 'passport_standard'];
                if (arrayFields.includes(key)) {
                    let arr = [];
                    if (Array.isArray(itemValue)) arr = itemValue;
                    else if (typeof itemValue === 'string') {
                        try { arr = JSON.parse(itemValue) || []; } catch { arr = []; }
                    }
                    return arr.some(el => String(el).toLowerCase().includes(searchTerm));
                }
                if (key.includes('date') && itemValue) {
                    try {
                        itemValue = new Date(itemValue).toLocaleDateString();
                    } catch (e) {
                        console.error('Ошибка при обработке даты:', e);
                    }
                }
                return String(itemValue || '')
                    .toLowerCase()
                    .includes(String(value).toLowerCase());
            });
        });
        console.log('Фильтрация: params=', searchParams, 'результат count=', result.length);
        return result;
    }, [searchParams, initialData]);

    const handleSearchChange = (e) => {
        const { name, value } = e.target;
        console.log(`Поиск: поле=${name}, значение=`, value);
        setSearchParams(prev => ({
            ...prev,
            [name]: value
        }));
    };

    return { searchParams, filteredData, handleSearchChange };
};

export default useTableSearch;