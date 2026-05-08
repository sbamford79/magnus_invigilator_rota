'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type ShiftItem = {
  id: string;
  date: string;
  label: string;
  session: string;
};

type ShiftGroup = {
  date: string;
  label: string;
  assigned: ShiftItem[];
  applied: ShiftItem[];
};

function toYMD(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatSession(session: string) {
  if (session === 'mid') return 'Mid';
  return session.charAt(0).toUpperCase() + session.slice(1);
}

const sessionOrder: Record<string, number> = {
  morning: 1,
  mid: 2,
  afternoon: 3,
};

function sortBySessionOrder(a: ShiftItem, b: ShiftItem) {
  return (sessionOrder[a.session] ?? 99) - (sessionOrder[b.session] ?? 99);
}

function monthName(date: Date) {
  return date.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

function buildCalendarDays(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const startDay = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<{ date: Date | null; key: string }> = [];

  for (let i = 0; i < startDay; i++) {
    cells.push({ date: null, key: `blank-start-${i}` });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      date: new Date(year, month, day),
      key: `day-${year}-${month + 1}-${day}`,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: null, key: `blank-end-${cells.length}` });
  }

  return cells;
}

export default function InvigilatorCalendarPage() {
  const [assignedShifts, setAssignedShifts] = useState<ShiftItem[]>([]);
  const [appliedShifts, setAppliedShifts] = useState<ShiftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  useEffect(() => {
    loadCalendarData();
  }, []);

  async function loadCalendarData() {
    const { data: authData } = await supabase.auth.getSession();

    const user = authData.session?.user;

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: invigilator } = await supabase
      .from('invigilators')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!invigilator) {
      setLoading(false);
      return;
    }

    const invigilatorId = invigilator.id;

    const { data: assignedData } = await supabase
      .from('shift_assignments')
      .select(`
        id,
        shift_slots (
          session_key,
          exam_days ( exam_date, label )
        )
      `)
      .eq('invigilator_id', invigilatorId)
      .eq('published', true);

    const { data: appliedData } = await supabase
      .from('shift_applications')
      .select(`
        id,
        shift_slots (
          session_key,
          exam_days ( exam_date, label )
        )
      `)
      .eq('invigilator_id', invigilatorId);

    const mapData = (rows: any[]) =>
      (rows ?? []).map(row => ({
        id: row.id,
        date: row.shift_slots?.exam_days?.exam_date,
        label: row.shift_slots?.exam_days?.label,
        session: row.shift_slots?.session_key,
      }));

    const assigned = mapData(assignedData ?? []).filter(
      shift => shift.date && shift.label && shift.session
    );

    const assignedKeys = new Set(
      assigned.map(shift => `${shift.date}__${shift.session}`)
    );

    const applied = mapData(appliedData ?? [])
      .filter(shift => shift.date && shift.label && shift.session)
      .filter(shift => !assignedKeys.has(`${shift.date}__${shift.session}`));

    setAssignedShifts(assigned);
    setAppliedShifts(applied);

    const allDates = [
      ...assigned.map(shift => shift.date),
      ...applied.map(shift => shift.date),
    ].sort();

    if (allDates.length > 0) {
      setSelectedDate(allDates[0]);
    }

    setLoading(false);
  }

  const assignedDates = useMemo(
    () => new Set(assignedShifts.map(s => s.date)),
    [assignedShifts]
  );

  const appliedDates = useMemo(
    () => new Set(appliedShifts.map(s => s.date)),
    [appliedShifts]
  );

  const calendarCells = useMemo(
    () => buildCalendarDays(viewDate),
    [viewDate]
  );

  const assignedForSelected = useMemo(
    () =>
      assignedShifts
        .filter(s => s.date === selectedDate)
        .sort(sortBySessionOrder),
    [assignedShifts, selectedDate]
  );

  const appliedForSelected = useMemo(
    () =>
      appliedShifts
        .filter(s => s.date === selectedDate)
        .sort(sortBySessionOrder),
    [appliedShifts, selectedDate]
  );

  const fullShiftList = useMemo(() => {
    const groups = new Map<string, ShiftGroup>();

    for (const shift of assignedShifts) {
      if (!groups.has(shift.date)) {
        groups.set(shift.date, {
          date: shift.date,
          label: shift.label,
          assigned: [],
          applied: [],
        });
      }

      groups.get(shift.date)!.assigned.push(shift);
    }

    for (const shift of appliedShifts) {
      if (!groups.has(shift.date)) {
        groups.set(shift.date, {
          date: shift.date,
          label: shift.label,
          assigned: [],
          applied: [],
        });
      }

      groups.get(shift.date)!.applied.push(shift);
    }

    return Array.from(groups.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(group => ({
        ...group,
        assigned: group.assigned.sort(sortBySessionOrder),
        applied: group.applied.sort(sortBySessionOrder),
      }));
  }, [assignedShifts, appliedShifts]);

  const todayYMD = toYMD(new Date());

  function goPrevMonth() {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function goNextMonth() {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 12 }}>My Calendar</h1>

      <div style={calendarBox}>
        <div style={header}>
          <button onClick={goPrevMonth} style={navButtonStyle}>
            ←
          </button>
          <h2 style={{ margin: 0, fontSize: 18 }}>{monthName(viewDate)}</h2>
          <button onClick={goNextMonth} style={navButtonStyle}>
            →
          </button>
        </div>

        <div style={weekdayGrid}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div key={day} style={weekdayStyle}>
              {day}
            </div>
          ))}
        </div>

        <div style={grid}>
          {calendarCells.map(cell => {
            if (!cell.date) return <div key={cell.key} />;

            const ymd = toYMD(cell.date);
            const hasAssigned = assignedDates.has(ymd);
            const hasApplied = appliedDates.has(ymd);
            const isToday = ymd === todayYMD;
            const isSelected = selectedDate === ymd;
            const isHovered = hoveredDate === ymd;

            return (
              <button
                key={cell.key}
                onClick={() => setSelectedDate(ymd)}
                onMouseEnter={() => setHoveredDate(ymd)}
                onMouseLeave={() => setHoveredDate(null)}
                style={{
                  ...cellStyle,
                  border: isSelected
                    ? '2px solid #1d4ed8'
                    : isToday
                    ? '2px solid #93c5fd'
                    : '1px solid #eee',
                  background: isSelected
                    ? '#eff6ff'
                    : isHovered
                    ? '#f8fafc'
                    : '#fff',
                  boxShadow: isHovered
                    ? '0 2px 6px rgba(0,0,0,0.08)'
                    : 'none',
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? '#1d4ed8' : '#111827',
                  }}
                >
                  {cell.date.getDate()}
                </div>

                <div style={{ marginTop: 2 }}>
                  {hasAssigned && (
                    <div style={{ fontSize: 9, color: '#2563eb' }}>
                      Assigned
                    </div>
                  )}
                  {hasApplied && (
                    <div style={{ fontSize: 9, color: '#6b7280' }}>
                      Applied
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={selectedDayBox}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Shifts</h2>

        <div style={{ marginBottom: 14 }}>
          <strong style={{ color: '#2563eb' }}>Assigned</strong>
          {assignedForSelected.length === 0 ? (
            <div style={{ color: '#6b7280', marginTop: 4 }}>
              No assigned shifts for this day.
            </div>
          ) : (
            assignedForSelected.map(s => (
              <div key={s.id} style={{ marginTop: 4 }}>
                {s.label} – {formatSession(s.session)}
              </div>
            ))
          )}
        </div>

        <div>
          <strong style={{ color: '#6b7280' }}>Applied</strong>
          {appliedForSelected.length === 0 ? (
            <div style={{ color: '#6b7280', marginTop: 4 }}>
              No applied shifts for this day.
            </div>
          ) : (
            appliedForSelected.map(s => (
              <div key={s.id} style={{ marginTop: 4 }}>
                {s.label} – {formatSession(s.session)}
              </div>
            ))
          )}
        </div>
      </div>

      <section style={fullListCard}>
        <h2 style={fullListTitle}>All My Shifts</h2>
        <p style={fullListIntro}>
          A full list of your assigned and applied shifts for the season.
        </p>

        {fullShiftList.length === 0 ? (
          <div style={emptyFullList}>No shifts to show yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {fullShiftList.map(group => (
              <div key={group.date} style={shiftListRow}>
                <div style={dateColumn}>
                  <div style={dateLabel}>{group.label}</div>
                  <div style={dateSmall}>{group.date}</div>
                </div>

                <div style={shiftColumn}>
                  {group.assigned.length > 0 && (
                    <div style={shiftGroupLine}>
                      <span style={assignedBadge}>Assigned</span>
                      <span>
                        {group.assigned
                          .map(shift => formatSession(shift.session))
                          .join(', ')}
                      </span>
                    </div>
                  )}

                  {group.applied.length > 0 && (
                    <div style={shiftGroupLine}>
                      <span style={appliedBadge}>Applied</span>
                      <span>
                        {group.applied
                          .map(shift => formatSession(shift.session))
                          .join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const calendarBox: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: 10,
  borderRadius: 10,
  background: '#fff',
};

const selectedDayBox: React.CSSProperties = {
  marginTop: 16,
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 16,
  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
};

const header: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
};

const weekdayGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 4,
  marginBottom: 4,
};

const weekdayStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: 11,
  fontWeight: 600,
  color: '#6b7280',
};

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 4,
};

const cellStyle: React.CSSProperties = {
  height: 46,
  borderRadius: 6,
  padding: 2,
  fontSize: 10,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const navButtonStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  borderRadius: 8,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 16,
};

const fullListCard: React.CSSProperties = {
  marginTop: 18,
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 18,
  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
};

const fullListTitle: React.CSSProperties = {
  margin: 0,
  color: '#4c1d95',
  fontSize: 22,
};

const fullListIntro: React.CSSProperties = {
  marginTop: 6,
  marginBottom: 16,
  color: '#6b7280',
};

const emptyFullList: React.CSSProperties = {
  color: '#6b7280',
  padding: 14,
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
};

const shiftListRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(150px, 1fr) 2fr',
  gap: 12,
  alignItems: 'start',
  padding: 12,
  border: '1px solid #ede9fe',
  borderRadius: 12,
  background: '#fafafa',
};

const dateColumn: React.CSSProperties = {
  minWidth: 0,
};

const dateLabel: React.CSSProperties = {
  color: '#4c1d95',
  fontWeight: 800,
};

const dateSmall: React.CSSProperties = {
  marginTop: 3,
  color: '#6b7280',
  fontSize: 12,
};

const shiftColumn: React.CSSProperties = {
  display: 'grid',
  gap: 8,
};

const shiftGroupLine: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
};

const assignedBadge: React.CSSProperties = {
  display: 'inline-block',
  background: '#dbeafe',
  color: '#1d4ed8',
  borderRadius: 999,
  padding: '4px 8px',
  fontSize: 12,
  fontWeight: 800,
};

const appliedBadge: React.CSSProperties = {
  display: 'inline-block',
  background: '#f3f4f6',
  color: '#4b5563',
  borderRadius: 999,
  padding: '4px 8px',
  fontSize: 12,
  fontWeight: 800,
};