'use client';

import { SeasonContext, type Season } from './SeasonContext';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAccessAndLoad();
  }, []);

  async function checkAccessAndLoad() {
    setLoading(true);

    const { data: authData } = await supabase.auth.getSession();

    const user = authData.session?.user;

    if (!user) {
      window.location.href = '/login';
      return;
    }

    const { data: invigilator } = await supabase
      .from('invigilators')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (invigilator) {
      window.location.href = '/invigilator';
      return;
    }

    await loadSeasons();
  }

  async function loadSeasons() {
    const { data } = await supabase
      .from('seasons')
      .select('id, name, status')
      .order('name', { ascending: true });

    const loadedSeasons = (data ?? []) as Season[];

    setSeasons(loadedSeasons);

    const savedSeasonId =
      typeof window !== 'undefined'
        ? localStorage.getItem('selectedSeasonId')
        : null;

    const savedSeason =
      loadedSeasons.find(season => season.id === savedSeasonId) ?? null;

    const firstActive =
      loadedSeasons.find(season => season.status === 'active') ?? null;

    const seasonToUse = savedSeason ?? firstActive ?? loadedSeasons[0] ?? null;

    setCurrentSeason(seasonToUse);

    if (seasonToUse && typeof window !== 'undefined') {
      localStorage.setItem('selectedSeasonId', seasonToUse.id);
    }

    setLoading(false);
  }

  function changeSeason(seasonId: string) {
    const selected = seasons.find(season => season.id === seasonId) ?? null;
    setCurrentSeason(selected);

    if (selected && typeof window !== 'undefined') {
      localStorage.setItem('selectedSeasonId', selected.id);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  async function archiveCurrentSeason() {
    if (!currentSeason) return;

    const confirmed = window.confirm(
      `Archive season "${currentSeason.name}"?\n\nThis will keep the data but move it out of the active season list.`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from('seasons')
      .update({ status: 'archived' })
      .eq('id', currentSeason.id);

    if (error) {
      alert(error.message);
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('selectedSeasonId');
    }

    await loadSeasons();
  }

  async function unarchiveCurrentSeason() {
    if (!currentSeason || currentSeason.status !== 'archived') return;

    const confirmed = window.confirm(
      `Unarchive season "${currentSeason.name}"?\n\nThis will restore it to the active season list with all of its existing data.`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from('seasons')
      .update({ status: 'active' })
      .eq('id', currentSeason.id);

    if (error) {
      alert(error.message);
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedSeasonId', currentSeason.id);
    }

    await loadSeasons();
  }

  const navItems = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/shift-setup', label: 'Shift Setup' },
    { href: '/admin/assign-invigilators', label: 'Assign' },
    { href: '/admin/my-team-today', label: 'My Team Today' },
    { href: '/admin/exam-timetable', label: 'Exam Timetable' },
    { href: '/admin/invigilator-information', label: 'Information' },
    { href: '/admin/invigilators', label: 'Invigilators' },
    { href: '/admin/reports', label: 'Reports' },
  ];

  const visibleSeasons = seasons.filter(season =>
    showArchived ? true : season.status === 'active'
  );

  if (loading) {
    return <div style={{ padding: 24 }}>Loading admin...</div>;
  }

  return (
    <SeasonContext.Provider value={{ currentSeason }}>
      <div style={{ minHeight: '100vh', background: '#f5f3ff' }}>
        <header
          style={{
            background: 'linear-gradient(135deg, #4c1d95, #6d28d9)',
            color: 'white',
            padding: '14px 24px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
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
              <div style={{ fontWeight: 700, fontSize: 20 }}>
                Magnus Academy Admin
              </div>

              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <label>Season:</label>

                <select
                  value={currentSeason?.id ?? ''}
                  onChange={e => changeSeason(e.target.value)}
                  style={{
                    padding: '5px 8px',
                    borderRadius: 6,
                    border: 'none',
                  }}
                >
                  {visibleSeasons.map(season => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                      {season.status === 'archived' ? ' (archived)' : ''}
                    </option>
                  ))}
                </select>

                <Link
                  href="/admin/seasons/new"
                  style={{
                    color: 'white',
                    fontWeight: 700,
                    textDecoration: 'underline',
                  }}
                >
                  + New season
                </Link>

                {currentSeason?.status === 'active' && (
                  <button
                    onClick={archiveCurrentSeason}
                    style={{
                      background: 'rgba(255,255,255,0.15)',
                      color: 'white',
                      border: '1px solid rgba(255,255,255,0.35)',
                      padding: '5px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    Archive season
                  </button>
                )}

                {currentSeason?.status === 'archived' && (
                  <button
                    onClick={unarchiveCurrentSeason}
                    style={{
                      background: 'white',
                      color: '#4c1d95',
                      border: 'none',
                      padding: '5px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    Unarchive season
                  </button>
                )}

                {seasons.some(season => season.status === 'archived') && (
                  <button
                    onClick={() => setShowArchived(prev => !prev)}
                    style={{
                      background: 'rgba(255,255,255,0.15)',
                      color: 'white',
                      border: '1px solid rgba(255,255,255,0.35)',
                      padding: '5px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    {showArchived ? 'Hide archived' : 'Show archived'}
                  </button>
                )}
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
              {navItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    color: 'white',
                    textDecoration: 'none',
                    fontWeight: pathname === item.href ? 700 : 600,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background:
                      pathname === item.href
                        ? 'rgba(255,255,255,0.2)'
                        : 'transparent',
                  }}
                >
                  {item.label}
                </Link>
              ))}

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
    </SeasonContext.Provider>
  );
}
