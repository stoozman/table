import React, { useState, useEffect, memo } from 'react';

const statusOptions = [
  'новый',
  'в работе',
  'закуплено',
  'отменён',
];

// Глубокое сравнение заказов по id и содержимому
function isOrderEqual(a, b) {
  if (!a || !b) return false;
  const keys = Object.keys(a);
  for (let key of keys) {
    if (typeof a[key] === 'object' && typeof b[key] === 'object') {
      if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
    } else {
      if (a[key] !== b[key]) return false;
    }
  }
  return true;
}

// Функция для цвета строки по статусу
function getRowStyle(status) {
  switch (status) {
    case 'новый':
      return { background: '#fffbe6' };
    case 'в работе':
      return { background: '#e6f7ff' };
    case 'закуплено':
      return { background: '#f6ffed' };
    case 'отменён':
      return { background: '#fff1f0', color: '#a8071a' };
    default:
      return {};
  }
}

// Мемоизированная строка заказа
const OrderRow = memo(function OrderRow({ order, onStatusChange, onQuickOrder }) {
  return (
    <tr style={getRowStyle(order.status)}>
      <td>{order.name}</td>
      <td>{order.link ? <a href={order.link} target="_blank" rel="noopener noreferrer">Ссылка</a> : '-'}</td>
      <td>{order.quantity}</td>
      <td>{order.note}</td>
      <td>
        <select value={order.status || ''} onChange={e => onStatusChange(order.id, e.target.value)}>
          {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </td>
      <td>
        <button onClick={() => onQuickOrder(order)} title="Заказать снова">Заказать снова</button>
      </td>
    </tr>
  );
});

function mergeOrders(prevOrders, newOrders) {
  const prevById = Object.fromEntries(prevOrders.map(x => [x.id, x]));
  return newOrders.map(newOrder => {
    const oldOrder = prevById[newOrder.id];
    if (oldOrder && isOrderEqual(oldOrder, newOrder)) {
      return oldOrder;
    }
    return newOrder;
  });
}

function OrderTable({ orders, loading, onQuickOrder, onStatusChange, onAddOrder }) {
  const [form, setForm] = useState({ name: '', link: '', quantity: '', note: '' });
  const [stableOrders, setStableOrders] = useState(orders);

  useEffect(() => {
    setStableOrders(prev => mergeOrders(prev, orders));
  }, [orders]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.quantity) return;
    onAddOrder(form);
    setForm({ name: '', link: '', quantity: '', note: '' });
  };

  return (
    <div>
      <form onSubmit={handleSubmit} style={{ marginBottom: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input name="name" value={form.name} onChange={handleChange} placeholder="Название" required style={{ minWidth: 120 }} />
        <input name="link" value={form.link} onChange={handleChange} placeholder="Ссылка" style={{ minWidth: 120 }} />
        <input name="quantity" value={form.quantity} onChange={handleChange} placeholder="Количество" required style={{ minWidth: 80 }} />
        <input name="note" value={form.note} onChange={handleChange} placeholder="Примечание" style={{ minWidth: 120 }} />
        <button type="submit">Добавить заказ</button>
      </form>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>Название</th>
            <th>Ссылка</th>
            <th>Количество</th>
            <th>Примечание</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6}>Загрузка...</td></tr>
          ) : stableOrders.length === 0 ? (
            <tr><td colSpan={6}>Нет заказов</td></tr>
          ) : (
            stableOrders.map(order => (
              <OrderRow key={order.id} order={order} onStatusChange={onStatusChange} onQuickOrder={onQuickOrder} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default OrderTable;
