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
    inspected_metrics: [],
    investigation_result: [],
    passport_standard: [],
    full_name: '',
    comment: ''
  });

  // Состояние для временного ввода значений для множественных полей
  const [inputValues, setInputValues] = useState({
    inspected_metrics: '',
    investigation_result: '',
    passport_standard: ''
  });

  // Инициализация формы данными для редактирования
  useEffect(() => {
    if (editingItem) {
      setFormData({
        ...editingItem,
        inspected_metrics: Array.isArray(editingItem.inspected_metrics) 
          ? editingItem.inspected_metrics 
          : editingItem.inspected_metrics ? [editingItem.inspected_metrics] : [],
        investigation_result: Array.isArray(editingItem.investigation_result) 
          ? editingItem.investigation_result 
          : editingItem.investigation_result ? [editingItem.investigation_result] : [],
        passport_standard: Array.isArray(editingItem.passport_standard) 
          ? editingItem.passport_standard 
          : editingItem.passport_standard ? [editingItem.passport_standard] : []
      });
    }
  }, [editingItem]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Функция для добавления нового значения в указанное поле-массив
  const handleAddToField = (field) => {
    const newValue = inputValues[field].trim();
    if (newValue === '') return;
    setFormData(prev => ({
      ...prev,
      [field]: [...prev[field], newValue]
    }));
    setInputValues(prev => ({
      ...prev,
      [field]: ''
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingItem) {
      onEdit({ ...formData, id: editingItem.id });
    } else {
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
      inspected_metrics: [],
      investigation_result: [],
      passport_standard: [],
      full_name: '',
      comment: ''
    });
    setInputValues({
      inspected_metrics: '',
      investigation_result: '',
      passport_standard: ''
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

      {/* Множественные поля для проверяемых показателей, результата исследования и нормативов */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Проверяемые показатели</label>
        <ul>
          {formData.inspected_metrics.map((metric, idx) => (
            <li key={idx}>{metric}</li>
          ))}
        </ul>
        <input
          type="text"
          value={inputValues.inspected_metrics}
          onChange={(e) =>
            setInputValues({ ...inputValues, inspected_metrics: e.target.value })
          }
          style={inputStyle}
          placeholder="Введите показатель"
        />
        <button type="button" onClick={() => handleAddToField('inspected_metrics')}>
          Добавить показатель
        </button>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Результат исследования</label>
        <ul>
          {formData.investigation_result.map((res, idx) => (
            <li key={idx}>{res}</li>
          ))}
        </ul>
        <input
          type="text"
          value={inputValues.investigation_result}
          onChange={(e) =>
            setInputValues({ ...inputValues, investigation_result: e.target.value })
          }
          style={inputStyle}
          placeholder="Введите результат"
        />
        <button type="button" onClick={() => handleAddToField('investigation_result')}>
          Добавить результат
        </button>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Норматив по паспорту</label>
        <ul>
          {formData.passport_standard.map((std, idx) => (
            <li key={idx}>{std}</li>
          ))}
        </ul>
        <input
          type="text"
          value={inputValues.passport_standard}
          onChange={(e) =>
            setInputValues({ ...inputValues, passport_standard: e.target.value })
          }
          style={inputStyle}
          placeholder="Введите норматив"
        />
        <button type="button" onClick={() => handleAddToField('passport_standard')}>
          Добавить норматив
        </button>
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
