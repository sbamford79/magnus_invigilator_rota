'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState('');
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!success) return;

    const interval = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    const timeout = setTimeout(() => {
      window.location.href = '/login';
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [success]);

  async function handleReset() {
    setStatus('');

    if (!password || !confirmPassword) {
      setStatus('Please enter and confirm your new password.');
      return;
    }

    if (password.length < 6) {
      setStatus('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setStatus('Passwords do not match.');
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setStatus('❌ ' + error.message);
      return;
    }

    setSuccess(true);
    setStatus('✅ Password updated successfully. Redirecting to login...');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f5f3ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: 'white',
          padding: 32,
          borderRadius: 16,
          width: 420,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          border: '1px solid #e5e7eb',
        }}
      >
        <h1 style={{ textAlign: 'center', color: '#4c1d95', marginBottom: 8 }}>
          Reset Password
        </h1>

        <p style={{ textAlign: 'center', color: '#555', marginBottom: 24 }}>
          Enter your new password below.
        </p>

        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="New password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={inputStyle}
            disabled={success}
          />

          <button
            type="button"
            onClick={() => setShowPassword(prev => !prev)}
            style={showButtonStyle}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        <input
          type={showPassword ? 'text' : 'password'}
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          style={inputStyle}
          disabled={success}
        />

        <p
          style={{
            marginTop: -4,
            marginBottom: 16,
            fontSize: 13,
            color: password.length > 0 && password.length < 6 ? '#991b1b' : '#6b7280',
          }}
        >
          Use at least 6 characters.
        </p>

        <button
          onClick={handleReset}
          style={{
            ...buttonStyle,
            opacity: success ? 0.7 : 1,
            cursor: success ? 'default' : 'pointer',
          }}
          disabled={success}
        >
          {success ? 'Password updated' : 'Set new password'}
        </button>

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

        {success && (
          <p
            style={{
              marginTop: 10,
              textAlign: 'center',
              color: '#555',
              fontSize: 14,
            }}
          >
            Returning to login in {Math.max(countdown, 0)} seconds...
          </p>
        )}

        <div style={{ marginTop: 18, textAlign: 'center' }}>
          <Link
            href="/login"
            style={{
              color: '#4c1d95',
              fontWeight: 600,
              textDecoration: 'underline',
            }}
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 11,
  paddingRight: 70,
  marginBottom: 12,
  borderRadius: 8,
  border: '1px solid #d1d5db',
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: 12,
  backgroundColor: '#4c1d95',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
};

const showButtonStyle: React.CSSProperties = {
  position: 'absolute',
  right: 8,
  top: 7,
  background: '#f5f3ff',
  color: '#4c1d95',
  border: '1px solid #ddd6fe',
  borderRadius: 6,
  padding: '5px 8px',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
};