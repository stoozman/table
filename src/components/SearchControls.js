import React from 'react';

const SearchControls = ({ searchParams, handleSearchChange, isVisible }) => {
    // Если панель скрыта, возвращаем null (ничего не рендерим)
    if (!isVisible) {
        return null;
    }
    
    return (
        <div className="search-controls" style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
            gap: '16px', 
            padding: '16px', 
            backgroundColor: '#f5f5f5', 
            borderRadius: '8px',
            marginBottom: '16px'
        }}>
            {/* Существующие поля */}
            <input
                type="text"
                placeholder="Поиск по наименованию"
                name="name"
                value={searchParams.name || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <input
                type="text"
                placeholder="Поиск по внешнему виду"
                name="appearance"
                value={searchParams.appearance || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <input
                type="text"
                placeholder="Поиск по поставщику"
                name="supplier"
                value={searchParams.supplier || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <input
                type="text"
                placeholder="Поиск по производителю"
                name="manufacturer"
                value={searchParams.manufacturer || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />

            {/* Добавленные поля для остальных столбцов */}
            <input
                type="text"
                placeholder="Поиск по дате поступления"
                name="receipt_date"
                value={searchParams.receipt_date || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <input
                type="text"
                placeholder="Поиск по номеру партии"
                name="batch_number"
                value={searchParams.batch_number || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <input
                type="text"
                placeholder="Поиск по дате изготовления"
                name="manufacture_date"
                value={searchParams.manufacture_date || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <input
                type="text"
                placeholder="Поиск по сроку годности"
                name="expiration_date"
                value={searchParams.expiration_date || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <input
                type="text"
                placeholder="Поиск по соответствию внешнего вида"
                name="appearance_match"
                value={searchParams.appearance_match || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <input
                type="text"
                placeholder="Поиск по фактической массе"
                name="actual_mass"
                value={searchParams.actual_mass || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <input
                type="text"
                placeholder="Поиск по проверяемым показателям"
                name="inspected_metrics"
                value={searchParams.inspected_metrics || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <input
                type="text"
                placeholder="Поиск по результату исследования"
                name="investigation_result"
                value={searchParams.investigation_result || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <input
                type="text"
                placeholder="Поиск по нормативу паспорта"
                name="passport_standard"
                value={searchParams.passport_standard || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <input
                type="text"
                placeholder="Поиск по ФИО"
                name="full_name"
                value={searchParams.full_name || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <input
                type="text"
                placeholder="Поиск по комментарию"
                name="comment"
                value={searchParams.comment || ''}
                onChange={handleSearchChange}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            
            
        </div>
    );
};

export default SearchControls;