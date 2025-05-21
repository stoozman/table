import { useEffect, useState, useCallback } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import supabase from '../supabase';

export default function ProtectedRoute({ children, requiredPage }) {
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [error, setError] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  
  // Public pages that don't require authentication
  const publicPages = ['/', '/login', '/signup'];
  
  const checkAccess = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      // If it's a public page, allow access
      if (publicPages.includes(location.pathname)) {
        setHasAccess(true);
        setLoading(false);
        return;
      }
      
      // If user is not authenticated, redirect to login
      if (!user || authError) {
        console.log('Пользователь не аутентифицирован');
        setHasAccess(false);
        setLoading(false);
        navigate('/login', { state: { from: location.pathname } });
        return;
      }

      console.log('Проверка доступа для пользователя:', user.id, 'к странице:', requiredPage);
      
      // Check access using direct query first
      const { data: directData, error: directError } = await supabase
        .from('page_permissions')
        .select('*')
        .eq('user_id', user.id)
        .eq('page_path', requiredPage);
        
      console.log('Прямой запрос к таблице:', { directData, directError });
      
      let hasAccessResult = false;
      
      if (directData && directData.length > 0) {
        hasAccessResult = true;
      } else {
        // Fallback to RPC if direct query doesn't return data
        const { data, error: rpcError } = await supabase
          .rpc('has_page_access', { 
            user_id: user.id, 
            page_path: requiredPage 
          });
          
        console.log('RPC вызов:', { data, error: rpcError });
        hasAccessResult = !!data;
      }
      
      setHasAccess(hasAccessResult);
      
      // If no access and not already on home page, redirect to home
      if (!hasAccessResult && location.pathname !== '/') {
        console.log('Доступ запрещен, перенаправление на главную');
        navigate('/', { replace: true });
      }
      
    } catch (e) {
      console.error('Ошибка при проверке доступа:', e);
      setError('Произошла ошибка при проверке доступа');
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  }, [requiredPage, location.pathname, navigate]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // Show loading state
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <div>Проверка доступа...</div>
      </div>
    );
  }
  
  // Show error if any
  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        {error}
      </div>
    );
  }
  
  // If no access, show access denied or redirect
  if (!hasAccess) {
    return (
      <div style={{ padding: '20px' }}>
        <h2>Доступ запрещен</h2>
        <p>У вас нет прав для просмотра этой страницы.</p>
        <button onClick={() => navigate('/')}>На главную</button>
      </div>
    );
  }
  
  // If we get here, user has access
  return children;
}
