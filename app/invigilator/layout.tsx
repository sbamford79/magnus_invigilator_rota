'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function InvigilatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >('default');

  const shownNotificationIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }

    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    async function checkNotifications() {
      if (typeof window === 'undefined') return;
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;

      const { data: invigilator } = await supabase
        .from('invigilators')
        .select('id')
        .eq('auth_user_id', authData.user.id)
        .single();

      if (!invigilator) return;

      const { data: rows, error } = await supabase
        .from('notifications')
        .select('id, title, message, is_read, created_at')
        .eq('invigilator_id', invigilator.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false });

      if (error || !rows) return;

      for (const row of rows) {
        if (shownNotificationIds.current.has(row.id)) continue;

        shownNotificationIds.current.add(row.id);

        new Notification(row.title, {
          body: row.message,
        });

        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', row.id);
      }
    }

    checkNotifications();
    intervalId = setInterval(checkNotifications, 15000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  async function enableNotifications() {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <header
        style={{
          background: 'linear-gradient(135deg, #4c1d95, #6d28d9)',
          color: 'white',
          padding: '16px 24px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              Magnus Academy
            </div>
            <div style={{ fontSize: 14, opacity: 0.92 }}>
              Invigilator Dashboard
            </div>
          </div>

          <nav
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <NavLink href="/invigilator" currentPath={pathname}>
              Home
            </NavLink>

            <NavLink
              href="/invigilator/available-shifts"
              currentPath={pathname}
            >
              Available Shifts
            </NavLink>

            <NavLink href="/invigilator/my-shifts" currentPath={pathname}>
              My Shifts
            </NavLink>

            <NavLink href="/invigilator/calendar" currentPath={pathname}>
              My Calendar
            </NavLink>

            <NavLink href="/invigilator/my-team" currentPath={pathname}>
              My Team Today
            </NavLink>

            <NavLink href="/invigilator/exam-timetable" currentPath={pathname}>
              Exam Timetable
            </NavLink>

            {notificationPermission !== 'granted' &&
              notificationPermission !== 'unsupported' && (
                <button
                  onClick={enableNotifications}
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.35)',
                    padding: '8px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  Enable notifications
                </button>
              )}

            <button
              onClick={handleLogout}
              style={{
                background: 'white',
                color: '#4c1d95',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}

function NavLink({
  href,
  currentPath,
  children,
}: {
  href: string;
  currentPath: string;
  children: React.ReactNode;
}) {
  const isActive = currentPath === href;

  return (
    <Link
      href={href}
      style={{
        color: 'white',
        textDecoration: 'none',
        fontWeight: 600,
        padding: '8px 12px',
        borderRadius: 8,
        background: isActive ? 'rgba(255,255,255,0.18)' : 'transparent',
      }}
    >
      {children}
    </Link>
  );
}