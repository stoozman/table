import { useEffect, useState } from 'react';
import supabase from '../supabase';

const ALL_PAGES = [
  'tasks',
  'raw-materials',
  'raw-materials-table',
  'finished-products',
  'samples-table',
  'orders',
  'sign-document',
  'admin'
];

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      // Получаем всех пользователей с их правами доступа
      const { data: users } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          access_granted,
          page_permissions(page_path)
        `)
        .order('email');

      setUsers(users || []);
    } catch (error) {
      console.error('Ошибка загрузки пользователей:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePageAccess = async (userId, page) => {
    try {
      // Проверяем, есть ли уже доступ
      const { data: existing } = await supabase
        .from('page_permissions')
        .select('id')
        .eq('user_id', userId)
        .eq('page_path', page)
        .single();

      if (existing) {
        // Удаляем доступ
        await supabase
          .from('page_permissions')
          .delete()
          .eq('id', existing.id);
      } else {
        // Добавляем доступ
        await supabase
          .from('page_permissions')
          .insert([{ user_id: userId, page_path: page }]);
      }

      // Обновляем список пользователей
      await loadUsers();
    } catch (error) {
      console.error('Ошибка обновления доступа:', error);
    }
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h2>Управление доступом пользователей</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={styles.th}>Пользователь</th>
              {ALL_PAGES.map(page => (
                <th key={page} style={styles.th}>
                  {page}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={styles.tr}>
                <td style={styles.td}>
                  {user.email}
                  {!user.access_granted && ' (ожидает подтверждения)'}
                </td>
                {ALL_PAGES.map(page => {
                  const hasAccess = user.page_permissions?.some(
                    perm => perm.page_path === page
                  );
                  
                  return (
                    <td key={page} style={styles.td}>
                      <input
                        type="checkbox"
                        checked={hasAccess}
                        onChange={() => togglePageAccess(user.id, page)}
                        disabled={!user.access_granted}
                        style={styles.checkbox}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  th: {
    padding: '12px',
    border: '1px solid #ddd',
    backgroundColor: '#f8f9fa',
    textAlign: 'left',
    position: 'sticky',
    top: 0,
    zIndex: 10
  },
  td: {
    padding: '12px',
    border: '1px solid #ddd',
    verticalAlign: 'middle',
    textAlign: 'center'
  },
  tr: {
    '&:nth-child(even)': {
      backgroundColor: '#f9f9f9'
    },
    '&:hover': {
      backgroundColor: '#f1f1f1'
    }
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer'
  }
};
