import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AuthPage({ onAuth }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let result;
      if (isRegister) {
        result = await supabase.auth.signUp({ email, password });
        if (result.error) throw result.error;
        // Добавляем профиль в таблицу profiles
        const userId = result.data.user?.id;
        if (userId) {
          await supabase.from('profiles').insert({ id: userId, email, name });
        }
        alert('Проверьте почту для подтверждения регистрации!');
      } else {
        result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        // Проверяем доступ
        const userId = result.data.user?.id;
        if (userId) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('access_granted')
            .eq('id', userId)
            .single();
          if (profileError) throw profileError;
          if (!profile || !profile.access_granted) {
            setError('Доступ не одобрен. Ожидайте подтверждения администратора.');
            setLoading(false);
            return;
          }
        }
        if (onAuth) onAuth();
      }
    } catch (err) {
      setError(err.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 350, margin: '60px auto', padding: 24, border: '1px solid #ddd', borderRadius: 8, background: '#fafcff' }}>
      <h2 style={{ textAlign: 'center' }}>{isRegister ? 'Регистрация' : 'Вход'}</h2>
      <form onSubmit={handleSubmit}>
        {isRegister && (
          <input
            type="text"
            placeholder="Имя"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            style={{ width: '100%', padding: 8, marginBottom: 12 }}
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ width: '100%', padding: 8, marginBottom: 12 }}
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{ width: '100%', padding: 8, marginBottom: 12 }}
        />
        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: '100%', padding: 10, background: '#007bff', color: '#fff', border: 'none', borderRadius: 4 }}>
          {loading ? 'Загрузка...' : isRegister ? 'Зарегистрироваться' : 'Войти'}
        </button>
      </form>
      <div style={{ marginTop: 12, textAlign: 'center' }}>
        <button type="button" onClick={() => setIsRegister(r => !r)} style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer' }}>
          {isRegister ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
        </button>
      </div>
    </div>
  );
}
