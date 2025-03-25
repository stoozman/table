import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import update from 'immutability-helper';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function TasksPage() {
    const [tasks, setTasks] = useState([]);
    const [archiveTasks, setArchiveTasks] = useState([]);
    const [showArchive, setShowArchive] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [newTask, setNewTask] = useState({ 
        product_name: '', 
        comment: '', 
        completed: false, 
        is_important: false 
    });

    useEffect(() => {
        transferUnfinishedTasks();
        fetchTasks();
    }, []);

    const transferUnfinishedTasks = async () => {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        let { data: unfinishedTasks, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('date', yesterday)
            .eq('completed', false);

        if (unfinishedTasks && unfinishedTasks.length > 0) {
            await supabase.from('task_archive').insert(
                unfinishedTasks.map(task => ({
                    ...task,
                    original_date: task.date
                }))
            );

            await supabase
                .from('tasks')
                .delete()
                .eq('date', yesterday)
                .eq('completed', false);
        }
    };

    const fetchTasks = async () => {
        const today = new Date().toISOString().split('T')[0];
        let { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('date', today)
            .order('priority');

        if (error) console.error('Error fetching tasks:', error);
        else setTasks(data || []);
    };

    const fetchArchiveTasks = async () => {
        let { data, error } = await supabase
            .from('task_archive')
            .select('*')
            .order('original_date', { ascending: false });

        if (error) console.error('Error fetching archive tasks:', error);
        else setArchiveTasks(data || []);
    };

    const addTask = async () => {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('tasks')
            .insert([{ 
                ...newTask, 
                date: today,
                priority: tasks.length + 1 
            }]);

        if (error) {
            console.error('Error adding task:', error);
            alert(`Ошибка добавления задачи: ${error.message}`);
        } else {
            setNewTask({ 
                product_name: '', 
                comment: '', 
                completed: false, 
                is_important: false 
            });
            fetchTasks();
        }
    };

    const updateTaskOrder = async (updatedTasks) => {
        const updatePromises = updatedTasks.map((task, index) => 
            supabase
                .from('tasks')
                .update({ priority: index + 1 })
                .eq('id', task.id)
        );

        await Promise.all(updatePromises);
        fetchTasks();
    };

    const handleCompleteToggle = async (task) => {
        const { error } = await supabase
            .from('tasks')
            .update({ completed: !task.completed })
            .eq('id', task.id);

        if (error) {
            console.error('Error updating task:', error);
        } else {
            fetchTasks();
        }
    };

    const handleImportanceToggle = async (task) => {
        const { error } = await supabase
            .from('tasks')
            .update({ is_important: !task.is_important })
            .eq('id', task.id);

        if (error) {
            console.error('Error updating task importance:', error);
        } else {
            fetchTasks();
        }
    };

    const updateTaskComment = async (task, newComment) => {
        const { error } = await supabase
            .from('tasks')
            .update({ comment: newComment })
            .eq('id', task.id);

        if (error) {
            console.error('Error updating comment:', error);
        } else {
            setEditingTask(null);
            fetchTasks();
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

    const Card = ({ task, index }) => {
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
                    moveCardHandler(draggedItem.index, index);
                    draggedItem.index = index;
                }
            },
        });

        const [localComment, setLocalComment] = useState(task.comment);

        return (
            <div
                ref={(node) => drag(drop(node))}
                style={{
                    padding: '10px',
                    margin: '5px 0',
                    border: `2px solid ${task.is_important ? 'red' : '#ccc'}`,
                    background: isDragging ? 'lightgray' : '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    textDecoration: task.completed ? 'line-through' : 'none'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input 
                        type="checkbox" 
                        checked={task.completed} 
                        onChange={() => handleCompleteToggle(task)}
                        style={{ marginRight: '10px' }}
                    />
                    <input 
                        type="checkbox" 
                        checked={task.is_important} 
                        onChange={() => handleImportanceToggle(task)}
                        style={{ marginRight: '10px' }}
                    />
                    <div>
                        <strong>{task.product_name}</strong>
                        {editingTask === task.id ? (
                            <div>
                                <textarea
                                    value={localComment}
                                    onChange={(e) => setLocalComment(e.target.value)}
                                    onBlur={() => updateTaskComment(task, localComment)}
                                    style={{ width: '100%' }}
                                />
                                <button onClick={() => updateTaskComment(task, localComment)}>
                                    Сохранить
                                </button>
                            </div>
                        ) : (
                            <p 
                                onClick={() => setEditingTask(task.id)}
                                style={{ cursor: 'pointer' }}
                            >
                                {task.comment || 'Добавить комментарий'}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const toggleArchiveView = () => {
        setShowArchive(!showArchive);
        if (!showArchive) {
            fetchArchiveTasks();
        }
    };

    return (
        <DndProvider backend={HTML5Backend}>
            <div style={{ maxWidth: '500px', margin: '0 auto', padding: '20px' }}>
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center' 
                }}>
                    <h1>{showArchive ? 'Архив задач' : 'Задачи на сегодня'}</h1>
                    <button onClick={toggleArchiveView}>
                        {showArchive ? 'Текущие задачи' : 'Показать архив'}
                    </button>
                </div>

                {!showArchive ? (
                    <>
                        {tasks.map((task, index) => (
                            <Card key={task.id} task={task} index={index} />
                        ))}
                        <div style={{ marginTop: '20px' }}>
                            <input
                                type="text"
                                placeholder="Название продукта"
                                value={newTask.product_name}
                                onChange={(e) => setNewTask({ ...newTask, product_name: e.target.value })}
                                style={{ width: '100%', marginBottom: '10px', padding: '5px' }}
                            />
                            <textarea
                                placeholder="Комментарий"
                                value={newTask.comment}
                                onChange={(e) => setNewTask({ ...newTask, comment: e.target.value })}
                                style={{ width: '100%', marginBottom: '10px', padding: '5px' }}
                            />
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    <input 
                                        type="checkbox" 
                                        checked={newTask.is_important}
                                        onChange={() => setNewTask({ 
                                            ...newTask, 
                                            is_important: !newTask.is_important 
                                        })}
                                    />
                                    Важная задача
                                </label>
                            </div>
                            <button 
                                onClick={addTask}
                                style={{ 
                                    width: '100%', 
                                    padding: '10px', 
                                    backgroundColor: '#4CAF50', 
                                    color: 'white', 
                                    border: 'none' 
                                }}
                            >
                                Добавить задачу
                            </button>
                        </div>
                    </>
                ) : (
                    <div>
                        {archiveTasks.map((task) => (
                            <div 
                                key={task.id} 
                                style={{ 
                                    padding: '10px', 
                                    margin: '5px 0',
                                    border: `2px solid ${task.is_important ? 'red' : '#ccc'}`,
                                    textDecoration: task.completed ? 'line-through' : 'none'
                                }}
                            >
                                <strong>{task.product_name}</strong>
                                <p>Дата: {task.original_date}</p>
                                {task.comment && <p>Комментарий: {task.comment}</p>}
                                <p>Статус: {task.completed ? 'Выполнена' : 'Не выполнена'}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </DndProvider>
    );
}

export default TasksPage;