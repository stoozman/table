import React, { useState, useEffect } from 'react';

function DataForm({ onAdd, onEdit, editingItem }) {
    const [formData, setFormData] = useState({
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

    // Инициализация формой данных для редактирования
    useEffect(() => {
        if (editingItem) {
            setFormData({
                name: editingItem.name || '',
                appearance: editingItem.appearance || '',
                supplier: editingItem.supplier || '',
                manufacturer: editingItem.manufacturer || '',
                receipt_date: editingItem.receipt_date || '',
                batch_number: editingItem.batch_number || '',
                manufacture_date: editingItem.manufacture_date || '',
                expiration_date: editingItem.expiration_date || '',
                appearance_match: editingItem.appearance_match || '',
                actual_mass: editingItem.actual_mass || '',
                inspected_metrics: editingItem.inspected_metrics || '',
                investigation_result: editingItem.investigation_result || '',
                passport_standard: editingItem.passport_standard || '',
                full_name: editingItem.full_name || '',
                comment: editingItem.comment || ''
            });
        }
    }, [editingItem]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (editingItem) {
            // Если редактируем, вызываем onEdit
            onEdit({ ...formData, id: editingItem.id });
        } else {
            // Иначе добавляем новые данные
            onAdd(formData);
        }
        setFormData({
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
    };

    const formStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '16px',
        padding: '16px'
    };

    const fieldStyle = {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
    };

    const labelStyle = {
        fontWeight: 'bold',
        fontSize: '14px'
    };

    const inputStyle = {
        padding: '8px',
        border: '1px solid #ccc',
        borderRadius: '4px'
    };

    const buttonStyle = {
        padding: '10px 16px',
        backgroundColor: '#4285f4',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        marginTop: '16px',
        gridColumn: '1 / -1'
    };

    return (
        <form onSubmit={handleSubmit} style={formStyle}>
            <div style={fieldStyle}>
                <label style={labelStyle}>Наименование</label>
                <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    style={inputStyle}
                />
            </div>

            <div style={fieldStyle}>
                <label style={labelStyle}>Внешний вид</label>
                <input
                    type="text"
                    name="appearance"
                    value={formData.appearance}
                    onChange={handleChange}
                    style={inputStyle}
                />
            </div>

            <div style={fieldStyle}>
                <label style={labelStyle}>Поставщик</label>
                <input
                    type="text"
                    name="supplier"
                    value={formData.supplier}
                    onChange={handleChange}
                    style={inputStyle}
                />
            </div>

            <div style={fieldStyle}>
                <label style={labelStyle}>Производитель</label>
                <input
                    type="text"
                    name="manufacturer"
                    value={formData.manufacturer}
                    onChange={handleChange}
                    style={inputStyle}
                />
            </div>

            <div style={fieldStyle}>
                <label style={labelStyle}>Дата поступления</label>
                <input
                    type="date"
                    name="receipt_date"
                    value={formData.receipt_date}
                    onChange={handleChange}
                    style={inputStyle}
                />
            </div>

            <div style={fieldStyle}>
                <label style={labelStyle}>Номер партии</label>
                <input
                    type="text"
                    name="batch_number"
                    value={formData.batch_number}
                    onChange={handleChange}
                    style={inputStyle}
                />
            </div>

            <div style={fieldStyle}>
                <label style={labelStyle}>Дата изготовления</label>
                <input
                    type="date"
                    name="manufacture_date"
                    value={formData.manufacture_date}
                    onChange={handleChange}
                    style={inputStyle}
                />
            </div>

            <div style={fieldStyle}>
                <label style={labelStyle}>Срок годности</label>
                <input
                    type="text"
                    name="expiration_date"
                    value={formData.expiration_date}
                    onChange={handleChange}
                    style={inputStyle}
                />
            </div>

            <div style={fieldStyle}>
                <label style={labelStyle}>Соответствие внешнего вида</label>
                <select
                    name="appearance_match"
                    value={formData.appearance_match}
                    onChange={handleChange}
                    style={inputStyle}
                >
                    <option value="">Выберите</option>
                    <option value="Соответствует">Соответствует</option>
                    <option value="Не соответствует">Не соответствует</option>
                </select>
            </div>

            <div style={fieldStyle}>
                <label style={labelStyle}>Фактическая масса</label>
                <input
                    type="text"
                    name="actual_mass"
                    value={formData.actual_mass}
                    onChange={handleChange}
                    style={inputStyle}
                />
            </div>

            <div style={fieldStyle}>
                <label style={labelStyle}>Проверяемые показатели</label>
                <input
                    type="text"
                    name="inspected_metrics"
                    value={formData.inspected_metrics}
                    onChange={handleChange}
                    style={inputStyle}
                />
            </div>

            <div style={fieldStyle}>
                <label style={labelStyle}>Результат исследования</label>
                <input
                    type="text"
                    name="investigation_result"
                    value={formData.investigation_result}
                    onChange={handleChange}
                    style={inputStyle}
                />
            </div>

            <div style={fieldStyle}>
                <label style={labelStyle}>Норматив по паспорту</label>
                <input
                    type="text"
                    name="passport_standard"
                    value={formData.passport_standard}
                    onChange={handleChange}
                    style={inputStyle}
                />
            </div>

            <div style={fieldStyle}>
                <label style={labelStyle}>ФИО</label>
                <input
                    type="text"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    style={inputStyle}
                />
            </div>

            <div style={fieldStyle}>
                <label style={labelStyle}>Комментарий</label>
                <input
                    type="text"
                    name="comment"
                    value={formData.comment}
                    onChange={handleChange}
                    style={inputStyle}
                />
            </div>

            <button type="submit" style={buttonStyle}>
                {editingItem ? 'Обновить' : 'Добавить'}
            </button>
        </form>
    );
}

export default DataForm;