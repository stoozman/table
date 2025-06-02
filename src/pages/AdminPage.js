import { useEffect, useState } from 'react';
import supabase from '../supabase';

export default function AdminPage() {
  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h2>Страница администратора</h2>
      <div>Здесь будет функционал для управления пользователями.</div>
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
