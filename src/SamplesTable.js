import React, { useState, useEffect } from 'react';
import { Button, Modal, Form, Input, DatePicker, Select, Upload, message, Table, Checkbox } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, ClearOutlined } from '@ant-design/icons';
import { createClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';

const { Option } = Select;

function SamplesTable({ data, table, onAdd, onEdit, onDelete, supabase }) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingRecord, setEditingRecord] = useState(null);
  const [fileList, setFileList] = useState([]);
  const navigate = useNavigate();

  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
  const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;
  const supabaseClient = createClient(supabaseUrl, supabaseKey);

  // Специальные поля, требующие особой обработки
  const specialFields = ['inspected_metrics', 'investigation_result', 'passport_standard'];
  
  // Функция для отображения данных в таблице - показывает каждое значение с новой строки
  const displayValueInTable = (value) => {
    if (value === null || value === undefined) return '';
    
    let processedValue = value;
    
    // Если это строка - попытаться распарсить JSON
    if (typeof value === 'string') {
      try {
        processedValue = JSON.parse(value);
      } catch (e) {
        // Если не получается распарсить - оставить как есть
      }
    }
    
    // Если это массив - отобразить каждый элемент с новой строки
    if (Array.isArray(processedValue)) {
      return (
        <div>
          {processedValue.map((item, index) => (
            <div key={index}>{String(item)}</div>
          ))}
        </div>
      );
    }
    
    return String(processedValue);
  };
  
  // Recursively parse nested JSON strings and flatten arrays into items
  const extractItems = (value) => {
    let v = value;
    // Unwrap JSON strings until not a valid JSON string
    while (typeof v === 'string') {
      try { v = JSON.parse(v); } catch { break; }
    }
    // If array, recurse
    if (Array.isArray(v)) {
      return v.flatMap(item => extractItems(item));
    }
    // Otherwise, primitive or object
    return [v];
  };
  // Convert value to newline-separated string for editing
  const convertToEditableString = (value) => {
    const items = extractItems(value);
    return items.map(item => (item != null ? String(item) : '')).join('\n');
  };

  const columns = [
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: 'Поставщик',
      dataIndex: 'supplier',
      key: 'supplier',
      width: 150,
    },
    {
      title: 'Номер партии',
      dataIndex: 'batch_number',
      key: 'batch_number',
      width: 120,
    },
    {
      title: 'Дата',
      dataIndex: 'date',
      key: 'date',
      width: 100,
      render: (date) => date ? new Date(date).toLocaleDateString() : '-',
    },
    {
      title: 'Внешний вид',
      dataIndex: 'appearance',
      key: 'appearance',
      width: 150,
    },
    {
      title: 'Производитель',
      dataIndex: 'manufacturer',
      key: 'manufacturer',
      width: 150,
    },
    {
      title: 'Дата поступления',
      dataIndex: 'receipt_date',
      key: 'receipt_date',
      width: 120,
      render: (date) => date ? new Date(date).toLocaleDateString() : '-',
    },
    {
      title: 'Дата проверки',
      dataIndex: 'check_date',
      key: 'check_date',
      width: 120,
      render: (date) => date ? new Date(date).toLocaleDateString() : '-',
    },
    {
      title: 'Дата производства',
      dataIndex: 'manufacture_date',
      key: 'manufacture_date',
      width: 120,
      render: (date) => date ? new Date(date).toLocaleDateString() : '-',
    },
    {
      title: 'Срок годности',
      dataIndex: 'expiration_date',
      key: 'expiration_date',
      width: 100,
    },
    {
      title: 'Соответствие',
      dataIndex: 'appearance_match',
      key: 'appearance_match',
      width: 100,
    },
    {
      title: 'Фактическая масса',
      dataIndex: 'actual_mass',
      key: 'actual_mass',
      width: 100,
    },
    {
      title: 'Проверяемые показатели',
      dataIndex: 'inspected_metrics',
      key: 'inspected_metrics',
      width: 150,
      render: (text) => displayValueInTable(text),
    },
    {
      title: 'Результат исследования',
      dataIndex: 'investigation_result',
      key: 'investigation_result',
      width: 150,
      render: (text) => displayValueInTable(text),
    },
    {
      title: 'Норматив по паспорту',
      dataIndex: 'passport_standard',
      key: 'passport_standard',
      width: 150,
      render: (text) => displayValueInTable(text),
    },
    {
      title: 'ФИО',
      dataIndex: 'full_name',
      key: 'full_name',
      width: 100,
    },
    {
      title: 'Акт',
      dataIndex: 'act',
      key: 'act',
      width: 100,
    },
    {
      title: 'Наклейка',
      dataIndex: 'label',
      key: 'label',
      width: 100,
    },
    {
      title: 'Комментарий',
      dataIndex: 'comment',
      key: 'comment',
      width: 150,
    },
    {
      title: 'Действия',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Редактировать
          </Button>
          <Button
            type="danger"
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            Удалить
          </Button>
        </div>
      ),
    },
  ];

  const handleAdd = () => {
    setIsModalVisible(true);
    setEditingRecord(null);
    form.resetFields();
  };

  const handleEdit = (record) => {
    setIsModalVisible(true);
    setEditingRecord(record);
    // Подготовка массива для Form.List
    const formData = { ...record };
    specialFields.forEach(field => {
      formData[field] = extractItems(record[field]);
    });
    console.log('handleEdit - populating fields:', formData);
    form.setFieldsValue(formData);
  };

  const handleDelete = async (id) => {
    try {
      const { error } = await supabaseClient
        .from(table)
        .delete()
        .eq('id', id);

      if (error) throw error;

      onDelete(id);
      message.success('Запись успешно удалена');
    } catch (error) {
      message.error('Ошибка при удалении записи');
      console.error('Ошибка при удалении:', error);
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const formattedValues = { ...values };
      // Убедимся, что массивные поля есть
      specialFields.forEach(field => {
        if (!Array.isArray(formattedValues[field])) {
          formattedValues[field] = [];
        }
      });

      if (editingRecord) {
        // Обновление записи
        const { error } = await supabaseClient
          .from(table)
          .update(formattedValues)
          .eq('id', editingRecord.id);

        if (error) throw error;

        onEdit({ id: editingRecord.id, ...formattedValues });
        message.success('Запись успешно обновлена');
      } else {
        // Добавление новой записи
        const { error } = await supabaseClient
          .from(table)
          .insert([formattedValues]);

        if (error) throw error;

        onAdd(formattedValues);
        message.success('Запись успешно добавлена');
      }

      setIsModalVisible(false);
      setEditingRecord(null);
      form.resetFields();
    } catch (error) {
      message.error('Ошибка при сохранении записи');
      console.error('Ошибка при сохранении:', error);
    }
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setEditingRecord(null);
    form.resetFields();
  };

  const beforeUpload = (file) => {
    const isLt2M = file.size / 1024 / 1024 < 2;
    if (!isLt2M) {
      message.error('Файл должен быть меньше 2MB!');
    }
    return isLt2M;
  };

  const handleUpload = async (files) => {
    try {
      const formData = new FormData();
      formData.append('files', files[0]);

      const { error } = await supabaseClient
        .storage
        .from('samples-documents')
        .upload(files[0].name, files[0]);

      if (error) throw error;

      message.success('Файл успешно загружен');
    } catch (error) {
      message.error('Ошибка при загрузке файла');
      console.error('Ошибка при загрузке:', error);
    }
  };

  // Вспомогательная функция для отображения метки
  const renderFormItemLabel = (label, required = false) => (
    <div style={{ marginBottom: '8px' }}>
      <span>
        {label}
        {required && <span style={{ color: '#ff4d4f', marginLeft: '4px' }}>*</span>}
      </span>
    </div>
  );

  const renderForm = () => (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleOk}
    >
      <Form.Item
        name="name"
        label="Название"
        rules={[{ required: true, message: 'Введите название' }]}
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="supplier"
        label="Поставщик"
        rules={[{ required: true, message: 'Введите поставщика' }]}
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="batch_number"
        label="Номер партии"
        rules={[{ required: true, message: 'Введите номер партии' }]}
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="date"
        label="Дата"
        rules={[{ required: true, message: 'Выберите дату' }]}
      >
        <DatePicker />
      </Form.Item>

      <Form.Item
        name="appearance"
        label="Внешний вид"
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="manufacturer"
        label="Производитель"
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="receipt_date"
        label="Дата поступления"
      >
        <DatePicker />
      </Form.Item>

      <Form.Item
        name="check_date"
        label="Дата проверки"
      >
        <DatePicker />
      </Form.Item>

      <Form.Item
        name="manufacture_date"
        label="Дата производства"
      >
        <DatePicker />
      </Form.Item>

      <Form.Item
        name="expiration_date"
        label="Срок годности"
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="appearance_match"
        label="Соответствие"
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="actual_mass"
        label="Фактическая масса"
      >
        <Input />
      </Form.Item>

      {/* Список проверяемых показателей */}
      <Form.Item label="Показатели" style={{ marginBottom: 0 }}>
        <Form.List name="inspected_metrics">
          {(fields, { add, remove }) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              {fields.map(({ key, name, fieldKey, ...rest }) => (
                <div key={key} style={{ display: 'flex', flexDirection: 'row', gap: 8, width: '100%' }}>
                  <Form.Item
                    {...rest}
                    name={[name]}
                    fieldKey={[fieldKey]}
                    rules={[]}
                    style={{ flex: 1, marginBottom: 0 }}
                  >
                    <Input placeholder="Новое значение" />
                  </Form.Item>
                  <Button icon={<ClearOutlined />} onClick={() => remove(name)} />
                </div>
              ))}
              <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} style={{ width: '100%' }}>+</Button>
            </div>
          )}
        </Form.List>
      </Form.Item>

      {/* Список результатов исследования */}
      <Form.Item label="Результаты" style={{ marginBottom: 0 }}>
        <Form.List name="investigation_result">
          {(fields, { add, remove }) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              {fields.map(({ key, name, fieldKey, ...rest }) => (
                <div key={key} style={{ display: 'flex', flexDirection: 'row', gap: 8, width: '100%' }}>
                  <Form.Item
                    {...rest}
                    name={[name]}
                    fieldKey={[fieldKey]}
                    rules={[]}
                    style={{ flex: 1, marginBottom: 0 }}
                  >
                    <Input placeholder="Новое значение" />
                  </Form.Item>
                  <Button icon={<ClearOutlined />} onClick={() => remove(name)} />
                </div>
              ))}
              <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} style={{ width: '100%' }}>+</Button>
            </div>
          )}
        </Form.List>
      </Form.Item>

      {/* Список нормативов */}
      <Form.Item label="Нормативы" style={{ marginBottom: 0 }}>
        <Form.List name="passport_standard">
          {(fields, { add, remove }) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              {fields.map(({ key, name, fieldKey, ...rest }) => (
                <div key={key} style={{ display: 'flex', flexDirection: 'row', gap: 8, width: '100%' }}>
                  <Form.Item
                    {...rest}
                    name={[name]}
                    fieldKey={[fieldKey]}
                    rules={[]}
                    style={{ flex: 1, marginBottom: 0 }}
                  >
                    <Input placeholder="Новое значение" />
                  </Form.Item>
                  <Button icon={<ClearOutlined />} onClick={() => remove(name)} />
                </div>
              ))}
              <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} style={{ width: '100%' }}>+</Button>
            </div>
          )}
        </Form.List>
      </Form.Item>

      <Form.Item
        name="full_name"
        label="ФИО"
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="act"
        label="Акт"
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="label"
        label="Наклейка"
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="comment"
        label="Комментарий"
      >
        <Input.TextArea rows={4} />
      </Form.Item>

      <Form.Item
        name="act_link"
        label="Ссылка на акт"
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="documents"
        label="Документы"
      >
        <Upload
          fileList={fileList}
          beforeUpload={beforeUpload}
          onChange={({ fileList: newFileList }) => setFileList(newFileList)}
          onRemove={() => setFileList([])}
          customRequest={handleUpload}
        >
          <Button icon={<UploadOutlined />}>Загрузить документы</Button>
        </Upload>
      </Form.Item>

      <Form.Item>
        <Button type="primary" htmlType="submit">
          Сохранить
        </Button>
        <Button onClick={handleCancel} style={{ marginLeft: 8 }}>
          Отмена
        </Button>
      </Form.Item>
    </Form>
  );

  return (
    <div>
      <Button type="primary" onClick={handleAdd} style={{ marginBottom: 16 }}>
        <PlusOutlined /> Добавить образец
      </Button>

      <Modal
        title={editingRecord ? 'Редактировать образец' : 'Добавить образец'}
        visible={isModalVisible}
        onCancel={handleCancel}
        width={800}
        footer={null}
      >
        {renderForm()}
      </Modal>

      <Table
        columns={columns}
        dataSource={data}
        bordered
        pagination={{ pageSize: 10 }}
        rowKey="id"
        scroll={{ x: 1500 }}
      />
    </div>
  );
}

export default SamplesTable;