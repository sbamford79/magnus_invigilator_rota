'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  buildCalendarDays,
  daysUntil,
  isPastDate,
  isTodayOrFuture,
  monthName,
  toYMD,
} from '../../../lib/dateHelpers';

type SessionKey = 'morning' | 'mid' | 'afternoon';

type MyShift = {
  assignmentId: string;
  shiftSlotId: string;
  seasonId: string;
  date: string;
  label: string;
  session: SessionKey;
  attended: boolean;
  isActiveSeason: boolean;
  clockInAt: string | null;
  clockOutAt: string | null;
};

type ShiftGroup = {
  date: string;
  label: string;
  shifts: MyShift[];
};

function formatSession(session: SessionKey) {
  if (session === 'mid') return 'Mid';
  return session.charAt(0).toUpperCase() + session.slice(1);
}

const sessionOrder: Record<SessionKey, number> = {
  morning: 1,
  mid: 2,
  afternoon: 3,
};

const sessionTimes: Record<SessionKey, { start: string; end: string }> = {
  morning: { start: '09:00', end: '11:30' },
  mid: { start: '11:30', end: '13:00' },
  afternoon: { start: '13:00', end: '15:30' },
};

function toCalendarDateTime(dateStr: string, timeStr: string) {
  const date = dateStr.replaceAll('-', '');
  const time = timeStr.replace(':', '') + '00';
  return `${date}T${time}`;
}

