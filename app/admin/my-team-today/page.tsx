'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { SeasonContext } from '../SeasonContext';
import {
  buildCalendarDays,
  formatLongDate,
  monthName,
  toYMD,
} from '../../../lib/dateHelpers';

type SessionKey = 'morning' | 'mid' | 'afternoon';

type ShiftSlot = {
  id: string;
  session_key: SessionKey;
  needed: number;
  published: boolean;
};

type Assignment = {
  id: string;
  shift_slot_id: string;
  attended: boolean;
  attended_at: string | null;
  invigilators:
    | {
        full_name: string;
      }
    | {
        full_name: string;
      }[]
    | null;
};

type CalendarGap = {
  exam_date: string;
  spaces_left: number;
};

function sessionLabel(session: SessionKey) {
  if (session === 'mid') return 'Mid';
  return session.charAt(0).toUpperCase() + session.slice(1);
}

const sessionOrder: Record<SessionKey, number> = {
  morning: 1,
  mid: 2,
  afternoon: 3,
};

export default function AdminMyTeamTodayPage() {
  const { currentSeason } = useContext(SeasonContext);

  const [selectedDate, setSelectedDate] = useState(toYMD(new Date()));
  const [viewDate, setViewDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [calendarGaps, setCalendarGaps] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingAttendanceId, setSavingAttendanceId] = useState<string | null>(
    null
  );

  useEffect(() => {
    loadDay();
  }, [selectedDate, currentSeason?.id]);

  useEffect(() => {
    loadMonthGaps();
  }, [viewDate, currentSeason?.id]);

  async function loadMonthGaps() {
    if (!currentSeason?.id) return;

    const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);

    const { data: dayRows, error: dayError } = await supabase
      .from('exam_days')
      .select('id, exam_date')
      .eq('season_id', currentSeason.id)
      .gte('exam_date', toYMD(monthStart))
      .lte('exam_date', toYMD(monthEnd));

    if (dayError || !dayRows || dayRows.length === 0) {
      setCalendarGaps({});
      return;
    }

    const dayIds = dayRows.map(day => day.id);

    const { data: slotRows, error: slotError } = await supabase
      .from('shift_slots')
      .select('id, exam_day_id, needed')
      .in('exam_day_id', dayIds);

    if (slotError || !slotRows || slotRows.length === 0) {
      setCalendarGaps({});
      return;
    }

    const slotIds = slotRows.map(slot => slot.id);

    const { data: assignmentRows } = await supabase
      .from('shift_assignments')
      .select('shift_slot_id')
      .in('shift_slot_id', slotIds)
      .eq('published', true);

    const assignedCountBySlot: Record<string, number> = {};

    (assignmentRows ?? []).forEach(row => {
      assignedCountBySlot[row.shift_slot_id] =
        (assignedCountBySlot[row.shift_slot_id] ?? 0) + 1;
    });

    const dateByDayId: Record<string, string> = {};

    dayRows.forEach(day => {
      dateByDayId[day.id] = day.exam_date;
    });

    const gapMap: Record<string, number> = {};

    slotRows.forEach(slot => {
      const assignedCount = assignedCountBySlot[slot.id] ?? 0;
      const remaining = Math.max(slot.needed - assignedCount, 0);
      const date = dateByDayId[slot.exam_day_id];

      if (remaining > 0 && date) {
        gapMap[date] = (gapMap[date] ?? 0) + remaining;
      }
    });

    setCalendarGaps(gapMap);
  }

  async function loadDay() {
    if (!currentSeason?.id) return;

    setLoading(true);
    setStatus('');

    const { data: examDay, error: dayError } = await supabase
      .from('exam_days')
      .select('id')
      .eq('season_id', currentSeason.id)
      .eq('exam_date', selectedDate)
      .maybeSingle();

    if (dayError) {
      setStatus(dayError.message);
      setLoading(false);
      return;
    }

    if (!examDay) {
      setSlots([]);
      setAssignments([]);
      setLoading(false);
      return;
    }

    const { data: slotRows, error: slotError } = await supabase
      .from('shift_slots')
      .select('id, session_key, needed, published')
      .eq('exam_day_id', examDay.id);

    if (slotError) {
      setStatus(slotError.message);
      setLoading(false);
      return;
    }

    const mappedSlots = ((slotRows ?? []) as ShiftSlot[]).sort(
      (a, b) => sessionOrder[a.session_key] - sessionOrder[b.session_key]
    );

    setSlots(mappedSlots);

    const slotIds = mappedSlots.map(slot => slot.id);

    if (slotIds.length === 0) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    const { data: assignmentRows, error: assignmentError } = await supabase
      .from('shift_assignments')
      .select(`
        id,
        shift_slot_id,
        attended,
        attended_at,
        invigilators (
          full_name
        )
      `)
      .in('shift_slot_id', slotIds)
      .eq('published', true);

    if (assignmentError) {
      setStatus(assignmentError.message);
      setLoading(false);
      return;
    }

    setAssignments((assignmentRows ?? []) as Assignment[]);
    setLoading(false);
  }

  async function toggleAttendance(assignmentId: string, attended: boolean) {
    setSavingAttendanceId(assignmentId);
    setStatus('');

    setAssignments(current =>
      current.map(assignment =>
        assignment.id === assignmentId
          ? {
              ...assignment,
              attended,
              attended_at: attended ? new Date().toISOString() : null,
            }
          : assignment
      )
    );

    const { error } = await supabase
      .from('shift_assignments')
      .update({
        attended,
        attended_at: attended ? new Date().toISOString() : null,
      })
      .eq('id', assignmentId);

    if (error) {
      setStatus(error.message);
      await loadDay();
    }

    setSavingAttendanceId(null);
  }

  const calendarCells = useMemo(() => buildCalendarDays(viewDate), [viewDate]);

  const assignedBySlot = useMemo(() => {
    const map: Record<
      string,
      { id: string; name: string; attended: boolean }[]
    > = {};

    for (const assignment of assignments) {
      if (!map[assignment.shift_slot_id]) {
        map[assignment.shift_slot_id] = [];
      }

     const invigilator = Array.isArray(assignment.invigilators)
  ? assignment.invigilators[0]
  : assignment.invigilators;

if (invigilator?.full_name) {
  map[assignment.shift_slot_id].push({
    id: assignment.id,
    name: invigilator.full_name,
    attended: assignment.attended === true,
  });
}
    }

    return map;
  }, [assignments]);

  const gaps = slots
    .map(slot => {
      const assignedCount = assignedBySlot[slot.id]?.length ?? 0;
      const remaining = Math.max(slot.needed - assignedCount, 0);

      return {
        ...slot,
        assignedCount,
        remaining,
      };
    })
    .filter(slot => slot.remaining > 0);

  function goPrevMonth() {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function goNextMonth() {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  if (!currentSeason) {
    return <div style={page}>No season selected.</div>;
  }

  return (
    <div style={page}>
      <div style={hero}>
        <h1 style={heroTitle}>My Team for Today</h1>
        <p style={heroText}>
          Choose a date to see any staffing gaps first, then the invigilators
          assigned to each session.
        </p>
      </div>

      <div style={mainGrid}>
        <div style={calendarCard}>
          <div style={calendarHeader}>
            <button onClick={goPrevMonth} style={navButton}>
              Prev
            </button>

            <h2 style={{ margin: 0, fontSize: 18, color: '#4c1d95' }}>
              {monthName(viewDate)}
            </h2>

            <button onClick={goNextMonth} style={navButton}>
              Next
            </button>
          </div>

          <div style={weekdayGrid}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} style={weekday}>
                {day}
              </div>
            ))}
          </div>

          <div style={calendarGrid}>
            {calendarCells.map(cell => {
              if (!cell.date) {
                return <div key={cell.key} />;
              }

              const ymd = toYMD(cell.date);
              const isToday = ymd === toYMD(new Date());
              const isSelected = ymd === selectedDate;
              const gapCount = calendarGaps[ymd] ?? 0;

              return (
                <button
                  key={cell.key}
                  onClick={() => setSelectedDate(ymd)}
                  style={{
                    ...dateButton,
                    border: isSelected
                      ? '2px solid #4c1d95'
                      : isToday
                      ? '2px solid #c4b5fd'
                      : '1px solid #e5e7eb',
                    background: isSelected ? '#f5f3ff' : 'white',
                    color: isToday ? '#4c1d95' : '#111827',
                    fontWeight: isToday ? 800 : 600,
                  }}
                >
                  <span>{cell.date.getDate()}</span>

                  {gapCount > 0 && (
                    <span style={gapNumber}>
                      {gapCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div style={summaryCard}>
          <span style={smallLabel}>Selected date</span>
          <h2 style={{ margin: '4px 0 0 0', color: '#4c1d95' }}>
            {formatLongDate(selectedDate)}
          </h2>

          <div style={{ marginTop: 14 }}>
            {loading ? (
              <span style={purpleBadge}>Loading...</span>
            ) : slots.length === 0 ? (
              <span style={greyBadge}>No shifts set up</span>
            ) : gaps.length === 0 ? (
              <span style={greenBadge}>Fully staffed</span>
            ) : (
              <span style={amberBadge}>Needs cover</span>
            )}
          </div>
        </div>
      </div>

      {status && <div style={statusBox}>{status}</div>}

      <section style={sectionCard}>
        <h2 style={sectionTitle}>Available staffing gaps</h2>

        {loading ? (
          <p>Loading...</p>
        ) : slots.length === 0 ? (
          <p style={muted}>No shifts have been set up for this date.</p>
        ) : gaps.length === 0 ? (
          <p style={muted}>No gaps - all sessions are fully staffed.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {gaps.map(slot => (
              <div key={slot.id} style={gapRow}>
                <div>
                  <strong>{sessionLabel(slot.session_key)}</strong>
                  <div style={muted}>
                    {slot.assignedCount}/{slot.needed} assigned
                  </div>
                </div>

                <span style={amberBadge}>
                  {slot.remaining} space{slot.remaining === 1 ? '' : 's'} available
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={sectionCard}>
        <h2 style={sectionTitle}>Assigned invigilators</h2>

        {loading ? (
          <p>Loading...</p>
        ) : slots.length === 0 ? (
          <p style={muted}>No assigned invigilators for this date.</p>
        ) : (
          <div style={sessionList}>
            {slots.map(slot => {
              const assignedInvigilators = assignedBySlot[slot.id] ?? [];
              const attendedCount = assignedInvigilators.filter(
                assignment => assignment.attended
              ).length;

              return (
                <div key={slot.id} style={teamCard}>
                  <div style={teamHeader}>
                    <h3 style={{ margin: 0, color: '#4c1d95' }}>
                      {sessionLabel(slot.session_key)}
                    </h3>

                    <span
                      style={
                        assignedInvigilators.length >= slot.needed
                          ? greenBadge
                          : amberBadge
                      }
                    >
                      {assignedInvigilators.length}/{slot.needed} assigned
                    </span>
                  </div>

                  {!slot.published && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={greyBadge}>Hidden from Available Shifts</span>
                    </div>
                  )}

                  {assignedInvigilators.length === 0 ? (
                    <p style={muted}>No one assigned yet.</p>
                  ) : (
                    <>
                      <div
                        style={{
                          marginBottom: 10,
                          color: '#4b5563',
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        {attendedCount}/{assignedInvigilators.length} marked
                        attended
                      </div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {assignedInvigilators.map(assignment => (
                          <label
                            key={assignment.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '9px 10px',
                              borderRadius: 10,
                              border: assignment.attended
                                ? '1px solid #86efac'
                                : '1px solid #e5e7eb',
                              background: assignment.attended
                                ? '#f0fdf4'
                                : 'white',
                              cursor:
                                savingAttendanceId === assignment.id
                                  ? 'wait'
                                  : 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={assignment.attended}
                              disabled={savingAttendanceId === assignment.id}
                              onChange={event =>
                                toggleAttendance(
                                  assignment.id,
                                  event.target.checked
                                )
                              }
                            />
                            <span
                              style={{
                                flex: 1,
                                fontWeight: 700,
                                color: '#1f2937',
                              }}
                            >
                              {assignment.name}
                            </span>
                            <span
                              style={
                                assignment.attended ? greenBadge : greyBadge
                              }
                            >
                              {assignment.attended
                                ? 'Attended'
                                : 'Not marked'}
                            </span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const page: React.CSSProperties = {
  padding: 16,
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

const mainGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 18,
  marginBottom: 20,
};

const calendarCard: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 16,
  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
};

const calendarHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 10,
};

const navButton: React.CSSProperties = {
  background: '#f5f3ff',
  color: '#4c1d95',
  border: '1px solid #ddd6fe',
  borderRadius: 8,
  padding: '6px 10px',
  cursor: 'pointer',
  fontWeight: 800,
};

const weekdayGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 4,
  marginBottom: 4,
};

const weekday: React.CSSProperties = {
  textAlign: 'center',
  fontSize: 11,
  fontWeight: 700,
  color: '#6b7280',
};

const calendarGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 4,
};

const dateButton: React.CSSProperties = {
  height: 48,
  borderRadius: 9,
  cursor: 'pointer',
  background: 'white',
  fontSize: 14,
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const gapNumber: React.CSSProperties = {
  position: 'absolute',
  top: 3,
  right: 4,
  minWidth: 17,
  height: 17,
  borderRadius: 999,
  background: '#dc2626',
  color: 'white',
  fontSize: 10,
  fontWeight: 900,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 4px',
};

const summaryCard: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
  alignSelf: 'start',
};

const sectionCard: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 20,
  marginBottom: 20,
  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  color: '#4c1d95',
};

const smallLabel: React.CSSProperties = {
  color: '#6b7280',
  fontSize: 13,
  fontWeight: 700,
};

const muted: React.CSSProperties = {
  color: '#6b7280',
};

const gapRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: 12,
  background: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: 12,
};

const sessionList: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 14,
};

const teamCard: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 16,
  background: '#fafafa',
};

const teamHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  marginBottom: 10,
};

const statusBox: React.CSSProperties = {
  marginBottom: 16,
  color: '#991b1b',
  background: '#fee2e2',
  border: '1px solid #fecaca',
  borderRadius: 10,
  padding: 12,
  fontWeight: 700,
};

const greenBadge: React.CSSProperties = {
  display: 'inline-block',
  background: '#dcfce7',
  color: '#166534',
  borderRadius: 999,
  padding: '5px 9px',
  fontSize: 12,
  fontWeight: 800,
};

const amberBadge: React.CSSProperties = {
  display: 'inline-block',
  background: '#fef3c7',
  color: '#92400e',
  borderRadius: 999,
  padding: '5px 9px',
  fontSize: 12,
  fontWeight: 800,
};

const greyBadge: React.CSSProperties = {
  display: 'inline-block',
  background: '#f3f4f6',
  color: '#4b5563',
  borderRadius: 999,
  padding: '5px 9px',
  fontSize: 12,
  fontWeight: 800,
};

const purpleBadge: React.CSSProperties = {
  display: 'inline-block',
  background: '#f5f3ff',
  color: '#4c1d95',
  borderRadius: 999,
  padding: '5px 9px',
  fontSize: 12,
  fontWeight: 800,
};
