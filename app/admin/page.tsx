'use client';

import Link from 'next/link';
import { useContext, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatLongDate } from '../../lib/dateHelpers';
import { SeasonContext } from './SeasonContext';

type ShiftReleaseNotification = {
  id: string;
  invigilator_name: string;
  exam_date: string;
  session_key: string;
  created_at: string;
  read_at: string | null;
};

function sessionLabel(session: string) {
  if (session === 'mid') return 'Mid';
  return session.charAt(0).toUpperCase() + session.slice(1);
}

export default function AdminHomePage() {
  const { currentSeason } = useContext(SeasonContext);
  const [releaseNotifications, setReleaseNotifications] = useState<
    ShiftReleaseNotification[]
  >([]);

  useEffect(() => {
    loadReleaseNotifications();
  }, [currentSeason?.id]);

  async function loadReleaseNotifications() {
    if (!currentSeason?.id) return;

    const { data } = await supabase
      .from('shift_release_notifications')
      .select(
        'id, invigilator_name, exam_date, session_key, created_at, read_at'
      )
      .eq('season_id', currentSeason.id)
      .order('created_at', { ascending: false })
      .limit(20);

    setReleaseNotifications((data ?? []) as ShiftReleaseNotification[]);
  }

  async function markNotificationRead(id: string) {
    const { error } = await supabase
      .from('shift_release_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) {
      setReleaseNotifications(current =>
        current.map(notification =>
          notification.id === id
            ? { ...notification, read_at: new Date().toISOString() }
            : notification
        )
      );
    }
  }

  const unreadCount = releaseNotifications.filter(
    notification => !notification.read_at
  ).length;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div
        style={{
          background: 'linear-gradient(135deg, #4c1d95, #6d28d9)',
          color: 'white',
          borderRadius: 16,
          padding: 28,
          marginBottom: 24,
          boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 34 }}>Admin Dashboard</h1>
        <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.95 }}>
          Manage exam seasons, shifts, invigilators, assignments and reports.
        </p>
      </div>

      <section
        style={{
          background: 'white',
          border:
            unreadCount > 0 ? '2px solid #f59e0b' : '1px solid #e5e7eb',
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
            gap: 12,
            marginBottom: 14,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ margin: 0, color: '#4c1d95' }}>
              Released shift notifications
            </h2>
            <p style={{ margin: '5px 0 0', color: '#6b7280' }}>
              Invigilators who have dropped an assigned shift.
            </p>
          </div>
          <span
            style={{
              background: unreadCount > 0 ? '#fef3c7' : '#dcfce7',
              color: unreadCount > 0 ? '#92400e' : '#166534',
              borderRadius: 999,
              padding: '6px 10px',
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            {unreadCount} unread
          </span>
        </div>

        {releaseNotifications.length === 0 ? (
          <div
            style={{
              background: '#f9fafb',
              color: '#6b7280',
              padding: 14,
              borderRadius: 10,
            }}
          >
            No released shifts for this season.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 9 }}>
            {releaseNotifications.map(notification => (
              <div
                key={notification.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  padding: 12,
                  borderRadius: 11,
                  border: notification.read_at
                    ? '1px solid #e5e7eb'
                    : '1px solid #fcd34d',
                  background: notification.read_at ? '#fafafa' : '#fffbeb',
                }}
              >
                <div>
                  <strong>{notification.invigilator_name}</strong> released the{' '}
                  <strong>{sessionLabel(notification.session_key)}</strong>{' '}
                  shift on{' '}
                  <strong>{formatLongDate(notification.exam_date)}</strong>.
                  <div
                    style={{
                      color: '#6b7280',
                      fontSize: 12,
                      marginTop: 4,
                    }}
                  >
                    Released{' '}
                    {new Date(notification.created_at).toLocaleString('en-GB')}
                  </div>
                </div>

                {!notification.read_at && (
                  <button
                    onClick={() => markNotificationRead(notification.id)}
                    style={{
                      background: '#4c1d95',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      padding: '7px 10px',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    Mark as read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: 18,
        }}
      >
        <DashboardCard
          href="/admin/shift-setup"
          icon="📅"
          title="Shift Setup"
          text="Create exam days and set how many invigilators are needed."
        />

        <DashboardCard
          href="/admin/assign-invigilators"
          icon="✅"
          title="Assign Invigilators"
          text="Assign applicants or manually add invigilators to shifts."
        />

        <DashboardCard
          href="/admin/my-team-today"
          icon="👥"
          title="My Team Today"
          text="See today’s staffing and any gaps"
        />

        <DashboardCard
          href="/admin/exam-timetable"
          icon="📝"
          title="Exam Timetable"
          text="View exams, candidate numbers and upload timetable CSV files."
        />

        <DashboardCard
          href="/admin/invigilator-information"
          icon="ℹ️"
          title="Invigilator Information"
          text="Edit the information boxes shown on the invigilator dashboard."
        />

        <DashboardCard
          href="/admin/invigilators"
          icon="👥"
          title="Manage Invigilators"
          text="Add, edit, activate or deactivate invigilators."
        />

        <DashboardCard
          href="/admin/reports"
          icon="📊"
          title="Reports"
          text="View rota grids, totals and invigilator ratio reports."
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
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        style={{
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 16,
          padding: 22,
          minHeight: 170,
          boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ fontSize: 30, marginBottom: 10 }}>{icon}</div>

        <h2 style={{ margin: '0 0 8px 0', color: '#4c1d95' }}>
          {title}
        </h2>

        <p style={{ margin: 0, color: '#555', lineHeight: 1.5 }}>
          {text}
        </p>
      </div>
    </Link>
  );
}
