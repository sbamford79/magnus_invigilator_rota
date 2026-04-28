'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type ShiftItem = {
  id: string;
  date: string;
  label: string;
  session: string;
};

function parseLocalDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

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

// ✅ ADD THIS
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
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setLoading(false);
      return;
    }

    const { data: invigilator } = await supabase
      .from('invigilators')
      .select('id')
      .eq('auth_user_id', authData.user.id)
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

  // ✅ UPDATED WITH SORT
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

      {/* (rest unchanged) */}

      <div style={{ marginTop: 16 }}>
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
    </div>
  );
}