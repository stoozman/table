import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const repeatOptions = [
  { value: 'none', label: 'Без повтора' },
  { value: 'daily', label: 'Ежедневно' },
  { value: 'weekly', label: 'Еженедельно' },
  { value: 'monthly', label: 'Ежемесячно' },
  { value: 'quarterly', label: 'Ежеквартально' },
  { value: 'yearly', label: 'Ежегодно' },
  { value: 'specific_date', label: 'На конкретную дату' }
];

function RawMaterialPage() {
  const [materials, setMaterials] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [newMaterial, setNewMaterial] = useState({
    product_name: '',
    comment: '',
    completed: false,
    is_important: false,
    repeat_type: 'none',
    repeat_config: {},
    next_due_date: null
  });
  const [showCompleted, setShowCompleted] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const initializeData = async () => {
      await transferUnfinishedMaterials();
      await fetchMaterials(selectedDate);
    };
    initializeData();
  }, [selectedDate]);

  const getYesterdayDate = (date) => {
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  };

  const transferUnfinishedMaterials = async () => {
    try {
      const yesterday = getYesterdayDate(selectedDate);

      const { data: unfinishedMaterials, error } = await supabase
        .from('raw_material_tasks')
        .select('*')
        .lte('next_due_date', yesterday)
        .eq('completed', false);

      if (error) throw error;

      if (unfinishedMaterials?.length > 0) {
        console.log('Незавершенные материалы для переноса:', unfinishedMaterials);

        await supabase.from('material_archive').insert(unfinishedMaterials);

        const updates = unfinishedMaterials.map(material => {
          if (material.repeat_type !== 'none') {
            const nextDue = getNextDueDate(material);
            console.log(`Обновление даты для материала ${material.id}: ${nextDue}`);
            return supabase
              .from('raw_material_tasks')
              .update({ next_due_date: nextDue })
              .eq('id', material.id);
          }
          console.log(`Обновление материала ${material.id}, так как он не повторяется.`);
          return supabase
            .from('raw_material_tasks')
            .update({ next_due_date: selectedDate.toISOString().split('T')[0] })
            .eq('id', material.id);
        });

        await Promise.all(updates);
      }
    } catch (error) {
      console.error('Ошибка архивации:', error);
    }
  };

  const fetchMaterials = async (date) => {
    try {
      const formattedDate = date.toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('raw_material_tasks')
        .select('*')
        .eq('date', formattedDate)
        .order('priority');

      if (error) throw error;
      setMaterials(data || []);
    } catch (error) {
      console.error('Ошибка загрузки материалов:', error);
    }
  };

  const getNextDueDate = (material) => {
    const currentDate = new Date(material.next_due_date);
    switch(material.repeat_type) {
      case 'daily': return new Date(currentDate.setDate(currentDate.getDate() + 1));
      case 'weekly': return new Date(currentDate.setDate(currentDate.getDate() + 7));
      case 'monthly': return new Date(currentDate.setMonth(currentDate.getMonth() + 1));
      case 'quarterly': return new Date(currentDate.setMonth(currentDate.getMonth() + 3));
      case 'yearly': return new Date(currentDate.setFullYear(currentDate.getFullYear() + 1));
      case 'specific_date': return new Date(material.repeat_config.date);
      default: return null;
    }
  };

  const handleCompleteMaterial = async (material) => {
    try {
      const { error: updateError } = await supabase
        .from('raw_material_tasks')
        .update({ completed: !material.completed })
        .eq('id', material.id);

      if (updateError) throw updateError;

      if (material.repeat_type !== 'none' && !material.completed) {
        const nextDueDate = getNextDueDate(material);
        await supabase.from('raw_material_tasks').insert([{ 
          ...material,
          id: undefined,
          completed: false,
          next_due_date: nextDueDate.toISOString().split('T')[0]
        }]);
      }

      await fetchMaterials(selectedDate);
    } catch (error) {
      console.error('Ошибка выполнения материала:', error);
    }
  };

  const updateMaterialComment = async (materialId, newComment) => {
    try {
      const { error } = await supabase
        .from('raw_material_tasks')
        .update({ comment: newComment })
        .eq('id', materialId);

      if (error) throw error;
      await fetchMaterials(selectedDate);
    } catch (error) {
      console.error('Ошибка обновления комментария:', error);
    }
  };

  const addMaterial = async () => {
    try {
      if (!newMaterial.product_name.trim()) {
        alert('Введите название материала');
        return;
      }

      const materialToAdd = {
        ...newMaterial,
        date: selectedDate.toISOString().split('T')[0],
        next_due_date: newMaterial.next_due_date
          ? new Date(newMaterial.next_due_date).toISOString().split('T')[0]
          : selectedDate.toISOString().split('T')[0],
        priority: materials.length + 1
      };

      const { error } = await supabase
        .from('raw_material_tasks')
        .insert([materialToAdd]);

      if (error) throw error;

      setNewMaterial({
        product_name: '',
        comment: '',
        completed: false,
        is_important: false,
        repeat_type: 'none',
        repeat_config: {},
        next_due_date: null
      });

      await fetchMaterials(selectedDate);
    } catch (error) {
      console.error('Ошибка добавления материала:', error);
      alert(`Ошибка: ${error.message}`);
    }
  };

  const moveCardHandler = (dragIndex, hoverIndex) => {
    const draggedMaterial = materials[dragIndex];
    const updatedMaterials = update(materials, {
      $splice: [[dragIndex, 1], [hoverIndex, 0, draggedMaterial]]
    });
    setMaterials(updatedMaterials);
    updateMaterialOrder(updatedMaterials);
  };

  const updateMaterialOrder = async (updatedMaterials) => {
    try {
      const updates = updatedMaterials.map((material, index) => 
        supabase
          .from('raw_material_tasks')
          .update({ priority: index + 1 })
          .eq('id', material.id)
      );
      
      await Promise.all(updates);
      await fetchMaterials(selectedDate);
    } catch (error) {
      console.error('Ошибка обновления порядка:', error);
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="task-container">
        <div className="task-header">
          <h1 className="task-title">Приход сырья</h1>
          <div className="time-section">
            <div className="current-time">
              {currentTime.toLocaleTimeString('ru-RU')}
            </div>
            <DatePicker
              selected={selectedDate}
              onChange={setSelectedDate}
              dateFormat="dd.MM.yyyy"
              className="date-picker"
              locale="ru"
            />
          </div>
        </div>

        <div className="filter-controls">
          <label className="filter-label">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            Показывать выполненные
          </label>
        </div>

        <div className="tasks-list">
          {materials
            .filter(material => showCompleted || !material.completed)
            .map((material, index) => (
              <MaterialItem 
                key={material.id} 
                material={material} 
                onComplete={handleCompleteMaterial}
                onUpdateComment={updateMaterialComment}
                moveCard={moveCardHandler}
                index={index}
              />
            ))}
        </div>

        <AddMaterialForm 
          newMaterial={newMaterial}
          setNewMaterial={setNewMaterial}
          addMaterial={addMaterial}
        />
      </div>
    </DndProvider>
  );
}

