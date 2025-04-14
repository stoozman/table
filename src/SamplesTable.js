import React, { useState } from 'react';
import { Button, Modal, Form, Input, DatePicker, Select, Upload, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
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
      title: 'Показатели',
      dataIndex: 'inspected_metrics',
      key: 'inspected_metrics',
      width: 100,
    },
    {
      title: 'Результат',
      dataIndex: 'investigation_result',
      key: 'investigation_result',
      width: 100,
    },
    {
      title: 'Паспорт',
      dataIndex: 'passport_standard',
      key: 'passport_standard',
      width: 100,
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
    form.setFieldsValue(record);
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
      
      if (editingRecord) {
        // Обновление записи
        const { error } = await supabaseClient
          .from(table)
          .update(values)
          .eq('id', editingRecord.id);

        if (error) throw error;

        onEdit(values);
        message.success('Запись успешно обновлена');
      } else {
        // Добавление новой записи
        const { error } = await supabaseClient
          .from(table)
          .insert([values]);

        if (error) throw error;

        onAdd(values);
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

      <Form.Item
        name="inspected_metrics"
        label="Показатели"
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="investigation_result"
        label="Результат"
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="passport_standard"
        label="Паспорт"
      >
        <Input />
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
  onOk={handleOk}
  onCancel={handleCancel}
  width={800}
>
  {renderForm()}
</Modal>

<Table
  columns={columns}
  dataSource={data}
  bordered
  pagination={{ pageSize: 10 }}
  rowKey="id"
/>
</div>
);
}

export default SamplesTable;