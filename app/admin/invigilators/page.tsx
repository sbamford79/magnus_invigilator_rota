'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type Invigilator = {
  id: string;
  full_name: string;
  email: string | null;
  active: boolean;
  auth_user_id: string | null;
};

export default function ManageInvigilatorsPage() {
  const [invigilators, setInvigilators] = useState<Invigilator[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadInvigilators();
  }, []);

  async function loadInvigilators() {
    const { data, error } = await supabase
      .from('invigilators')
      .select('id, full_name, email, active, auth_user_id')
      .order('full_name');

    if (error) {
      setStatus(error.message);
      return;
    }

    setInvigilators((data ?? []) as Invigilator[]);
  }

  async function addInvigilator() {
    if (!name.trim()) {
      setStatus('Name required');
      return;
    }

    const { error } = await supabase.from('invigilators').insert({
      full_name: name.trim(),
      email: email.trim() || null,
      active: true,
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setName('');
    setEmail('');
    setStatus('Invigilator added');
    loadInvigilators();
  }

  async function updateInvigilator(id: string, field: string, value: any) {
    const { error } = await supabase
      .from('invigilators')
      .update({ [field]: value })
      .eq('id', id);

    if (error) {
      setStatus(error.message);
      return;
    }

    loadInvigilators();
  }

  async function toggleActive(inv: Invigilator) {
    const { error } = await supabase
      .from('invigilators')
      .update({ active: !inv.active })
      .eq('id', inv.id);

    if (error) {
      setStatus(error.message);
      return;
    }

    loadInvigilators();
  }

  async function sendSetupEmail(inv: Invigilator) {
    if (!inv.email) {
      setStatus('This invigilator needs an email address first.');
      return;
    }

    setStatus(`Sending setup email to ${inv.full_name}...`);

    const { error } = await supabase.functions.invoke('invite-invigilator', {
      body: {
        email: inv.email,
        invigilatorId: inv.id,
        redirectTo: `${window.location.origin}/reset-password`,
      },
    });

    if (error) {
      setStatus(`Could not send setup email: ${error.message}`);
      return;
    }

    setStatus(`Setup email sent to ${inv.full_name}`);
    loadInvigilators();
  }

  const pendingCount = invigilators.filter(
    inv => inv.active && !inv.auth_user_id
  ).length;

  return (
    <div style={{ padding: 24, maxWidth: 1150, margin: '0 auto' }}>
      <div style={hero}>
        <h1 style={{ margin: 0, fontSize: 32 }}>Manage Invigilators</h1>
        <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.95 }}>
          Add invigilators, manage details, and send or resend setup emails.
        </p>
      </div>

      {pendingCount > 0 && (
        <div style={warningBox}>
          <strong>{pendingCount} invigilator{pendingCount === 1 ? '' : 's'} still need login setup.</strong>
          <div style={{ marginTop: 4 }}>
            Use the “Send setup email” button so they can create their password.
          </div>
        </div>
      )}

      <div style={card}>
        <h2 style={sectionTitle}>Add new invigilator</h2>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            placeholder="Full name"
            value={name}
            onChange={e => setName(e.target.value)}
            style={input}
          />

          <input
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={input}
          />

          <button onClick={addInvigilator} style={primaryButton}>
            Add
          </button>
        </div>

        {status && <div style={statusBox}>{status}</div>}
      </div>

      <div style={card}>
        <h2 style={sectionTitle}>Invigilators</h2>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f3ff' }}>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Login setup</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {invigilators.map(inv => (
                <tr
                  key={inv.id}
                  style={{
                    background: !inv.auth_user_id && inv.active ? '#fffbeb' : 'white',
                  }}
                >
                  <td style={td}>
                    <input
                      value={inv.full_name}
                      onChange={e =>
                        updateInvigilator(inv.id, 'full_name', e.target.value)
                      }
                      style={tableInput}
                    />
                  </td>

                  <td style={td}>
                    <input
                      value={inv.email ?? ''}
                      onChange={e =>
                        updateInvigilator(inv.id, 'email', e.target.value)
                      }
                      style={tableInput}
                    />
                  </td>

                  <td style={td}>
                    {inv.auth_user_id ? (
                      <span style={greenBadge}>Login linked</span>
                    ) : (
                      <span style={amberBadge}>Setup needed</span>
                    )}
                  </td>

                  <td style={td}>
                    {inv.active ? (
                      <span style={greenBadge}>Active</span>
                    ) : (
                      <span style={greyBadge}>Inactive</span>
                    )}
                  </td>

                  <td style={td}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => sendSetupEmail(inv)}
                        style={secondaryButton}
                      >
                        {inv.auth_user_id ? 'Resend setup email' : 'Send setup email'}
                      </button>

                      <button
                        onClick={() => toggleActive(inv)}
                        style={inv.active ? dangerButton : secondaryButton}
                      >
                        {inv.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {invigilators.length === 0 && (
                <tr>
                  <td style={td} colSpan={5}>
                    No invigilators added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const hero: React.CSSProperties = {
  background: 'linear-gradient(135deg, #4c1d95, #6d28d9)',
  color: 'white',
  borderRadius: 16,
  padding: 28,
  marginBottom: 24,
  boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
};

const warningBox: React.CSSProperties = {
  background: '#fffbeb',
  border: '1px solid #fde68a',
  color: '#92400e',
  borderRadius: 14,
  padding: 14,
  marginBottom: 20,
  fontWeight: 600,
};

const card: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 20,
  marginBottom: 22,
  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  color: '#4c1d95',
};

const input: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  minWidth: 220,
};

const tableInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
};

const primaryButton: React.CSSProperties = {
  background: '#4c1d95',
  color: 'white',
  border: 'none',
  padding: '10px 14px',
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 700,
};

const secondaryButton: React.CSSProperties = {
  background: '#f5f3ff',
  color: '#4c1d95',
  border: '1px solid #ddd6fe',
  padding: '8px 10px',
  borderRadius: 9,
  cursor: 'pointer',
  fontWeight: 700,
};

const dangerButton: React.CSSProperties = {
  background: '#fee2e2',
  color: '#991b1b',
  border: '1px solid #fecaca',
  padding: '8px 10px',
  borderRadius: 9,
  cursor: 'pointer',
  fontWeight: 700,
};

const statusBox: React.CSSProperties = {
  marginTop: 14,
  color: '#4c1d95',
  fontWeight: 700,
  background: '#f5f3ff',
  border: '1px solid #ddd6fe',
  borderRadius: 10,
  padding: '9px 12px',
};

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: 12,
  color: '#4c1d95',
  borderBottom: '1px solid #e5e7eb',
};

const td: React.CSSProperties = {
  padding: 12,
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'middle',
};

const greenBadge: React.CSSProperties = {
  display: 'inline-block',
  background: '#dcfce7',
  color: '#166534',
  borderRadius: 999,
  padding: '5px 9px',
  fontSize: 12,
  fontWeight: 700,
};

const greyBadge: React.CSSProperties = {
  display: 'inline-block',
  background: '#f3f4f6',
  color: '#4b5563',
  borderRadius: 999,
  padding: '5px 9px',
  fontSize: 12,
  fontWeight: 700,
};

const amberBadge: React.CSSProperties = {
  display: 'inline-block',
  background: '#fef3c7',
  color: '#92400e',
  borderRadius: 999,
  padding: '5px 9px',
  fontSize: 12,
  fontWeight: 700,
};