function escapeCalendarText(text: string) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function addShiftToCalendar(shift: MyShift) {
  const time = sessionTimes[shift.session];
  const sessionName = formatSession(shift.session);

  const title = `Magnus Invigilation - ${sessionName}`;
  const description = `${shift.label} - ${sessionName} session`;

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Magnus Academy//Invigilator Rota//EN',
    'BEGIN:VEVENT',
    `UID:${shift.assignmentId}@magnus-invigilator-rota`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART:${toCalendarDateTime(shift.date, time.start)}`,
    `DTEND:${toCalendarDateTime(shift.date, time.end)}`,
    `SUMMARY:${escapeCalendarText(title)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([icsContent], {
    type: 'text/calendar;charset=utf-8',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `magnus-${shift.date}-${shift.session}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export default function MyShiftsPage() {
  const [shifts, setShifts] = useState<MyShift[]>([]);
  const [status, setStatus] = useState('Loading...');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveMonth, setArchiveMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedArchiveDate, setSelectedArchiveDate] = useState<string | null>(
    null
  );

  useEffect(() => {
    loadShifts();
  }, []);

  async function loadShifts() {
    setStatus('');

    const { data: authData } = await supabase.auth.getSession();
    const user = authData.session?.user;

    if (!user) {
      setStatus('Not logged in');
      return;
    }

    const { data: invigilator } = await supabase
      .from('invigilators')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!invigilator) {
      setStatus('No invigilator record');
      return;
    }

    const { data: activeSeasonRows, error: seasonError } = await supabase
      .from('seasons')
      .select('id')
      .eq('status', 'active');

    if (seasonError) {
      setStatus(seasonError.message);
      return;
    }

    const activeSeasonIds = new Set(
      (activeSeasonRows ?? []).map(season => season.id)
    );

    const { data, error } = await supabase
      .from('shift_assignments')
      .select(`
        id,
        shift_slot_id,
        attended,
        clock_in_at,
        clock_out_at,
        shift_slots (
          session_key,
          exam_days (
            season_id,
            exam_date,
            label
          )
        )
      `)
      .eq('invigilator_id', invigilator.id)
      .eq('published', true);

    if (error) {
      setStatus(error.message);
      return;
    }

    const mapped: MyShift[] = (data ?? [])
      .map((row: any) => ({
        assignmentId: row.id,
        shiftSlotId: row.shift_slot_id,
        seasonId: row.shift_slots?.exam_days?.season_id,
        session: row.shift_slots?.session_key,
        date: row.shift_slots?.exam_days?.exam_date,
        label: row.shift_slots?.exam_days?.label,
        attended: row.attended === true,
        clockInAt: row.clock_in_at,
        clockOutAt: row.clock_out_at,
        isActiveSeason: activeSeasonIds.has(
          row.shift_slots?.exam_days?.season_id
        ),
      }))
      .filter(shift => shift.date && shift.seasonId)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (sessionOrder[a.session] ?? 99) - (sessionOrder[b.session] ?? 99);
      });

    setShifts(mapped);

    const latestArchivedShift = [...mapped]
      .filter(shift => isPastDate(shift.date))
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    if (latestArchivedShift) {
      const [year, month] = latestArchivedShift.date.split('-').map(Number);
      setArchiveMonth(new Date(year, month - 1, 1));
    }
  }

  async function releaseShift(shift: MyShift) {
    const confirmRelease = window.confirm(
      'Release this shift? It will return to the available shifts list and your application will be removed.'
    );
    if (!confirmRelease) return;

    const { data: authData } = await supabase.auth.getSession();
    const user = authData.session?.user;

    if (!user) {
      setStatus('Not logged in');
      return;
    }

    const { data: invigilator } = await supabase
      .from('invigilators')
      .select('id, full_name')
      .eq('auth_user_id', user.id)
      .single();

    if (!invigilator) {
      setStatus('No invigilator record');
      return;
    }

    const { error: assignmentError } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('id', shift.assignmentId);

    if (assignmentError) {
      setStatus(assignmentError.message);
      return;
    }

    const { error: applicationError } = await supabase
      .from('shift_applications')
      .delete()
      .eq('shift_slot_id', shift.shiftSlotId)
      .eq('invigilator_id', invigilator.id);

    if (applicationError) {
      setStatus(applicationError.message);
      return;
    }

    const { error: notificationError } = await supabase
      .from('shift_release_notifications')
      .insert({
        season_id: shift.seasonId,
        invigilator_id: invigilator.id,
        invigilator_name: invigilator.full_name,
        shift_slot_id: shift.shiftSlotId,
        exam_date: shift.date,
        session_key: shift.session,
      });

    setStatus(
      notificationError
        ? `Shift released, but the admin notification could not be created: ${notificationError.message}`
        : 'Shift released and the exams team has been notified'
    );
    loadShifts();
  }

  const groupedShifts = useMemo(() => {
    const groups = new Map<string, ShiftGroup>();

    for (const shift of shifts.filter(
      shift => shift.isActiveSeason && isTodayOrFuture(shift.date)
    )) {
      if (!groups.has(shift.date)) {
        groups.set(shift.date, {
          date: shift.date,
          label: shift.label,
          shifts: [],
        });
      }

      groups.get(shift.date)!.shifts.push(shift);
    }

    return Array.from(groups.values());
  }, [shifts]);

  const archivedShifts = useMemo(
    () => shifts.filter(shift => isPastDate(shift.date)),
    [shifts]
  );

  const archiveCalendarCells = useMemo(
    () => buildCalendarDays(archiveMonth),
    [archiveMonth]
  );

  const archivedShiftsForMonth = useMemo(() => {
    const monthPrefix = `${archiveMonth.getFullYear()}-${String(
      archiveMonth.getMonth() + 1
    ).padStart(2, '0')}`;

    return archivedShifts.filter(
      shift =>
        shift.date.startsWith(monthPrefix) &&
        (!selectedArchiveDate || shift.date === selectedArchiveDate)
    );
  }, [archivedShifts, archiveMonth, selectedArchiveDate]);

  const archiveCountsByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    archivedShifts.forEach(shift => {
      counts[shift.date] = (counts[shift.date] ?? 0) + 1;
    });
    return counts;
  }, [archivedShifts]);

  function changeArchiveMonth(amount: number) {
    setArchiveMonth(current => {
      const next = new Date(
        current.getFullYear(),
        current.getMonth() + amount,
        1
      );
      return next;
    });
    setSelectedArchiveDate(null);
  }

  if (status === 'Loading...') {
    return <div style={{ padding: 24 }}>Loading shifts...</div>;
  }

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
        <h1 style={{ margin: 0, fontSize: 32 }}>My Shifts</h1>
        <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.95 }}>
          View your assigned shifts below. You can release a shift until 10 days
          before the exam date.
        </p>
      </div>

      {status && status !== 'Loading...' && (
        <div
          style={{
            marginBottom: 18,
            padding: 12,
            borderRadius: 10,
            background: '#f5f3ff',
            color: '#4c1d95',
            border: '1px solid #ddd6fe',
            fontWeight: 600,
          }}
        >
          {status}
        </div>
      )}

      {groupedShifts.length === 0 ? (
        <div
          style={{
            background: 'white',
            borderRadius: 14,
            padding: 24,
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          }}
        >
          <p style={{ margin: 0, color: '#555' }}>No upcoming assigned shifts.</p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 18,
          }}
        >
          {groupedShifts.map(group => {
            const daysLeft = daysUntil(group.date);
            const canRelease = daysLeft > 10;

            return (
              <div
                key={group.date}
                style={{
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: 16,
                  padding: 22,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    marginBottom: 12,
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: '#ede9fe',
                    color: '#4c1d95',
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  Assigned
                </div>

                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 12,
                    color: '#4c1d95',
                    fontSize: 20,
                  }}
                >
                  {group.label}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <strong>Days until exam:</strong> {daysLeft}
                </div>

                <div style={{ display: 'grid', gap: 14 }}>
                  {group.shifts.map(shift => {
                    const time = sessionTimes[shift.session];

                    return (
                      <div
                        key={shift.assignmentId}
                        style={{
                          borderTop: '1px solid #f1f5f9',
                          paddingTop: 10,
                        }}
                      >
                        <div style={{ marginBottom: 8 }}>
                          <strong>Session:</strong>{' '}
                          {formatSession(shift.session)} ({time.start}-
                          {time.end})
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            gap: 10,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                          }}
                        >
                          <button
                            onClick={() => addShiftToCalendar(shift)}
                            style={{
                              background: '#f5f3ff',
                              color: '#4c1d95',
                              border: '1px solid #ddd6fe',
                              padding: '8px 12px',
                              borderRadius: 8,
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            Add to calendar
                          </button>

                          {canRelease ? (
                            <button
                              onClick={() => releaseShift(shift)}
                              style={{
                                background: '#4c1d95',
                                color: 'white',
                                border: 'none',
                                padding: '8px 12px',
                                borderRadius: 8,
                                cursor: 'pointer',
                                fontWeight: 700,
                              }}
                            >
                              Release shift
                            </button>
                          ) : (
                            <div
                              style={{
                                padding: '8px 10px',
                                borderRadius: 8,
                                background: '#f9fafb',
                                border: '1px solid #e5e7eb',
                                color: '#6b7280',
                                fontWeight: 600,
                              }}
                            >
                              Cannot release within 10 days
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section
        style={{
          marginTop: 24,
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 16,
          boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}
      >
        <button
          onClick={() => setArchiveOpen(current => !current)}
          style={{
            width: '100%',
            border: 'none',
            background: '#fafafa',
            padding: 18,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            color: '#4c1d95',
            textAlign: 'left',
          }}
        >
          <span>
            <strong style={{ fontSize: 20 }}>Completed shifts archive</strong>
            <span
              style={{
                display: 'block',
                marginTop: 4,
                color: '#6b7280',
                fontWeight: 500,
              }}
            >
              {archivedShifts.length} past shift
              {archivedShifts.length === 1 ? '' : 's'} available
            </span>
          </span>
          <strong>{archiveOpen ? 'Close ▲' : 'Open ▼'}</strong>
        </button>

        {archiveOpen && (
          <div style={{ padding: 18, borderTop: '1px solid #e5e7eb' }}>
            {archivedShifts.length === 0 ? (
              <p style={{ margin: 0, color: '#6b7280' }}>
                Completed shifts will appear here after their exam date.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 20,
                  alignItems: 'start',
                }}
              >
                <div
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 14,
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    <button
                      onClick={() => changeArchiveMonth(-1)}
                      style={archiveNavButton}
                    >
                      Prev
                    </button>
                    <strong style={{ color: '#4c1d95' }}>
                      {monthName(archiveMonth)}
                    </strong>
                    <button
                      onClick={() => changeArchiveMonth(1)}
                      style={archiveNavButton}
                    >
                      Next
                    </button>
                  </div>

                  <div style={archiveWeekdayGrid}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(
                      day => (
                        <div key={day} style={archiveWeekday}>
                          {day}
                        </div>
                      )
                    )}
                  </div>

                  <div style={archiveCalendarGrid}>
                    {archiveCalendarCells.map(cell => {
                      if (!cell.date) return <div key={cell.key} />;

                      const date = toYMD(cell.date);
                      const shiftCount = archiveCountsByDate[date] ?? 0;
                      const selected = date === selectedArchiveDate;

                      return (
                        <button
                          key={cell.key}
                          disabled={shiftCount === 0}
                          onClick={() =>
                            setSelectedArchiveDate(current =>
                              current === date ? null : date
                            )
                          }
                          style={{
                            ...archiveDateButton,
                            background: selected
                              ? '#4c1d95'
                              : shiftCount > 0
                              ? '#ede9fe'
                              : 'white',
                            color: selected
                              ? 'white'
                              : shiftCount > 0
                              ? '#4c1d95'
                              : '#9ca3af',
                            cursor: shiftCount > 0 ? 'pointer' : 'default',
                            fontWeight: shiftCount > 0 ? 800 : 500,
                          }}
                        >
                          {cell.date.getDate()}
                          {shiftCount > 0 && (
                            <span
                              style={{
                                fontSize: 9,
                                lineHeight: 1,
                                marginTop: 2,
                              }}
                            >
                              {shiftCount} shift{shiftCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {selectedArchiveDate && (
                    <button
                      onClick={() => setSelectedArchiveDate(null)}
                      style={{
                        ...archiveNavButton,
                        marginTop: 12,
                        width: '100%',
                      }}
                    >
                      Show whole month
                    </button>
                  )}
                </div>

                <div>
                  <h2 style={{ marginTop: 0, color: '#4c1d95' }}>
                    {selectedArchiveDate
                      ? new Date(
                          `${selectedArchiveDate}T00:00:00`
                        ).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                      : monthName(archiveMonth)}
                  </h2>

                  {archivedShiftsForMonth.length === 0 ? (
                    <div
                      style={{
                        color: '#6b7280',
                        background: '#f9fafb',
                        borderRadius: 12,
                        padding: 16,
                      }}
                    >
                      No completed shifts in this month.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {archivedShiftsForMonth.map(shift => (
                        <div
                          key={shift.assignmentId}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12,
                            flexWrap: 'wrap',
                            border: '1px solid #e5e7eb',
                            borderRadius: 12,
                            padding: 14,
                            background: '#fafafa',
                          }}
                        >
                          <div>
                            <strong style={{ color: '#1f2937' }}>
                              {shift.label}
                            </strong>
                            <div
                              style={{
                                color: '#6b7280',
                                marginTop: 4,
                                fontSize: 14,
                              }}
                            >
                              {formatSession(shift.session)} ·{' '}
                              {sessionTimes[shift.session].start}–
                              {sessionTimes[shift.session].end}
                            </div>
                            <div
                              style={{
                                color: '#4b5563',
                                marginTop: 5,
                                fontSize: 13,
                              }}
                            >
                              Clocked in:{' '}
                              {shift.clockInAt
                                ? new Date(
                                    shift.clockInAt
                                  ).toLocaleTimeString('en-GB', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'Not recorded'}{' '}
                              · Clocked out:{' '}
                              {shift.clockOutAt
                                ? new Date(
                                    shift.clockOutAt
                                  ).toLocaleTimeString('en-GB', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : 'Not recorded'}
                            </div>
                          </div>
                          <span
                            style={{
                              borderRadius: 999,
                              padding: '6px 10px',
                              fontSize: 12,
                              fontWeight: 800,
                              background: shift.attended
                                ? '#dcfce7'
                                : '#fef3c7',
                              color: shift.attended ? '#166534' : '#92400e',
                            }}
                          >
                            {shift.attended
                              ? 'Attendance confirmed'
                              : 'Attendance not marked'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

const archiveNavButton: React.CSSProperties = {
  background: '#f5f3ff',
  color: '#4c1d95',
  border: '1px solid #ddd6fe',
  borderRadius: 8,
  padding: '6px 10px',
  cursor: 'pointer',
  fontWeight: 800,
};

const archiveWeekdayGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 4,
  marginBottom: 4,
};

const archiveWeekday: React.CSSProperties = {
  textAlign: 'center',
  fontSize: 10,
  fontWeight: 700,
  color: '#6b7280',
};

const archiveCalendarGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: 4,
};

const archiveDateButton: React.CSSProperties = {
  minHeight: 45,
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
};
