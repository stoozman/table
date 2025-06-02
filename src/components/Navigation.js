import { Link, useLocation } from 'react-router-dom';
import supabase from '../supabase';
import { useEffect, useState } from 'react';

const pages = [
  { path: 'tasks', name: 'Задачи' },
  { path: 'raw-materials', name: 'Сырьё' },
  { path: 'raw-materials-table', name: 'Таблица сырья' },
  { path: 'finished-products', name: 'ГП' },
  { path: 'samples-table', name: 'Образцы' },
  { path: 'orders', name: 'Заказы' },
  { path: 'sign-document', name: 'Подписать документ' }
];

export default function Navigation() {
  const location = useLocation();
  const [userPages, setUserPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUserPages = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) {
          console.error('Ошибка аутентификации:', authError);
          setError('Ошибка загрузки данных пользователя');
          setLoading(false);
          return;
        }
        
        if (!user) {
          setLoading(false);
          return;
        }

        const { data, error: queryError } = await supabase
          .from('page_permissions')
          .select('page_path')
          .eq('user_id', user.id);

        if (queryError) {
          console.error('Ошибка загрузки прав доступа:', queryError);
          setError('Ошибка загрузки прав доступа');
          setLoading(false);
          return;
        }

        setUserPages(data?.map(item => item.page_path) || []);
      } catch (e) {
        console.error('Непредвиденная ошибка:', e);
        setError('Произошла ошибка при загрузке навигации');
      } finally {
        setLoading(false);
      }
    };

    fetchUserPages();
  }, []);

  if (loading) return <div style={{ padding: '10px', color: '#666' }}>Загрузка навигации...</div>;
  if (error) return <div style={{ padding: '10px', color: 'red' }}>{error}</div>;

  return (
    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
      {pages
        .filter(page => userPages.includes(page.path))
        .map(page => (
          <Link 
            key={page.path} 
            to={`/${page.path}`}
            style={{
              padding: '8px 16px',
              background: location.pathname === `/${page.path}` ? '#007bff' : '#f0f0f0',
              color: location.pathname === `/${page.path}` ? 'white' : 'black',
              borderRadius: '4px',
              textDecoration: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            {page.name}
          </Link>
        ))}
    </div>
  );
}
