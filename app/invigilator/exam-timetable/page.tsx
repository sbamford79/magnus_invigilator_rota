'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type ExamRow = {
  id: string | number;
  season_id: string | null;
  exam_date: string;
  exam_time: string | null;
  exam_level: string | null;
  exam_board: string | null;
  paper_code: string | null;
  student_count: number | null;
  duration_minutes: number | null;
  notes: string | null;
};

function toYMD(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function monthName(date: Date) {
  return date.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

function formatLongDate(dateStr: string) {
  return parseDate(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
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

export default function InvigilatorExamTimetablePage() {
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [status, setStatus] = useState('Loading timetable...');
  const [selectedDate, setSelectedDate] = useState(toYMD(new Date()));
  const [viewDate, setViewDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  useEffect(() => {
    loadExams();
  }, []);

  async function loadExams() {
    setStatus('Loading timetable...');

    const { data: activeSeason, error: seasonError } = await supabase
      .from('seasons')
      .select('id')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (seasonError) {
      setStatus(seasonError.message);
      return;
    }

    if (!activeSeason?.id) {
      setStatus('No active season found.');
      return;
    }

    const { data, error } = await supabase
      .from('exam_timetable')
      .select('*')
      .eq('season_id', activeSeason.id)
      .order('exam_date', { ascending: true })
      .order('exam_time', { ascending: true });

    if (error) {
      setStatus(error.message);
      return;
    }

    const loaded = (data ?? []) as ExamRow[];
    setExams(loaded);

    if (loaded.length > 0) {
      setSelectedDate(loaded[0].exam_date);
      const firstDate = parseDate(loaded[0].exam_date);
      setViewDate(new Date(firstDate.getFullYear(), firstDate.getMonth(), 1));
    }

    setStatus('');
  }

  const calendarCells = useMemo(() => buildCalendarDays(viewDate), [viewDate]);

  const examDates = useMemo(
    () => new Set(exams.map(exam => exam.exam_date)),
    [exams]
  );

  const examsForSelectedDate = useMemo(
    () => exams.filter(exam => exam.exam_date === selectedDate),
    [exams, selectedDate]
  );

 const amCandidates = examsForSelectedDate
  .filter(exam => {
    if (!exam.exam_time) return false;

    const hour = parseInt(exam.exam_time.split(':')[0] || '0');
    return hour < 12;
  })
  .reduce((total, exam) => total + (exam.student_count ?? 0), 0);

const pmCandidates = examsForSelectedDate
  .filter(exam => {
    if (!exam.exam_time) return false;

    const hour = parseInt(exam.exam_time.split(':')[0] || '0');
    return hour >= 12;
  })
  .reduce((total, exam) => total + (exam.student_count ?? 0), 0);

  function goPrevMonth() {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function goNextMonth() {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  if (status === 'Loading timetable...') {
    return <div style={page}>Loading timetable...</div>;
  }

  return (
    <div style={page}>
      <div style={hero}>
        <h1 style={heroTitle}>Exam Timetable</h1>
        <p style={heroText}>
          Click a date to see which exams are taking place and how many
          candidates are sitting each paper.
        </p>
      </div>

      {status && <div style={statusBox}>{status}</div>}

     <div style={infoGrid}>
  <div style={infoCard}>
    <span style={smallLabel}>AM Candidates</span>
    <strong style={infoValue}>{amCandidates}</strong>
  </div>

  <div style={infoCard}>
    <span style={smallLabel}>PM Candidates</span>
    <strong style={infoValue}>{pmCandidates}</strong>
  </div>
</div> 

      <div style={mainGrid}>
        <section style={calendarCard}>
          <div style={calendarHeader}>
            <button onClick={goPrevMonth} style={navButton}>
              ←
            </button>

            <h2 style={{ margin: 0, fontSize: 18, color: '#4c1d95' }}>
              {monthName(viewDate)}
            </h2>

            <button onClick={goNextMonth} style={navButton}>
              →
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
              if (!cell.date) return <div key={cell.key} />;

              const ymd = toYMD(cell.date);
              const hasExams = examDates.has(ymd);
              const isSelected = ymd === selectedDate;
              const examCount = exams.filter(e => e.exam_date === ymd).length;

              return (
                <button
                  key={cell.key}
                  onClick={() => setSelectedDate(ymd)}
                  style={{
                    ...dateButton,
                    border: isSelected
                      ? '2px solid #4c1d95'
                      : hasExams
                      ? '2px solid #c4b5fd'
                      : '1px solid #e5e7eb',
                    background: isSelected
                      ? '#f5f3ff'
                      : hasExams
                      ? '#faf5ff'
                      : 'white',
                    color: hasExams ? '#4c1d95' : '#111827',
                    fontWeight: hasExams ? 800 : 600,
                  }}
                >
                  <span>{cell.date.getDate()}</span>
                  {hasExams && <span style={dot}>{examCount}</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section style={summaryCard}>
          <span style={smallLabel}>Selected date</span>
          <h2 style={{ margin: '4px 0 10px 0', color: '#4c1d95' }}>
            {formatLongDate(selectedDate)}
          </h2>

         <div style={summaryStats}>
  <div
    style={{
      background: '#faf5ff',
      border: '1px solid #ddd6fe',
      borderRadius: 12,
      padding: 14,
      textAlign: 'center',
    }}
  >
    <span style={smallLabel}>AM Candidates</span>
    <strong style={infoValue}>{amCandidates}</strong>
  </div>

  <div
    style={{
      background: '#faf5ff',
      border: '1px solid #ddd6fe',
      borderRadius: 12,
      padding: 14,
      textAlign: 'center',
    }}
  >
    <span style={smallLabel}>PM Candidates</span>
    <strong style={infoValue}>{pmCandidates}</strong>
  </div>
</div>

            <div>
             <span style={smallLabel}>PM candidates</span>
             <strong style={infoValue}>{pmCandidates}</strong>
            </div>
          </div>
        </section>
      </div>

      <section style={examListCard}>
        <h2 style={sectionTitle}>Exams on selected date</h2>

        {examsForSelectedDate.length === 0 ? (
          <p style={muted}>No exams found for this date.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {examsForSelectedDate.map(exam => (
              <div key={exam.id} style={examRow}>
                <div>
                  <div style={examTitle}>
                    {exam.exam_time || 'Time TBC'} — {exam.paper_code || 'Paper'}
                  </div>

                  <div style={examMeta}>
                    {exam.exam_board || 'Board'} · {exam.exam_level || 'Level'}
                  </div>

                  {exam.notes && <div style={examNotes}>{exam.notes}</div>}

                  {exam.duration_minutes !== null && (
                    <div style={examMeta}>
                      Duration: {exam.duration_minutes} minutes
                    </div>
                  )}
                </div>

                <div style={studentBadge}>
                  {exam.student_count ?? 0} candidate
                  {(exam.student_count ?? 0) === 1 ? '' : 's'}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
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

const statusBox: React.CSSProperties = {
  marginBottom: 18,
  color: '#4c1d95',
  background: '#f5f3ff',
  border: '1px solid #ddd6fe',
  borderRadius: 10,
  padding: 12,
  fontWeight: 700,
};

const infoGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
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
  fontWeight: 700,
  marginBottom: 4,
};

const infoValue: React.CSSProperties = {
  color: '#4c1d95',
  fontSize: 18,
};

const mainGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(280px, 420px) 1fr',
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
  minHeight: 46,
  borderRadius: 9,
  cursor: 'pointer',
  background: 'white',
  fontSize: 14,
  display: 'grid',
  gap: 2,
  placeItems: 'center',
};

const dot: React.CSSProperties = {
  background: '#4c1d95',
  color: 'white',
  borderRadius: 999,
  minWidth: 18,
  height: 18,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  fontWeight: 800,
};

const summaryCard: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
  alignSelf: 'start',
};

const summaryStats: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 12,
  marginTop: 14,
  alignItems: 'stretch',
};

const examListCard: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  color: '#4c1d95',
};

const muted: React.CSSProperties = {
  color: '#6b7280',
};

const examRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 14,
  alignItems: 'flex-start',
  border: '1px solid #ede9fe',
  borderRadius: 14,
  padding: 14,
  background: '#fafafa',
};

const examTitle: React.CSSProperties = {
  color: '#4c1d95',
  fontWeight: 800,
  marginBottom: 4,
};

const examMeta: React.CSSProperties = {
  color: '#6b7280',
  fontSize: 13,
  marginTop: 4,
};

const examNotes: React.CSSProperties = {
  marginTop: 6,
  color: '#374151',
};

const studentBadge: React.CSSProperties = {
  background: '#ede9fe',
  color: '#4c1d95',
  borderRadius: 999,
  padding: '6px 10px',
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: 'nowrap',
};