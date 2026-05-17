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
  date: string;
  label: string;
  sessions: Record<SessionKey, DaySession>;
};

function parseDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function formatDateLabel(dateStr: string) {
  return parseDate(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return 'Not published yet';

  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isWeekend(d: Date) {
  return d.getDay() === 0 || d.getDay() === 6;
}

function getDatesInRange(from: string, to: string, skipWeekends: boolean) {
  const result: string[] = [];
  const current = parseDate(from);
  const end = parseDate(to);

  while (current <= end) {
    if (!skipWeekends || !isWeekend(current)) result.push(toYMD(current));
    current.setDate(current.getDate() + 1);
  }

  return result;
}

function getWeekFromDate(dateStr: string) {
  const base = parseDate(dateStr);
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + diff);

  const dates: string[] = [];

  for (let i = 0; i < 5; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dates.push(toYMD(d));
  }

  return dates;
}

function createLocalDay(d: string): Omit<ExamDay, 'id'> {
  return {
    date: d,
    label: formatDateLabel(d),
    sessions: {
      morning: { enabled: false, needed: 0 },
      mid: { enabled: false, needed: 0 },
      afternoon: { enabled: false, needed: 0 },
    },
  };
}

function sessionLabel(session: SessionKey) {
  if (session === 'mid') return 'Mid';
  return session.charAt(0).toUpperCase() + session.slice(1);
}

export default function ShiftSetupPage() {
  const { currentSeason } = useContext(SeasonContext);

  const [days, setDays] = useState<ExamDay[]>([]);
  const [singleDate, setSingleDate] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [uploadingRooms, setUploadingRooms] = useState(false);

  useEffect(() => {
    if (currentSeason?.id) {
      loadDays();
      loadSeasonPublishInfo();
    }
  }, [currentSeason?.id]);

  async function loadSeasonPublishInfo() {
    if (!currentSeason?.id) return;

    const { data } = await supabase
      .from('seasons')
      .select('last_published_at')
      .eq('id', currentSeason.id)
      .single();

    setLastPublishedAt(data?.last_published_at ?? null);
  }

  async function loadDays() {
    if (!currentSeason?.id) return;

    setLoading(true);
    setStatus('');

    const { data: dayRows, error: dayError } = await supabase
      .from('exam_days')
      .select('id, exam_date, label')
      .eq('season_id', currentSeason.id)
      .order('exam_date', { ascending: true });

    if (dayError) {
      setStatus(dayError.message);
      setLoading(false);
      return;
    }

    const dayIds = (dayRows ?? []).map(day => day.id);

    let sessionRows:
      | {
          exam_day_id: string;
          session_key: string;
          enabled: boolean;
          needed: number;
        }[]
      = [];

    if (dayIds.length > 0) {
      const { data, error } = await supabase
        .from('exam_sessions')
        .select('exam_day_id, session_key, enabled, needed')
        .in('exam_day_id', dayIds);

      if (error) {
        setStatus(error.message);
        setLoading(false);
        return;
      }

      sessionRows = data ?? [];
    }

    const mappedDays: ExamDay[] = (dayRows ?? []).map(day => {
      const sessions: Record<SessionKey, DaySession> = {
        morning: { enabled: false, needed: 0 },
        mid: { enabled: false, needed: 0 },
        afternoon: { enabled: false, needed: 0 },
      };

      sessionRows
        .filter(session => session.exam_day_id === day.id)
        .forEach(session => {
          if (
            session.session_key === 'morning' ||
            session.session_key === 'mid' ||
            session.session_key === 'afternoon'
          ) {
            sessions[session.session_key] = {
              enabled: session.enabled,
              needed: session.enabled ? session.needed ?? 0 : 0,
            };
          }
        });

      return {
        id: day.id,
        date: day.exam_date,
        label: day.label,
        sessions,
      };
    });

    setDays(mappedDays);
    setLoading(false);
  }

  async function syncShiftSlot(
    examDayId: string,
    sessionKey: SessionKey,
    sessionData: DaySession
  ) {
    const { data: existingSlot } = await supabase
      .from('shift_slots')
      .select('id')
      .eq('exam_day_id', examDayId)
      .eq('session_key', sessionKey)
      .maybeSingle();

    if (!sessionData.enabled) {
      if (existingSlot?.id) {
        await supabase.from('shift_slots').delete().eq('id', existingSlot.id);
      }
      return;
    }

    if (sessionData.needed < 1) return;

    if (existingSlot?.id) {
      await supabase
        .from('shift_slots')
        .update({ needed: sessionData.needed })
        .eq('id', existingSlot.id);
    } else {
      await supabase.from('shift_slots').insert({
        exam_day_id: examDayId,
        session_key: sessionKey,
        needed: sessionData.needed,
        published: false,
      });
    }
  }

  async function saveDayToSupabase(day: Omit<ExamDay, 'id'>) {
    if (!currentSeason?.id) return null;

    const { data: dayRow, error: dayError } = await supabase
      .from('exam_days')
      .upsert(
        {
          season_id: currentSeason.id,
          exam_date: day.date,
          label: day.label,
        },
        { onConflict: 'season_id,exam_date' }
      )
      .select('id, exam_date, label')
      .single();

    if (dayError || !dayRow) {
      throw new Error(dayError?.message || 'Failed to save day');
    }

    const sessionRows = (Object.keys(day.sessions) as SessionKey[]).map(key => ({
      exam_day_id: dayRow.id,
      session_key: key,
      enabled: day.sessions[key].enabled,
      needed: day.sessions[key].needed || 1,
    }));

    const { error: sessionError } = await supabase
      .from('exam_sessions')
      .upsert(sessionRows, { onConflict: 'exam_day_id,session_key' });

    if (sessionError) throw new Error(sessionError.message);

    for (const key of Object.keys(day.sessions) as SessionKey[]) {
      await syncShiftSlot(dayRow.id, key, day.sessions[key]);
    }

    return {
      id: dayRow.id,
      date: dayRow.exam_date,
      label: dayRow.label,
      sessions: day.sessions,
    } as ExamDay;
  }

  async function updateSession(
    dayId: string,
    session: SessionKey,
    updates: Partial<DaySession>
  ) {
    const day = days.find(d => d.id === dayId);
    if (!day) return;

    const updatedSession = {
      ...day.sessions[session],
      ...updates,
    };

    const updatedDay: ExamDay = {
      ...day,
      sessions: {
        ...day.sessions,
        [session]: updatedSession,
      },
    };

    setDays(prev => prev.map(d => (d.id === dayId ? updatedDay : d)));

    try {
      setStatus('Saving...');

      const { error } = await supabase.from('exam_sessions').upsert(
        {
          exam_day_id: dayId,
          session_key: session,
          enabled: updatedSession.enabled,
          needed: updatedSession.needed || 1,
        },
        { onConflict: 'exam_day_id,session_key' }
      );

      if (error) {
        setStatus(error.message);
        await loadDays();
        return;
      }

      await syncShiftSlot(dayId, session, updatedSession);
      setStatus('Saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed');
      await loadDays();
    }
  }

  async function handleNeededChange(
    dayId: string,
    session: SessionKey,
    value: string
  ) {
    const raw = value.replace(/\D/g, '');

    await updateSession(dayId, session, {
      needed: raw === '' ? 0 : Number(raw),
    });
  }

  function validateBeforePublish() {
    for (const day of days) {
      for (const session of Object.values(day.sessions)) {
        if (session.enabled && session.needed < 1) {
          alert('Please fill in all enabled sessions before publishing.');
          return false;
        }
      }
    }

    return true;
  }

  async function publishAllShifts() {
    if (!currentSeason?.id) return;
    if (!validateBeforePublish()) return;

    try {
      setStatus('Publishing all shifts...');

      const { data: seasonDays } = await supabase
        .from('exam_days')
        .select('id')
        .eq('season_id', currentSeason.id);

      const seasonDayIds = (seasonDays ?? []).map(day => day.id);

      if (seasonDayIds.length === 0) {
        setStatus('No days to publish yet.');
        return;
      }

      const { error: publishError } = await supabase
        .from('shift_slots')
        .update({ published: true })
        .in('exam_day_id', seasonDayIds);

      if (publishError) {
        setStatus(publishError.message);
        return;
      }

      const publishTime = new Date().toISOString();

      await supabase
        .from('seasons')
        .update({ last_published_at: publishTime })
        .eq('id', currentSeason.id);

      setLastPublishedAt(publishTime);
      setStatus('All shifts published.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Publish failed');
    }
  }

  async function addOneDay(dateStr: string) {
    if (!dateStr) return;
    if (days.some(d => d.date === dateStr)) return;

    try {
      setStatus('Saving...');
      const savedDay = await saveDayToSupabase(createLocalDay(dateStr));
      if (!savedDay) return;

      setDays(prev =>
        [...prev, savedDay].sort((a, b) => a.date.localeCompare(b.date))
      );
      setStatus('Saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed');
    }
  }

  async function addDay() {
    await addOneDay(singleDate);
    setSingleDate('');
  }

  async function addWeek() {
    if (!singleDate) return;

    const weekDates = getWeekFromDate(singleDate).filter(
      d => !days.some(day => day.date === d)
    );

    try {
      setStatus('Saving...');
      for (const dateStr of weekDates) {
        await saveDayToSupabase(createLocalDay(dateStr));
      }
      await loadDays();
      setSingleDate('');
      setStatus('Saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed');
    }
  }

  async function addRange() {
    if (!fromDate || !toDate) return;

    const start = parseDate(fromDate);
    const end = parseDate(toDate);

    if (start > end) return;

    const rangeDates = getDatesInRange(fromDate, toDate, skipWeekends).filter(
      d => !days.some(day => day.date === d)
    );

    try {
      setStatus('Saving...');
      for (const dateStr of rangeDates) {
        await saveDayToSupabase(createLocalDay(dateStr));
      }
      await loadDays();
      setStatus('Saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed');
    }
  }

async function uploadRoomRequirements(
  event: React.ChangeEvent<HTMLInputElement>
) {
  if (!currentSeason?.id) return;

  const file = event.target.files?.[0];
  if (!file) return;

  try {
    setUploadingRooms(true);
    setStatus('Uploading room requirements...');

    const text = await file.text();

    const rows = text
  .replace(/^\uFEFF/, '')
  .split(/\r?\n/)
  .map(r => r.trim())
  .filter(Boolean);

    if (rows.length < 2) {
      setStatus('CSV is empty.');
      return;
    }

    const headers = rows[0].split(',').map(header => header.replace(/"/g, '').trim());

    const dataRows = rows.slice(1);

    const get = (row: string[], name: string) => {
      const index = headers.indexOf(name);
      return index >= 0 ? row[index]?.replace(/"/g, '') ?? '' : '';
    };

    await supabase
      .from('room_requirements')
      .delete()
      .eq('season_id', currentSeason.id);

    const inserts = [];

    for (const rowText of dataRows) {
      const row = rowText.split(',').map(cell => cell.replace(/"/g, '').trim());

      const rawDate = get(row, 'Date');
console.log('Room CSV row:', row);
console.log('Raw date:', rawDate);

      const cleanDate = rawDate.split(' ')[0];

      if (!rawDate) continue;

      const [day, month, year] = cleanDate.split('/');

      const examDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

      const start = get(row, 'Start');

      let sessionKey: SessionKey = 'morning';

      const hour = parseInt(start.split(':')[0] || '0');

      if (hour >= 13) {
        sessionKey = 'afternoon';
      } else if (hour >= 11) {
        sessionKey = 'mid';
      }

      const studentCount = Number(get(row, 'NoOfCands') || '0');

      const suggestedInvigilators =
        studentCount <= 1
          ? 1
          : Math.ceil(studentCount / 30) + 1;

      inserts.push({
        season_id: currentSeason.id,
        exam_date: examDate,
        session_key: sessionKey,
        start_time: start,
        room_name: get(row, 'Room'),
        exam_name: get(row, 'ComponentLocalName'),
        paper_code: get(row, 'ComponentCode'),
        student_count: studentCount,
        duration_minutes: Number(get(row, 'Length') || get(row, 'Length1') || '0'),
        suggested_invigilators: suggestedInvigilators,
      });
    }

    const { error } = await supabase
      .from('room_requirements')
      .insert(inserts);

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus(`Uploaded ${inserts.length} room requirements.`);
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : 'Upload failed'
    );
  } finally {
    setUploadingRooms(false);
  }
}

async function calculateRoomRequirements() {
  if (!currentSeason?.id) return;

  try {
    setStatus('Calculating session requirements...');

    const { data: rooms, error } = await supabase
      .from('room_requirements')
      .select('*')
      .eq('season_id', currentSeason.id);

    if (error) {
      setStatus(error.message);
      return;
    }

    if (!rooms || rooms.length === 0) {
      setStatus('No room requirements uploaded.');
      return;
    }

    const grouped = new Map<string, number>();

    for (const room of rooms) {
      const key = `${room.exam_date}_${room.session_key}`;

      const current = grouped.get(key) ?? 0;

      grouped.set(
        key,
        current + (room.suggested_invigilators ?? 0)
      );
    }

    for (const [key, total] of Array.from(grouped.entries())) {
      const [examDate, sessionKey] = key.split('_');

      const day = days.find(d => d.date === examDate);

      if (!day) continue;

      await updateSession(day.id, sessionKey as SessionKey, {
        enabled: true,
        needed: total,
      });
    }

    await loadDays();

    setStatus('Session requirements calculated.');
  } catch (error) {
    setStatus(
      error instanceof Error
        ? error.message
        : 'Calculation failed'
    );
  }
}

  async function removeDay(id: string) {
    try {
      setStatus('Removing...');
      const { error } = await supabase.from('exam_days').delete().eq('id', id);

      if (error) {
        setStatus(error.message);
        return;
      }

      setDays(prev => prev.filter(day => day.id !== id));
      setStatus('Removed.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Remove failed');
    }
  }

  if (!currentSeason) {
    return <div style={page}>No season selected.</div>;
  }

  return (
    <div style={page}>
      <div style={hero}>
  <h1 style={heroTitle}>Shift Setup</h1>
  <p style={heroText}>
    Create exam days, choose which sessions are running, and set how many
    invigilators are needed.
  </p>
</div>

<section
  style={{
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
  }}
>
  <h2
    style={{
      marginTop: 0,
      marginBottom: 8,
      color: '#4c1d95',
    }}
  >
    Upload Room Requirements CSV
  </h2>

  <p
    style={{
      marginTop: 0,
      color: '#6b7280',
      marginBottom: 14,
    }}
  >
    Upload your MIS room timetable file to automatically calculate
    suggested invigilator numbers for each session.
  </p>

  <input
    type="file"
    accept=".csv,text/csv"
    onChange={uploadRoomRequirements}
    disabled={uploadingRooms}
  />

<div style={{ marginTop: 14 }}>
  <button
    onClick={calculateRoomRequirements}
    style={primaryButton}
    disabled={uploadingRooms}
  >
    Calculate session requirements
  </button>
</div>

</section>

<div style={infoGrid}>
        <div style={infoCard}>
          <span style={smallLabel}>Current season</span>
          <strong style={infoValue}>{currentSeason.name}</strong>
        </div>

        <div style={infoCard}>
          <span style={smallLabel}>Last published</span>
          <strong style={infoValue}>{formatDateTime(lastPublishedAt)}</strong>
        </div>
      </div>

      <div style={toolbar}>
        <button onClick={publishAllShifts} style={primaryButton}>
          Publish all shifts
        </button>

        <span style={statusStyle(status)}>
          {loading ? 'Loading...' : status}
        </span>
      </div>

      <div style={setupGrid}>
        <section style={panel}>
          <h2 style={panelTitle}>Add a day or week</h2>

          <div style={row}>
            <input
              type="date"
              value={singleDate}
              onChange={e => setSingleDate(e.target.value)}
              style={input}
            />

            <button onClick={addDay} style={secondaryButton}>
              Add day
            </button>

            <button onClick={addWeek} style={secondaryButton}>
              Add week
            </button>
          </div>
        </section>

        <section style={panel}>
          <h2 style={panelTitle}>Add a date range</h2>

          <div style={row}>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              style={input}
            />

            <span>to</span>

            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              style={input}
            />

            <label style={checkboxLabel}>
              <input
                type="checkbox"
                checked={skipWeekends}
                onChange={e => setSkipWeekends(e.target.checked)}
              />
              Skip weekends
            </label>

            <button onClick={addRange} style={secondaryButton}>
              Add days
            </button>
          </div>
        </section>
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        {days.length === 0 && !loading ? (
          <div style={emptyCard}>No exam days added yet.</div>
        ) : (
          days.map(day => (
            <div key={day.id} style={dayCard}>
              <div style={dayHeader}>
                <div>
                  <h2 style={dayTitle}>{day.label}</h2>
                  <p style={dayDate}>{day.date}</p>
                </div>

                <button onClick={() => removeDay(day.id)} style={dangerButton}>
                  Remove
                </button>
              </div>

              <div style={sessionGrid}>
                {(['morning', 'mid', 'afternoon'] as SessionKey[]).map(s => {
                  const isIncomplete =
                    day.sessions[s].enabled && day.sessions[s].needed < 1;

                  return (
                    <div
                      key={s}
                      style={{
                        ...sessionCard,
                        opacity: day.sessions[s].enabled ? 1 : 0.55,
                        border: isIncomplete
                          ? '2px solid #fca5a5'
                          : '1px solid #e5e7eb',
                      }}
                    >
                      <label style={sessionTopLine}>
                        <input
                          type="checkbox"
                          checked={day.sessions[s].enabled}
                          onChange={e =>
                            updateSession(day.id, s, {
                              enabled: e.target.checked,
                              needed: e.target.checked
                                ? day.sessions[s].needed
                                : 0,
                            })
                          }
                        />
                        <span style={sessionName}>{sessionLabel(s)}</span>
                      </label>

                      <label style={neededLine}>
                        <span>Needed</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Enter number"
                          value={
                            day.sessions[s].needed === 0
                              ? ''
                              : String(day.sessions[s].needed)
                          }
                          onChange={e =>
                            handleNeededChange(day.id, s, e.target.value)
                          }
                          style={numberInput}
                          disabled={!day.sessions[s].enabled}
                        />
                      </label>

                      {isIncomplete && (
                        <div style={warningText}>Enter a number before publishing</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  padding: 24,
  maxWidth: 1150,
  margin: '0 auto',
};

const hero: React.CSSProperties = {
  background: 'linear-gradient(135deg, #4c1d95, #6d28d9)',
  color: 'white',
  borderRadius: 16,
  padding: 28,
  marginBottom: 24,
  boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
};

const heroTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 32,
};

const heroText: React.CSSProperties = {
  marginTop: 10,
  marginBottom: 0,
  opacity: 0.95,
};

const infoGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 14,
  marginBottom: 18,
};

const infoCard: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 16,
  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
};

const smallLabel: React.CSSProperties = {
  display: 'block',
  color: '#6b7280',
  fontSize: 13,
  marginBottom: 4,
};

const infoValue: React.CSSProperties = {
  color: '#4c1d95',
  fontSize: 16,
};

const toolbar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  marginBottom: 18,
};

const setupGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 16,
  marginBottom: 24,
};

const panel: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
};

const panelTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  color: '#4c1d95',
  fontSize: 20,
};

const row: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  flexWrap: 'wrap',
};

const input: React.CSSProperties = {
  padding: '9px 10px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
};

const checkboxLabel: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
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
  padding: '9px 12px',
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 700,
};

const dangerButton: React.CSSProperties = {
  background: '#fee2e2',
  color: '#991b1b',
  border: '1px solid #fecaca',
  padding: '8px 10px',
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 700,
};

const emptyCard: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 24,
  color: '#555',
  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
};

const dayCard: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
};

const dayHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
  marginBottom: 16,
};

const dayTitle: React.CSSProperties = {
  margin: 0,
  color: '#4c1d95',
  fontSize: 22,
};

const dayDate: React.CSSProperties = {
  margin: '4px 0 0 0',
  color: '#6b7280',
};

const sessionGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
};

const sessionCard: React.CSSProperties = {
  background: '#fafafa',
  borderRadius: 12,
  padding: 14,
};

const sessionTopLine: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  marginBottom: 12,
};

const sessionName: React.CSSProperties = {
  fontWeight: 800,
  color: '#4c1d95',
};

const neededLine: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
  color: '#374151',
};

const numberInput: React.CSSProperties = {
  width: 110,
  padding: '7px 8px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  textAlign: 'center',
  fontWeight: 700,
};

const warningText: React.CSSProperties = {
  marginTop: 8,
  color: '#991b1b',
  fontSize: 12,
  fontWeight: 700,
};

function statusStyle(status: string): React.CSSProperties {
  const isError =
    status.toLowerCase().includes('failed') ||
    status.toLowerCase().includes('error');

  return {
    color: isError ? '#991b1b' : '#4c1d95',
    fontWeight: 700,
    background: isError ? '#fee2e2' : '#f5f3ff',
    border: isError ? '1px solid #fecaca' : '1px solid #ddd6fe',
    borderRadius: 10,
    padding: '9px 12px',
    minHeight: 20,
  };
}