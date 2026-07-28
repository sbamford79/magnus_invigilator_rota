'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type Notice = {
  id: string;
  title: string;
  content: string;
  position: number;
};

const defaultNotices: Notice[] = [
  {
    id: 'mock-exams',
    title: 'Mock Exams: Last Updated 6/5/26',
    content:
      'During the Y10 mock exam seasons there will be 2 sessions in a day. The exams will begin at 8:45am and 1:00pm. Please arrive 30 minutes before these start times.',
    position: 1,
  },
  {
    id: 'summer-exams',
    title: 'Summer Exams: Last Updated 6/5/26',
    content:
      'During the summer exam season there will be 2 sessions in a day. The exams will begin at 9:00am and 1:00pm. Please arrive 30 minutes before these start times.',
    position: 2,
  },
  {
    id: 'general-information',
    title: 'General Information',
    content: 'Please check this area for important updates from the exams team.',
    position: 3,
  },
];

export default function InvigilatorInformationPage() {
  const [notices, setNotices] = useState<Notice[]>(defaultNotices);
  const [status, setStatus] = useState('Loading information...');

  useEffect(() => {
    loadNotices();
  }, []);

  async function loadNotices() {
    const { data, error } = await supabase
      .from('invigilator_notices')
      .select('id, title, content, position')
      .order('position', { ascending: true });

    if (error) {
      setStatus(`Unable to load information: ${error.message}`);
      return;
    }

    if (data?.length) {
      setNotices(data as Notice[]);
    }

    setStatus('');
  }

  function updateNotice(id: string, field: 'title' | 'content', value: string) {
    setNotices(current =>
      current.map(notice =>
        notice.id === id ? { ...notice, [field]: value } : notice
      )
    );
  }

  async function saveNotices() {
    setStatus('Saving information...');

    const { error } = await supabase.from('invigilator_notices').upsert(
      notices.map(notice => ({
        id: notice.id,
        title: notice.title.trim(),
        content: notice.content.trim(),
        position: notice.position,
      })),
      { onConflict: 'id' }
    );

    setStatus(error ? `Unable to save information: ${error.message}` : 'Information saved.');
  }

  return (
    <div style={page}>
      <div style={hero}>
        <h1 style={{ margin: 0, fontSize: 32 }}>Invigilator Information</h1>
        <p style={{ margin: '10px 0 0', opacity: 0.95 }}>
          Edit the three information boxes shown at the top of the invigilator dashboard.
        </p>
      </div>

      {status && <div style={statusBox}>{status}</div>}

      <div style={noticeGrid}>
        {notices.map(notice => (
          <section key={notice.id} style={noticeCard}>
            <label style={label} htmlFor={`${notice.id}-title`}>
              Box title
            </label>
            <input
              id={`${notice.id}-title`}
              value={notice.title}
              onChange={event => updateNotice(notice.id, 'title', event.target.value)}
              style={input}
            />

            <label style={label} htmlFor={`${notice.id}-content`}>
              Information
            </label>
            <textarea
              id={`${notice.id}-content`}
              value={notice.content}
              onChange={event => updateNotice(notice.id, 'content', event.target.value)}
              style={textarea}
              rows={7}
            />
          </section>
        ))}
      </div>

      <button onClick={saveNotices} style={saveButton}>
        Save information
      </button>
    </div>
  );
}

const page: React.CSSProperties = { padding: 24, maxWidth: 1100, margin: '0 auto' };
const hero: React.CSSProperties = {
  background: 'linear-gradient(135deg, #4c1d95, #6d28d9)',
  color: 'white',
  borderRadius: 16,
  padding: 28,
  marginBottom: 24,
  boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
};
const statusBox: React.CSSProperties = {
  marginBottom: 18,
  padding: 12,
  borderRadius: 10,
  background: '#f5f3ff',
  color: '#4c1d95',
  border: '1px solid #ddd6fe',
  fontWeight: 700,
};
const noticeGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 18,
  marginBottom: 22,
};
const noticeCard: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
};
const label: React.CSSProperties = {
  display: 'block',
  color: '#4c1d95',
  fontWeight: 700,
  marginBottom: 6,
};
const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 10,
  border: '1px solid #d1d5db',
  borderRadius: 8,
  marginBottom: 16,
  font: 'inherit',
};
const textarea: React.CSSProperties = {
  ...input,
  marginBottom: 0,
  resize: 'vertical',
  lineHeight: 1.5,
};
const saveButton: React.CSSProperties = {
  background: '#4c1d95',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '11px 16px',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
};
