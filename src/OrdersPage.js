import React, { useEffect, useState, useCallback } from 'react';
import OrderTable from './components/OrderTable';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    let { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setOrders(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();
    const sub = supabase.channel('orders-list-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
        fetchOrders();
      })
      .subscribe();
    setSubscription(sub);
    return () => {
      if (subscription) supabase.removeChannel(subscription);
      supabase.removeChannel(sub);
    };
  }, [fetchOrders]);

  const handleQuickOrder = async (oldOrder) => {
    const { id, created_at, updated_at, last_ordered_at, status, ...rest } = oldOrder;
    const newOrder = {
      ...rest,
      status: 'новый',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_ordered_at: new Date().toISOString()
    };
    const { error } = await supabase.from('orders').insert([newOrder]);
    if (!error) fetchOrders();
  };

  const handleStatusChange = async (id, status) => {
    const { error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) fetchOrders();
  };

  const handleAddOrder = async (order) => {
    const { error } = await supabase.from('orders').insert([{ ...order, status: 'новый', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
    if (!error) fetchOrders();
  };

  const handleEditOrder = async (updatedOrder) => {
    const { id, ...fields } = updatedOrder;
    const { error } = await supabase
      .from('orders')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) fetchOrders();
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Заказы</h2>
      <OrderTable
        orders={orders}
        loading={loading}
        onQuickOrder={handleQuickOrder}
        onStatusChange={handleStatusChange}
        onAddOrder={handleAddOrder}
        onEditOrder={handleEditOrder}
      />
    </div>
  );
}

export default OrdersPage;
