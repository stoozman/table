import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from './supabase';

// Map of features to their display names and routes
const FEATURE_MAP = {
  raw_materials: { label: 'Raw Materials', route: '/raw-materials' },
  finished_products: { label: 'Finished Products', route: '/finished-products' },
  tasks: { label: 'Tasks', route: '/tasks' },
  samples: { label: 'Samples', route: '/samples' },
  orders: { label: 'Orders', route: '/orders' },
  sign_document: { label: 'Sign Document', route: '/sign-document' },
  admin: { label: 'Admin', route: '/admin' },
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
      <h2>Welcome, {profile.name || profile.email}!</h2>
      <div className="dashboard-buttons">
        {allowedFeatures.map((feature) => {
          const meta = FEATURE_MAP[feature];
          if (!meta) return null;
          return (
            <button
              key={feature}
              onClick={() => navigate(meta.route)}
              className="dashboard-btn"
            >
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
