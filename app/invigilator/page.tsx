'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { toYMD } from '../../lib/dateHelpers';

type Notice = {
  id: string;
  title: string;
  content: string;
  position: number;
};

type ShiftNotification = {
  id: string;
  notification_type: 'shifts_available' | 'assignments_published';
  title: string;
  message: string;
  created_at: string;
};

type TodayShift = {
  assignmentId: string;
  session: 'morning' | 'mid' | 'afternoon';
  label: string;
  clockInAt: string | null;
  clockOutAt: string | null;
};

function formatSession(session: TodayShift['session']) {
  if (session === 'mid') return 'Mid';
  return session.charAt(0).toUpperCase() + session.slice(1);
}

function formatClockTime(value: string | null) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
  const [shiftNotifications, setShiftNotifications] = useState<
    ShiftNotification[]
  >([]);
  const [todayShifts, setTodayShifts] = useState<TodayShift[]>([]);
  const [clockingId, setClockingId] = useState<string | null>(null);
  const [clockStatus, setClockStatus] = useState('');

  useEffect(() => {
    loadInvigilator();
    loadNotices();
  }, []);

  async function loadInvigilator() {
    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) return;

    const { data } = await supabase
      .from('invigilators')
      .select('id, full_name')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (data?.full_name) {
      setName(data.full_name);
    }

    if (!data?.id) return;

    const { data: activeSeasonRows } = await supabase
      .from('seasons')
      .select('id')
      .eq('status', 'active');

    const activeSeasonIds = new Set(
      (activeSeasonRows ?? []).map(season => season.id)
    );

    const { data: assignmentRows } = await supabase
      .from('shift_assignments')
      .select(`
        id,
        clock_in_at,
        clock_out_at,
        shift_slots (
          session_key,
          exam_days (
            season_id,
            exam_date,
            label
          )
        )
      `)
      .eq('invigilator_id', data.id)
      .eq('published', true);

    const today = toYMD(new Date());
    const sessionOrder = { morning: 1, mid: 2, afternoon: 3 };

    const mappedTodayShifts = (assignmentRows ?? [])
      .map((assignment: any) => ({
        assignmentId: assignment.id,
        session: assignment.shift_slots?.session_key,
        label: assignment.shift_slots?.exam_days?.label,
        date: assignment.shift_slots?.exam_days?.exam_date,
        seasonId: assignment.shift_slots?.exam_days?.season_id,
        clockInAt: assignment.clock_in_at,
        clockOutAt: assignment.clock_out_at,
      }))
      .filter(
        shift =>
          shift.date === today &&
          activeSeasonIds.has(shift.seasonId) &&
          (shift.session === 'morning' ||
            shift.session === 'mid' ||
            shift.session === 'afternoon')
      )
      .sort(
        (a, b) =>
          sessionOrder[a.session as keyof typeof sessionOrder] -
          sessionOrder[b.session as keyof typeof sessionOrder]
      ) as TodayShift[];

    setTodayShifts(mappedTodayShifts);

    const { data: notificationRows } = await supabase
      .from('invigilator_shift_notifications')
      .select('id, notification_type, title, message, created_at')
      .eq('invigilator_id', data?.id)
      .is('read_at', null)
      .order('created_at', { ascending: false });

    setShiftNotifications(
      (notificationRows ?? []) as ShiftNotification[]
    );
  }

  async function clockShift(
    assignmentId: string,
    action: 'in' | 'out' | 'undo_in' | 'undo_out'
  ) {
    const statusByAction = {
      in: ['Clocking in...', 'Clocked in.'],
      out: ['Clocking out...', 'Clocked out.'],
      undo_in: ['Undoing clock in...', 'Clock in removed.'],
      undo_out: ['Undoing clock out...', 'Clock out removed.'],
    };

    setClockingId(assignmentId);
    setClockStatus(statusByAction[action][0]);

    const { error } = await supabase.rpc('clock_shift', {
      p_assignment_id: assignmentId,
      p_action: action,
    });

    if (error) {
      setClockStatus(error.message);
    } else {
      setClockStatus(statusByAction[action][1]);
      await loadInvigilator();
    }

    setClockingId(null);
  }

  async function markShiftNotificationRead(notificationId: string) {
    const { error } = await supabase
      .from('invigilator_shift_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (!error) {
      setShiftNotifications(current =>
        current.filter(notification => notification.id !== notificationId)
      );
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

      {todayShifts.length > 0 && (
        <section
          aria-label="My shifts today"
          style={{
            background: 'white',
            border: '2px solid #c4b5fd',
            borderRadius: 16,
            padding: 20,
            marginBottom: 24,
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
          }}
        >
          <h2 style={{ margin: '0 0 5px', color: '#4c1d95' }}>
            My shifts today
          </h2>
          <p style={{ margin: '0 0 14px', color: '#6b7280' }}>
            Record your arrival and departure time for today’s assigned shifts.
          </p>

          {clockStatus && (
            <div
              style={{
                marginBottom: 12,
                padding: 9,
                background: '#f5f3ff',
                borderRadius: 8,
                color: '#4c1d95',
                fontWeight: 700,
              }}
            >
              {clockStatus}
            </div>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            {todayShifts.map(shift => (
              <div
                key={shift.assignmentId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                  padding: 14,
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  background: '#fafafa',
                }}
              >
                <div>
                  <strong style={{ color: '#1f2937' }}>{shift.label}</strong>
                  <div style={{ marginTop: 4, color: '#6b7280' }}>
                    {formatSession(shift.session)}
                  </div>
                  <div
                    style={{
                      marginTop: 5,
                      fontSize: 12,
                      color: '#4b5563',
                    }}
                  >
                    In: {formatClockTime(shift.clockInAt)} · Out:{' '}
                    {formatClockTime(shift.clockOutAt)}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    onClick={() => clockShift(shift.assignmentId, 'in')}
                    disabled={Boolean(shift.clockInAt) || clockingId !== null}
                    style={{
                      background: shift.clockInAt ? '#e5e7eb' : '#16a34a',
                      color: shift.clockInAt ? '#6b7280' : 'white',
                      border: 'none',
                      padding: '9px 12px',
                      borderRadius: 8,
                      cursor: shift.clockInAt ? 'default' : 'pointer',
                      fontWeight: 800,
                    }}
                  >
                    {shift.clockInAt ? 'Clocked in' : 'Clock in'}
                  </button>
                  {shift.clockInAt && !shift.clockOutAt && (
                    <button
                      onClick={() =>
                        clockShift(shift.assignmentId, 'undo_in')
                      }
                      disabled={clockingId !== null}
                      style={{
                        background: 'white',
                        color: '#991b1b',
                        border: '1px solid #fecaca',
                        padding: '9px 12px',
                        borderRadius: 8,
                        cursor: clockingId === null ? 'pointer' : 'default',
                        fontWeight: 800,
                      }}
                    >
                      Undo clock in
                    </button>
                  )}
                  <button
                    onClick={() => clockShift(shift.assignmentId, 'out')}
                    disabled={
                      !shift.clockInAt ||
                      Boolean(shift.clockOutAt) ||
                      clockingId !== null
                    }
                    style={{
                      background:
                        shift.clockInAt && !shift.clockOutAt
                          ? '#4c1d95'
                          : '#e5e7eb',
                      color:
                        shift.clockInAt && !shift.clockOutAt
                          ? 'white'
                          : '#6b7280',
                      border: 'none',
                      padding: '9px 12px',
                      borderRadius: 8,
                      cursor:
                        shift.clockInAt && !shift.clockOutAt
                          ? 'pointer'
                          : 'default',
                      fontWeight: 800,
                    }}
                  >
                    {shift.clockOutAt ? 'Clocked out' : 'Clock out'}
                  </button>
                  {shift.clockOutAt && (
                    <button
                      onClick={() =>
                        clockShift(shift.assignmentId, 'undo_out')
                      }
                      disabled={clockingId !== null}
                      style={{
                        background: 'white',
                        color: '#991b1b',
                        border: '1px solid #fecaca',
                        padding: '9px 12px',
                        borderRadius: 8,
                        cursor: clockingId === null ? 'pointer' : 'default',
                        fontWeight: 800,
                      }}
                    >
                      Undo clock out
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section
          aria-label="New shift notifications"
          style={{
            background: shiftNotifications.length > 0 ? '#fffbeb' : 'white',
            border:
              shiftNotifications.length > 0
                ? '2px solid #fbbf24'
                : '1px solid #e5e7eb',
            borderRadius: 16,
            padding: 20,
            marginBottom: 24,
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <h2
              style={{
                margin: 0,
                color: shiftNotifications.length > 0 ? '#92400e' : '#4c1d95',
              }}
            >
              Shift notifications
            </h2>
            <span
              style={{
                background:
                  shiftNotifications.length > 0 ? '#f59e0b' : '#dcfce7',
                color: shiftNotifications.length > 0 ? 'white' : '#166534',
                borderRadius: 999,
                padding: '5px 9px',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {shiftNotifications.length > 0
                ? `${shiftNotifications.length} unread`
                : 'Up to date'}
            </span>
          </div>

          {shiftNotifications.length === 0 ? (
            <div
              style={{
                background: '#f9fafb',
                borderRadius: 12,
                padding: 14,
                color: '#6b7280',
              }}
            >
              You have no new shift updates. New available shifts and newly
              assigned shifts will appear here.
            </div>
          ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {shiftNotifications.map(notification => (
              <div
                key={notification.id}
                style={{
                  background: 'white',
                  border: '1px solid #fde68a',
                  borderRadius: 12,
                  padding: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 280px' }}>
                  <strong style={{ color: '#4c1d95', fontSize: 16 }}>
                    {notification.title}
                  </strong>
                  <p style={{ margin: '5px 0', color: '#374151' }}>
                    {notification.message}
                  </p>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>
                    {new Date(notification.created_at).toLocaleString('en-GB')}
                  </div>
                  <Link
                    href={
                      notification.notification_type === 'shifts_available'
                        ? '/invigilator/available-shifts'
                        : '/invigilator/my-shifts'
                    }
                    style={{
                      display: 'inline-block',
                      marginTop: 8,
                      color: '#4c1d95',
                      fontWeight: 700,
                    }}
                  >
                    View shifts
                  </Link>
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontWeight: 700,
                    color: '#374151',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    onChange={() =>
                      markShiftNotificationRead(notification.id)
                    }
                  />
                  I’ve read this
                </label>
              </div>
            ))}
          </div>
          )}
        </section>

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
