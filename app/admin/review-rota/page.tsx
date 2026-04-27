'use client';

import { useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { SeasonContext } from '../layout';

type SessionKey = 'morning' | 'mid' | 'afternoon';

type DaySession = {
  enabled: boolean;
  needed: number;
};

type ExamDay = {
  id: string;
  label: string;
  sessions: Record<SessionKey, DaySession>;
};

type AssignmentState = {
  [dayId: string]: {
    [session in SessionKey]?: string[];
  };
};

// Temporary invigilator names
const INVIGILATOR_NAMES: Record<string, string> = {
  a: 'Alex',
  b: 'Jamie',
  c: 'Priya',
  d: 'Tom',
  e: 'Lee',
};

export default function ReviewRotaPage() {
  const router = useRouter();
  const { currentSeason } = useContext(SeasonContext);

  const [examDays, setExamDays] = useState<ExamDay[]>([]);
  const [assignments, setAssignments] = useState<AssignmentState>({});
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [publishedData, setPublishedData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !currentSeason) return;

      const shiftRes = await supabase
        .from('shift_setup_drafts')
        .select('data')
        .eq('user_id', auth.user.id)
        .eq('season_id', currentSeason.id)
        .single();

      const assignRes = await supabase
        .from('assign_invigilators_drafts')
        .select('data')
        .eq('user_id', auth.user.id)
        .eq('season_id', currentSeason.id)
        .single();

      const publishedRes = await supabase
        .from('published_rotas')
        .select('data, published_at')
        .eq('season_id', currentSeason.id)
        .order('published_at', { ascending: false })
        .limit(1)
        .single();

      if (shiftRes.data?.data?.days) {
        setExamDays(shiftRes.data.data.days);
      }

      if (assignRes.data?.data?.assignments) {
        setAssignments(assignRes.data.data.assignments);
      }

      if (publishedRes.data) {
        setLastPublishedAt(publishedRes.data.published_at);
        setPublishedData(publishedRes.data.data);
      }

      setLoading(false);
    };

    loadData();
  }, [currentSeason]);

  const hasUnpublishedChanges = lastPublishedAt
    ? JSON.stringify(publishedData) !==
      JSON.stringify({
        days: examDays,
        assignments,
      })
    : true;

  const publishRota = async () => {
    if (!currentSeason) return;

    const confirmed = window.confirm(
      'Publish this Rota?\n\nThis will update the official published version.'
    );

    if (!confirmed) return;

    setPublishing(true);

    await supabase.from('published_rotas').insert({
      season_id: currentSeason.id,
      data: {
        days: examDays,
        assignments,
      },
    });

    setPublishing(false);

    alert('Rota published successfully');
    router.push('/admin/assign-invigilators');
  };

  if (loading) {
    return <p>Loading Rota review…</p>;
  }

  return (
    <div>
      <h1>Review Rota</h1>

      {lastPublishedAt ? (
        <p style={{ color: '#555' }}>
          <strong>Last published:</strong>{' '}
          {new Date(lastPublishedAt).toLocaleString()}
        </p>
      ) : (
        <p style={{ color: '#b45309' }}>
          <em>This Rota has not been published yet.</em>
        </p>
      )}

      {hasUnpublishedChanges && (
        <p
          style={{
            background: '#fff7ed',
            border: '1px solid #f97316',
            padding: 12,
            borderRadius: 4,
            color: '#9a3412',
          }}
        >
          ⚠️ <strong>You have unpublished changes.</strong>{' '}
          The published Rota does not yet reflect the current assignments.
        </p>
      )}

      <p>
        Review staffing for each exam session before publishing.
        This page is read‑only.
      </p>

      {examDays.map(day => (
        <div
          key={day.id}
          style={{
            border: '1px solid #ccc',
            padding: 16,
            borderRadius: 6,
            marginBottom: 24,
          }}
        >
          <h2>{day.label}</h2>

          {(Object.keys(day.sessions) as SessionKey[])
            .filter(s => day.sessions[s].enabled)
            .map(session => {
              const needed = day.sessions[session].needed;
              const assigned =
                assignments[day.id]?.[session] ?? [];

              const fullyStaffed =
                assigned.length >= needed;

              return (
                <div
                  key={session}
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    background: '#f7f7f7',
                    borderRadius: 4,
                  }}
                >
                  <strong>{sessionLabel(session)}</strong>

                  <div>
                    {fullyStaffed ? (
                      <span style={{ color: 'green' }}>
                        ✅ Fully staffed ({assigned.length}/{needed})
                      </span>
                    ) : (
                      <span style={{ color: '#b45309' }}>
                        ⚠️ Understaffed ({assigned.length}/{needed})
                      </span>
                    )}
                  </div>

                  <ul style={{ marginTop: 6 }}>
                    {assigned.length === 0 && (
                      <li><em>No invigilators assigned</em></li>
                    )}
                    {assigned.map(id => (
                      <li key={id}>
                        {INVIGILATOR_NAMES[id] ?? id}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
        </div>
      ))}

      <div style={{ marginTop: 32 }}>
        <button onClick={() => router.push('/admin/assign-invigilators')}>
          Back to Assign Invigilators
        </button>{' '}
        <button
          onClick={() => router.push('/admin/view-published-rota')}
          style={{ marginRight: 8 }}
        >
          View Published Rota
        </button>{' '}
        <button onClick={publishRota} disabled={publishing}>
          {publishing ? 'Publishing…' : 'Publish Rota'}
        </button>
      </div>
    </div>
  );
}

function sessionLabel(key: SessionKey) {
  if (key === 'mid') return 'Mid‑morning';
  return key.charAt(0).toUpperCase() + key.slice(1);
}