'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

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

export default function InvigilatorHomePage() {
  const [name, setName] = useState('');
  const [notices, setNotices] = useState<Notice[]>(defaultNotices);

  useEffect(() => {
    loadInvigilator();
    loadNotices();
  }, []);

  async function loadInvigilator() {
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) return;

    const { data } = await supabase
      .from('invigilators')
      .select('full_name')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (data?.full_name) {
      setName(data.full_name);
    }
  }

  async function loadNotices() {
    const { data, error } = await supabase
      .from('invigilator_notices')
      .select('id, title, content, position')
      .order('position', { ascending: true });

    if (!error && data?.length) {
      setNotices(data as Notice[]);
    }
  }

  return (
    <div style={page}>
      <div style={header}>
        <h1 style={title}>Welcome{name ? `, ${name}` : ''}</h1>
        <p style={subtitle}>
          Welcome to the Magnus Academy invigilator dashboard. Use the links
          below to manage your shifts and view your schedule.
        </p>
      </div>

      <section aria-label="Important information" style={infoGrid}>
        {notices.map(notice => (
          <div key={notice.id} style={infoCard}>
            <h2 style={sectionTitle}>{notice.title}</h2>
            <p style={sectionText}>{notice.content}</p>
          </div>
        ))}
      </section>

      <div style={cardGrid}>
        <DashboardCard
          href="/invigilator/available-shifts"
          icon="📅"
          title="Available Shifts"
          text="Apply for upcoming shifts"
        />

        <DashboardCard
          href="/invigilator/my-shifts"
          icon="✅"
          title="My Shifts"
          text="View your assigned shifts"
        />

        <DashboardCard
          href="/invigilator/calendar"
          icon="🗓️"
          title="My Calendar"
          text="See your schedule at a glance"
        />

<DashboardCard
  href="/invigilator/exam-timetable"
  icon="📝"
  title="Exam Timetable"
  text="View exams, candidate numbers and upload timetable CSV files."
/>

        <DashboardCard
          href="/invigilator/my-team"
          icon="👥"
          title="My Team Today"
          text="See who you're working with"
        />
      </div>

    </div>
  );
}

function DashboardCard({
  href,
  icon,
  title,
  text,
}: {
  href: string;
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <Link href={href} style={link}>
      <div style={card}>
        <div style={iconStyle}>{icon}</div>
        <h2 style={cardTitle}>{title}</h2>
        <p style={cardText}>{text}</p>
      </div>
    </Link>
  );
}

const page: React.CSSProperties = {
  padding: 24,
  maxWidth: 1100,
  margin: '0 auto',
};

const header: React.CSSProperties = {
  background: 'linear-gradient(135deg, #4c1d95, #6d28d9)',
  color: 'white',
  borderRadius: 16,
  padding: 28,
  marginBottom: 24,
  boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 34,
};

const subtitle: React.CSSProperties = {
  marginTop: 10,
  marginBottom: 0,
  opacity: 0.95,
  fontSize: 16,
};

const cardGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 16,
  marginBottom: 28,
};

const link: React.CSSProperties = {
  textDecoration: 'none',
  color: 'inherit',
};

const card: React.CSSProperties = {
  background: 'white',
  borderRadius: 14,
  padding: 20,
  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
  border: '1px solid #eee',
  minHeight: 130,
};

const iconStyle: React.CSSProperties = {
  fontSize: 28,
  marginBottom: 10,
};

const cardTitle: React.CSSProperties = {
  margin: '0 0 6px 0',
  color: '#4c1d95',
};

const cardText: React.CSSProperties = {
  margin: 0,
  color: '#555',
  fontSize: 14,
};

const infoGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  gap: 20,
  marginBottom: 28,
};

const infoCard: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 14,
  padding: 22,
  border: '1px solid #eee',
  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  color: '#4c1d95',
};

const sectionText: React.CSSProperties = {
  margin: 0,
  lineHeight: 1.6,
  color: '#333',
};
