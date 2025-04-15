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
        return initialData.filter(item => {
            return Object.entries(searchParams).every(([key, value]) => {
                if (!value) return true;
                let itemValue = item[key];
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