const MaterialItem = ({ material, onComplete, onUpdateComment, moveCard, index }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'CARD',
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'CARD',
    hover: (draggedItem) => {
      if (draggedItem.index !== index) {
        moveCard(draggedItem.index, index);
        draggedItem.index = index;
      }
    },
  });

  const [editingComment, setEditingComment] = useState(false);
  const [localComment, setLocalComment] = useState(material.comment);
  const dueDate = new Date(material.next_due_date);
  const isOverdue = dueDate < new Date() && !material.completed;
  const isUrgent = isOverdue && material.is_important;

  const handleCommentSave = async () => {
    await onUpdateComment(material.id, localComment);
    setEditingComment(false);
  };

  return (
    <div 
      ref={(node) => drag(drop(node))}
      className={`material-item ${isUrgent ? 'urgent' : ''} ${material.completed ? 'completed' : ''}`}
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <div className="material-content">
        <div className="material-status">
          <input
            type="checkbox"
            checked={material.completed}
            onChange={() => onComplete(material)}
            className="complete-checkbox"
          />
          <div className="material-info">
            <h3 style={{ textDecoration: material.completed ? 'line-through' : 'none' }}>
              {material.product_name}
              {material.is_important && <span className="important-badge"> ★ Срочно</span>}
            </h3>
            
            {editingComment ? (
              <div className="comment-editor">
                <textarea
                  value={localComment}
                  onChange={(e) => setLocalComment(e.target.value)}
                  className="comment-textarea"
                  placeholder="Введите комментарий..."
                />
                <div className="comment-buttons">
                  <button 
                    onClick={handleCommentSave}
                    className="save-button"
                  >
                    Сохранить
                  </button>
                  <button 
                    onClick={() => {
                      setLocalComment(material.comment);
                      setEditingComment(false);
                    }}
                    className="cancel-button"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div 
                className="comment-display"
                onClick={() => setEditingComment(true)}
              >
                {material.comment || <span className="add-comment">Добавить комментарий...</span>}
              </div>
            )}
          </div>
        </div>

        <div className="material-meta">
          <span className="due-date">
            {dueDate.toLocaleDateString('ru-RU')}
            {material.repeat_type !== 'none' && (
              <span className="repeat-badge">
                {repeatOptions.find(o => o.value === material.repeat_type)?.label}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};

const AddMaterialForm = ({ newMaterial, setNewMaterial, addMaterial }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="add-material-form">
      <div className="basic-fields">
        <input
          type="text"
          placeholder="Название сырья"
          value={newMaterial.product_name}
          onChange={e => setNewMaterial({...newMaterial, product_name: e.target.value})}
          className="material-input"
        />
        <button 
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="toggle-button"
        >
          {showAdvanced ? 'Скрыть' : 'Доп. настройки'}
        </button>
      </div>

      {showAdvanced && (
        <div className="advanced-settings">
          <div className="form-group">
            <label>Дата выполнения:</label>
            <DatePicker
              selected={newMaterial.next_due_date}
              onChange={date => setNewMaterial({...newMaterial, next_due_date: date})}
              dateFormat="dd.MM.yyyy"
              className="date-input"
            />
          </div>

          <div className="form-group">
            <label>Тип повторения:</label>
            <select
              value={newMaterial.repeat_type}
              onChange={e => setNewMaterial({...newMaterial, repeat_type: e.target.value})}
              className="repeat-select"
            >
              {repeatOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {newMaterial.repeat_type === 'weekly' && (
            <div className="weekdays">
              <label>Дни повторения:</label>
              <div className="weekdays-grid">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, i) => (
                  <label key={i} className="weekday-label">
                    <input
                      type="checkbox"
                      checked={newMaterial.repeat_config?.days?.includes(i)}
                      onChange={e => {
                        const days = newMaterial.repeat_config?.days || [];
                        const newDays = e.target.checked 
                          ? [...days, i] 
                          : days.filter(d => d !== i);
                        setNewMaterial({
                          ...newMaterial,
                          repeat_config: { ...newMaterial.repeat_config, days: newDays }
                        });
                      }}
                    />
                    {day}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={newMaterial.is_important}
                onChange={e => setNewMaterial({...newMaterial, is_important: e.target.checked})}
              />
              Важный материал
            </label>
          </div>

          <textarea
            placeholder="Комментарий"
            value={newMaterial.comment}
            onChange={e => setNewMaterial({...newMaterial, comment: e.target.value})}
            className="material-textarea"
          />
        </div>
      )}

      <button 
        onClick={addMaterial}
        className="add-button"
      >
        Добавить сырьё
      </button>
    </div>
  );
};

export default RawMaterialPage;
