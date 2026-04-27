'use client';

import { useContext, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { SeasonContext } from '../SeasonContext';

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

// Temporary invigilator name lookup
const INVIGILATOR_NAMES: Record<string, string> = {
  a: 'Alex',
  b: 'Jamie',
  c: 'Priya',
  d: 'Tom',
  e: 'Lee',
};

export default function ViewPublishedRotaPage() {
  const { currentSeason } = useContext(SeasonContext);

  const [examDays, setExamDays] = useState<ExamDay[]>([]);
  const [assignments, setAssignments] = useState<AssignmentState>({});
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPublished = async () => {
      if (!currentSeason) return;

      const { data, error } = await supabase
        .from('published_rotas')
        .select('data, published_at')
        .eq('season_id', currentSeason.id)
        .order('published_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      setExamDays(data.data.days ?? []);
      setAssignments(data.data.assignments ?? {});
      setPublishedAt(data.published_at);

      setLoading(false);
    };

    loadPublished();
  }, [currentSeason]);

  if (loading) {
    return <p>Loading published rota…</p>;
  }

  if (!publishedAt) {
    return (
      <div>
        <h1>Published rota</h1>
        <p>
          <em>This season has not been published yet.</em>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Published rota</h1>

      <p style={{ color: '#555' }}>
        <strong>Published:</strong>{' '}
        {new Date(publishedAt).toLocaleString()}
      </p>

      <p>
        This is the official published rota for this season.
        It will not change unless the rota is published again.
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
                    {assigned.length}/{needed} invigilators
                  </div>

                  <ul style={{ marginTop: 6 }}>
                    {assigned.length === 0 && (
                      <li>
                        <em>No invigilators assigned</em>
                      </li>
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
    </div>
  );
}

function sessionLabel(key: SessionKey) {
  if (key === 'mid') return 'Mid‑morning';
  return key.charAt(0).toUpperCase() + key.slice(1);
}