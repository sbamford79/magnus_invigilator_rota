'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';

export default function CreateSeasonPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);

    if (!name.trim()) {
      setError('Please enter a season name.');
      return;
    }

    setSaving(true);

    const { error } = await supabase.from('seasons').insert({
      name: name.trim(),
      status: 'active',
    });

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push('/admin/shift-setup');
  };

  return (
    <div style={{ maxWidth: 500 }}>
      <h1>Create new season</h1>

      <p>Create a new exam season. New seasons are automatically active.</p>

      {error && (
        <p style={{ color: 'red', marginBottom: 12 }}>
          {error}
        </p>
      )}

      <div style={{ marginBottom: 24 }}>
        <label>
          <strong>Season name</strong>
          <br />
          <input
            type="text"
            value={name}
            placeholder="Y10 Summer Mocks 2026"
            onChange={e => setName(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: 4,
              marginTop: 6,
            }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '8px 12px',
            background: '#002b5c',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {saving ? 'Creating...' : 'Create season'}
        </button>

        <button
          onClick={() => router.push('/admin/shift-setup')}
          disabled={saving}
          style={{
            padding: '8px 12px',
            background: '#e5e5e5',
            color: '#111',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}