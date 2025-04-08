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

function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [newTask, setNewTask] = useState({
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
      await transferUnfinishedTasks();
      await fetchTasks(selectedDate);
    };
    initializeData();
  }, [selectedDate]);

  const getYesterdayDate = (date) => {
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  };

  const transferUnfinishedTasks = async () => {
    try {
      const yesterday = getYesterdayDate(selectedDate);

      const { data: unfinishedTasks, error } = await supabase
        .from('tasks')
        .select('*')
        .lte('next_due_date', yesterday)
        .eq('completed', false);

      if (error) throw error;

      if (unfinishedTasks?.length > 0) {
        console.log('Незавершенные задачи для переноса:', unfinishedTasks);

        await supabase.from('task_archive').insert(unfinishedTasks);

        const updates = unfinishedTasks.map(task => {
          if (task.repeat_type !== 'none') {
            const nextDue = getNextDueDate(task);
            console.log(`Обновление даты для задачи ${task.id}: ${nextDue}`);
            return supabase
              .from('tasks')
              .update({ next_due_date: nextDue })
              .eq('id', task.id);
          }
          console.log(`Обновление задачи ${task.id}, так как она не повторяется.`);
          return supabase
            .from('tasks')
            .update({ next_due_date: selectedDate.toISOString().split('T')[0] })
            .eq('id', task.id);
        });

        await Promise.all(updates);
      }
    } catch (error) {
      console.error('Ошибка архивации:', error);
    }
  };

  const fetchTasks = async (date) => {
    try {
      const formattedDate = date.toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('date', formattedDate)
        .order('priority');

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Ошибка загрузки задач:', error);
    }
  };

  const getNextDueDate = (task) => {
    const currentDate = new Date(task.next_due_date);
    switch(task.repeat_type) {
      case 'daily': return new Date(currentDate.setDate(currentDate.getDate() + 1));
      case 'weekly': return new Date(currentDate.setDate(currentDate.getDate() + 7));
      case 'monthly': return new Date(currentDate.setMonth(currentDate.getMonth() + 1));
      case 'quarterly': return new Date(currentDate.setMonth(currentDate.getMonth() + 3));
      case 'yearly': return new Date(currentDate.setFullYear(currentDate.getFullYear() + 1));
      case 'specific_date': return new Date(task.repeat_config.date);
      default: return null;
    }
  };

  const handleCompleteTask = async (task) => {
    try {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ completed: !task.completed })
        .eq('id', task.id);

      if (updateError) throw updateError;

      if (task.repeat_type !== 'none' && !task.completed) {
        const nextDueDate = getNextDueDate(task);
        await supabase.from('tasks').insert([{ 
          ...task,
          id: undefined,
          completed: false,
          next_due_date: nextDueDate.toISOString().split('T')[0]
        }]);
      }

      await fetchTasks(selectedDate);
    } catch (error) {
      console.error('Ошибка выполнения задачи:', error);
    }
  };

  const updateTaskComment = async (taskId, newComment) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ comment: newComment })
        .eq('id', taskId);

      if (error) throw error;
      await fetchTasks(selectedDate);
    } catch (error) {
      console.error('Ошибка обновления комментария:', error);
    }
  };

  const addTask = async () => {
    try {
      if (!newTask.product_name.trim()) {
        alert('Введите название задачи');
        return;
      }

      const taskToAdd = {
        ...newTask,
        date: selectedDate.toISOString().split('T')[0],
        next_due_date: newTask.next_due_date
          ? new Date(newTask.next_due_date).toISOString().split('T')[0]
          : selectedDate.toISOString().split('T')[0],
        priority: tasks.length + 1
      };

      const { error } = await supabase
        .from('tasks')
        .insert([taskToAdd]);

      if (error) throw error;

      setNewTask({
        product_name: '',
        comment: '',
        completed: false,
        is_important: false,
        repeat_type: 'none',
        repeat_config: {},
        next_due_date: null
      });

      await fetchTasks(selectedDate);
    } catch (error) {
      console.error('Ошибка добавления задачи:', error);
      alert(`Ошибка: ${error.message}`);
    }
  };

  const moveCardHandler = (dragIndex, hoverIndex) => {
    const draggedTask = tasks[dragIndex];
    const updatedTasks = update(tasks, {
      $splice: [[dragIndex, 1], [hoverIndex, 0, draggedTask]]
    });
    setTasks(updatedTasks);
    updateTaskOrder(updatedTasks);
  };

  const updateTaskOrder = async (updatedTasks) => {
    try {
      const updates = updatedTasks.map((task, index) => 
        supabase
          .from('tasks')
          .update({ priority: index + 1 })
          .eq('id', task.id)
      );
      
      await Promise.all(updates);
      await fetchTasks(selectedDate);
    } catch (error) {
      console.error('Ошибка обновления порядка:', error);
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="task-container">
        <div className="task-header">
          <h1 className="task-title">Планировщик задач</h1>
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
          {tasks
            .filter(task => showCompleted || !task.completed)
            .map((task, index) => (
              <TaskItem 
                key={task.id} 
                task={task} 
                onComplete={handleCompleteTask}
                onUpdateComment={updateTaskComment}
                moveCard={moveCardHandler}
                index={index}
              />
            ))}
        </div>

        <AddTaskForm 
          newTask={newTask}
          setNewTask={setNewTask}
          addTask={addTask}
        />
      </div>
    </DndProvider>
  );
}

