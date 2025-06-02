import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from './supabase';

// Оставляем только нужные разделы для дашборда
const FEATURE_MAP = {
  raw_materials: { label: 'Приход сырья', route: '/raw-materials' },
  finished_products: { label: 'Таблица готовой продукции', route: '/finished-products' },
  tasks: { label: 'Задачи', route: '/tasks' },
  samples_table: { label: 'Таблица образцов', route: '/samples-table' },
  orders: { label: 'Заказы', route: '/orders' },
  sign_document_upload: { label: 'Загрузка/скачивание документа', route: '/sign-document/upload' },
  sign_document_sign: { label: 'Подписать документ', route: '/sign-document/sign' },
};

export default function UserDashboard() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error || !data) {
        navigate('/login');
        return;
      }
      setProfile(data);
      setLoading(false);
    };
    fetchProfile();
  }, [navigate]);

  if (loading) return <div>Loading dashboard...</div>;
  if (!profile) return <div>Profile not found.</div>;

  // Permissions: can be an array or object, or a role string
  let allowedFeatures = [];
  if (profile.permissions && Array.isArray(profile.permissions)) {
    allowedFeatures = profile.permissions;
  } else if (profile.role === 'admin') {
    allowedFeatures = Object.keys(FEATURE_MAP);
  } else if (typeof profile.permissions === 'string') {
    try {
      allowedFeatures = JSON.parse(profile.permissions);
    } catch {
      allowedFeatures = [];
    }
  }

  return (
    <div className="dashboard-container">
      <h2>Добро пожаловать, {profile.name || profile.email}!</h2>
      {/* Здесь можно добавить быстрые действия или статистику, если нужно */}
    </div>
  );
}
