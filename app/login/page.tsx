'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  async function handleLogin() {
    setStatus('Logging in…');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus('❌ ' + error.message);
      return;
    }

    if (!data.session) {
      setStatus('⚠️ Login completed but no session found.');
      return;
    }

    const userId = data.session.user.id;

    const { data: invigilator } = await supabase
      .from('invigilators')
      .select('id')
      .eq('auth_user_id', userId)
      .maybeSingle();

    setStatus('✅ Login successful');

    if (invigilator) {
      window.location.href = '/invigilator';
    } else {
      window.location.href = '/admin';
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setStatus('Please enter your email first');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setStatus('❌ ' + error.message);
      return;
    }

    setStatus('Password reset email sent. Please check your inbox.');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f3ff',
        padding: 24,
      }}
    >
      <div
        style={{
          background: 'white',
          padding: 32,
          borderRadius: 16,
          width: 380,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          border: '1px solid #e5e7eb',
        }}
      >
        <h2 style={{ textAlign: 'center', color: '#4c1d95', marginBottom: 6 }}>
          Magnus Academy
        </h2>

        <p style={{ textAlign: 'center', marginBottom: 24, color: '#555' }}>
          Invigilator Rota
        </p>

        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{
            width: '100%',
            padding: 11,
            marginBottom: 12,
            borderRadius: 8,
            border: '1px solid #d1d5db',
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{
            width: '100%',
            padding: 11,
            marginBottom: 16,
            borderRadius: 8,
            border: '1px solid #d1d5db',
          }}
        />

        <button
          onClick={handleLogin}
          style={{
            width: '100%',
            padding: 12,
            backgroundColor: '#4c1d95',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Log in
        </button>

        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <button
            onClick={handleForgotPassword}
            style={{
              background: 'none',
              border: 'none',
              color: '#4c1d95',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
              fontSize: 14,
            }}
          >
            Forgot password?
          </button>
        </div>

        {status && (
          <div
            style={{
              marginTop: 16,
              textAlign: 'center',
              color: status.startsWith('❌') ? '#991b1b' : '#4c1d95',
              fontWeight: 600,
            }}
          >
            {status}
          </div>
        )}
      </div>
    </div>
  );
}