const TaskItem = ({ task, onComplete, onUpdateComment, moveCard, index }) => {
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
  const [localComment, setLocalComment] = useState(task.comment);
  const dueDate = new Date(task.next_due_date);
  const isOverdue = dueDate < new Date() && !task.completed;
  const isUrgent = isOverdue && task.is_important;

  const handleCommentSave = async () => {
    await onUpdateComment(task.id, localComment);
    setEditingComment(false);
  };

  return (
    <div 
      ref={(node) => drag(drop(node))}
      className={`task-item ${isUrgent ? 'urgent' : ''} ${task.completed ? 'completed' : ''}`}
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <div className="task-content">
        <div className="task-status">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={() => onComplete(task)}
            className="complete-checkbox"
          />
          <div className="task-info">
            <h3 style={{ textDecoration: task.completed ? 'line-through' : 'none' }}>
              {task.product_name}
              {task.is_important && <span className="important-badge"> ★ Срочно</span>}
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
                      setLocalComment(task.comment);
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
                {task.comment || <span className="add-comment">Добавить комментарий...</span>}
              </div>
            )}
          </div>
        </div>

        <div className="task-meta">
          <span className="due-date">
            {dueDate.toLocaleDateString('ru-RU')}
            {task.repeat_type !== 'none' && (
              <span className="repeat-badge">
                {repeatOptions.find(o => o.value === task.repeat_type)?.label}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};

const AddTaskForm = ({ newTask, setNewTask, addTask }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="add-task-form">
      <div className="basic-fields">
        <input
          type="text"
          placeholder="Название задачи"
          value={newTask.product_name}
          onChange={e => setNewTask({...newTask, product_name: e.target.value})}
          className="task-input"
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
              selected={newTask.next_due_date}
              onChange={date => setNewTask({...newTask, next_due_date: date})}
              dateFormat="dd.MM.yyyy"
              className="date-input"
            />
          </div>

          <div className="form-group">
            <label>Тип повторения:</label>
            <select
              value={newTask.repeat_type}
              onChange={e => setNewTask({...newTask, repeat_type: e.target.value})}
              className="repeat-select"
            >
              {repeatOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {newTask.repeat_type === 'weekly' && (
            <div className="weekdays">
              <label>Дни повторения:</label>
              <div className="weekdays-grid">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, i) => (
                  <label key={i} className="weekday-label">
                    <input
                      type="checkbox"
                      checked={newTask.repeat_config?.days?.includes(i)}
                      onChange={e => {
                        const days = newTask.repeat_config?.days || [];
                        const newDays = e.target.checked 
                          ? [...days, i] 
                          : days.filter(d => d !== i);
                        setNewTask({
                          ...newTask,
                          repeat_config: { ...newTask.repeat_config, days: newDays }
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
                checked={newTask.is_important}
                onChange={e => setNewTask({...newTask, is_important: e.target.checked})}
              />
              Важная задача
            </label>
          </div>

          <textarea
            placeholder="Комментарий"
            value={newTask.comment}
            onChange={e => setNewTask({...newTask, comment: e.target.value})}
            className="task-textarea"
          />
        </div>
      )}

      <button 
        onClick={addTask}
        className="add-button"
      >
        Добавить задачу
      </button>
    </div>
  );
};

export default TasksPage;