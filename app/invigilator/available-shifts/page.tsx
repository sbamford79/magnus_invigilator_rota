'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { isTodayOrFuture } from '../../../lib/dateHelpers';

type AvailableShift = {
  shiftSlotId: string;
  examDayId: string;
  date: string;
  label: string;
  session: string;
  displayLabel: string;
  startTime: string;
  endTime: string;
  needed: number;
  applied: boolean;
  assignedCount: number;
};

type ShiftGroup = {
  date: string;
  label: string;
  shifts: AvailableShift[];
};

function formatSessionLabel(session: string) {
  if (session === 'mid') return 'Mid';
  if (session.startsWith('extra_')) return 'Additional session';
  return session.charAt(0).toUpperCase() + session.slice(1);
}

const sessionOrder: Record<string, number> = {
  morning: 1,
  mid: 2,
  afternoon: 3,
};

function fallbackTimes(session: string) {
  if (session === 'morning') return { start: '09:00', end: '11:30' };
  if (session === 'mid') return { start: '11:30', end: '13:00' };
  return { start: '13:00', end: '15:30' };
}

function shiftsOverlap(
  first: { date: string; startTime: string; endTime: string },
  second: { date: string; startTime: string; endTime: string }
) {
  return first.date === second.date &&
    first.startTime < second.endTime &&
    second.startTime < first.endTime;
}

export default function AvailableShiftsPage() {
  const [shifts, setShifts] = useState<AvailableShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadShifts();
  }, []);

  async function loadShifts() {
    setLoading(true);
    setStatus('');

    const { data: authData, error: authError } = await supabase.auth.getSession();

    const user = authData.session?.user;

    if (authError || !user) {
      setStatus('Could not load user.');
      setLoading(false);
      return;
    }

    const { data: invigilator, error: invigilatorError } = await supabase
      .from('invigilators')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (invigilatorError || !invigilator) {
      setStatus('Could not find invigilator.');
      setLoading(false);
      return;
    }

    const invigilatorId = invigilator.id;

    const { data: slotRows, error: slotError } = await supabase
      .from('shift_slots')
      .select(`
        id,
        exam_day_id,
        session_key,
        display_label,
        start_time,
        end_time,
        needed,
        published,
        exam_days (
          id,
          exam_date,
          label
        )
      `)
      .eq('published', true);

    if (slotError) {
      setStatus(`Could not load shifts: ${slotError.message}`);
      setLoading(false);
      return;
    }

    const slots = slotRows ?? [];

    if (slots.length === 0) {
      setShifts([]);
      setLoading(false);
      return;
    }

    const slotIds = slots.map((slot: any) => slot.id);

    const { data: applicationRows, error: applicationError } = await supabase
      .from('shift_applications')
      .select(`
        shift_slot_id,
        shift_slots (
          session_key,
          start_time,
          end_time,
          exam_days (
            exam_date
          )
        )
      `)
      .eq('invigilator_id', invigilatorId);

    if (applicationError) {
      setStatus(`Could not load applications: ${applicationError.message}`);
      setLoading(false);
      return;
    }

    const appliedShiftIds = new Set(
      (applicationRows ?? []).map(row => row.shift_slot_id)
    );

    const { data: invigilatorAssignmentRows, error: invigilatorAssignmentError } =
      await supabase
        .from('shift_assignments')
        .select(`
          shift_slot_id,
          shift_slots (
            session_key,
            start_time,
            end_time,
            exam_days (
              exam_date
            )
          )
        `)
        .eq('invigilator_id', invigilatorId);

    if (invigilatorAssignmentError) {
      setStatus(
        `Could not load existing assignments: ${invigilatorAssignmentError.message}`
      );
      setLoading(false);
      return;
    }

    const assignedShiftIdsForThisInvigilator = new Set(
      (invigilatorAssignmentRows ?? []).map(row => row.shift_slot_id)
    );

    const occupiedIntervals: Array<{ date: string; startTime: string; endTime: string }> = [];

    (applicationRows ?? []).forEach((row: any) => {
      const date = row.shift_slots?.exam_days?.exam_date;
      const session = row.shift_slots?.session_key;
      const fallback = fallbackTimes(session);

      if (date && session) {
        occupiedIntervals.push({
          date,
          startTime: String(row.shift_slots?.start_time ?? fallback.start).slice(0, 5),
          endTime: String(row.shift_slots?.end_time ?? fallback.end).slice(0, 5),
        });
      }
    });

    (invigilatorAssignmentRows ?? []).forEach((row: any) => {
      const date = row.shift_slots?.exam_days?.exam_date;
      const session = row.shift_slots?.session_key;
      const fallback = fallbackTimes(session);

      if (date && session) {
        occupiedIntervals.push({
          date,
          startTime: String(row.shift_slots?.start_time ?? fallback.start).slice(0, 5),
          endTime: String(row.shift_slots?.end_time ?? fallback.end).slice(0, 5),
        });
      }
    });

    const { data: assignmentRows, error: assignmentError } = await supabase
      .from('published_shift_team')
      .select('shift_slot_id, invigilator_id')
      .in('shift_slot_id', slotIds)
      .eq('published', true);

    if (assignmentError) {
      setStatus(`Could not load assignments: ${assignmentError.message}`);
      setLoading(false);
      return;
    }

    const assignedCountByShift: Record<string, number> = {};

    (assignmentRows ?? []).forEach(row => {
      assignedCountByShift[row.shift_slot_id] =
        (assignedCountByShift[row.shift_slot_id] ?? 0) + 1;
    });

    const mappedShifts: AvailableShift[] = (slots as any[])
      .map(slot => {
        const assignedCount = assignedCountByShift[slot.id] ?? 0;
        const fallback = fallbackTimes(slot.session_key);

        return {
          shiftSlotId: slot.id,
          examDayId: slot.exam_days?.id ?? '',
          date: slot.exam_days?.exam_date ?? '',
          label: slot.exam_days?.label ?? 'Unknown date',
          session: slot.session_key,
          displayLabel: slot.display_label ?? formatSessionLabel(slot.session_key),
          startTime: String(slot.start_time ?? fallback.start).slice(0, 5),
          endTime: String(slot.end_time ?? fallback.end).slice(0, 5),
          needed: slot.needed,
          applied: appliedShiftIds.has(slot.id),
          assignedCount,
        };
      })
      .filter(shift => {
        const isFull = shift.assignedCount >= shift.needed;
        const hasAppliedForThisShift = appliedShiftIds.has(shift.shiftSlotId);
        const alreadyAssignedToThisPerson =
          assignedShiftIdsForThisInvigilator.has(shift.shiftSlotId);
        const alreadyBusyAtThisTime = occupiedIntervals.some(interval =>
          shiftsOverlap(shift, interval)
        );

        return (
          isTodayOrFuture(shift.date) &&
          !isFull &&
          !alreadyAssignedToThisPerson &&
          (!alreadyBusyAtThisTime || hasAppliedForThisShift)
        );
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startTime.localeCompare(b.startTime);
      });

    setShifts(mappedShifts);
    setLoading(false);
  }

  async function toggleApplication(shift: AvailableShift) {
    setStatus('');

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      setStatus('Could not load user.');
      return;
    }

    const { data: invigilator, error: invigilatorError } = await supabase
      .from('invigilators')
      .select('id')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (invigilatorError || !invigilator) {
      setStatus('Could not find invigilator.');
      return;
    }

    if (shift.applied) {
      const { error } = await supabase
        .from('shift_applications')
        .delete()
        .eq('shift_slot_id', shift.shiftSlotId)
        .eq('invigilator_id', invigilator.id);

      if (error) {
        setStatus(`Could not remove application: ${error.message}`);
        return;
      }

      setStatus('Application removed.');
    } else {
      const { count: assignedCount, error: assignedCountError } = await supabase
        .from('published_shift_team')
        .select('id', { count: 'exact', head: true })
        .eq('shift_slot_id', shift.shiftSlotId);

      if (assignedCountError) {
        setStatus(`Could not check remaining spaces: ${assignedCountError.message}`);
        return;
      }

      if ((assignedCount ?? 0) >= shift.needed) {
        setStatus('This shift is now full and is no longer available.');
        await loadShifts();
        return;
      }

      const { data: existingApplications, error: existingApplicationsError } =
        await supabase
          .from('shift_applications')
          .select(`
            shift_slot_id,
            shift_slots (
              session_key,
              start_time,
              end_time,
              exam_days (
                exam_date
              )
            )
          `)
          .eq('invigilator_id', invigilator.id)
          .neq('shift_slot_id', shift.shiftSlotId);

      if (existingApplicationsError) {
        setStatus(
          `Could not check existing applications: ${existingApplicationsError.message}`
        );
        return;
      }

      const { data: existingAssignments, error: existingAssignmentsError } =
        await supabase
          .from('shift_assignments')
          .select(`
            shift_slot_id,
            shift_slots (
              session_key,
              start_time,
              end_time,
              exam_days (
                exam_date
              )
            )
          `)
          .eq('invigilator_id', invigilator.id)
          .neq('shift_slot_id', shift.shiftSlotId);

      if (existingAssignmentsError) {
        setStatus(
          `Could not check existing assignments: ${existingAssignmentsError.message}`
        );
        return;
      }

      const hasClashingShift =
        (existingApplications ?? []).some((row: any) => {
          const date = row.shift_slots?.exam_days?.exam_date;
          const session = row.shift_slots?.session_key;
          const fallback = fallbackTimes(session);
          return shiftsOverlap(shift, {
            date,
            startTime: String(row.shift_slots?.start_time ?? fallback.start).slice(0, 5),
            endTime: String(row.shift_slots?.end_time ?? fallback.end).slice(0, 5),
          });
        }) ||
        (existingAssignments ?? []).some((row: any) => {
          const date = row.shift_slots?.exam_days?.exam_date;
          const session = row.shift_slots?.session_key;
          const fallback = fallbackTimes(session);
          return shiftsOverlap(shift, {
            date,
            startTime: String(row.shift_slots?.start_time ?? fallback.start).slice(0, 5),
            endTime: String(row.shift_slots?.end_time ?? fallback.end).slice(0, 5),
          });
        });

      if (hasClashingShift) {
        setStatus(
          'This shift overlaps another shift you have applied for or been assigned.'
        );
        await loadShifts();
        return;
      }

      const { error } = await supabase.from('shift_applications').insert({
        shift_slot_id: shift.shiftSlotId,
        invigilator_id: invigilator.id,
      });

      if (error) {
        setStatus(`Could not save application: ${error.message}`);
        return;
      }

      setStatus('Application saved.');
    }

    await loadShifts();
  }

  const groupedShifts = useMemo(() => {
    const groups = new Map<string, ShiftGroup>();

    for (const shift of shifts) {
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

  if (loading) {
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
        <h1 style={{ margin: 0, fontSize: 32 }}>Available Shifts</h1>
        <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.95 }}>
          Tick any shifts you would like to apply for. Only shifts that still
          need invigilators are shown.
        </p>
      </div>

      {status && (
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
          <p style={{ margin: 0, color: '#555' }}>
            No available shifts right now.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 18,
          }}
        >
          {groupedShifts.map(group => (
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
                  fontWeight: 700,
                  marginBottom: 16,
                  color: '#4c1d95',
                  fontSize: 20,
                }}
              >
                {group.label}
              </div>

              <div style={{ display: 'grid', gap: 16 }}>
                {group.shifts.map(shift => (
                  <div
                    key={shift.shiftSlotId}
                    style={{
                      borderTop: '1px solid #f1f5f9',
                      paddingTop: 14,
                    }}
                  >
                    <div style={{ marginBottom: 6, color: '#333' }}>
                      <strong>Session:</strong>{' '}
                      {shift.displayLabel} ({shift.startTime}–{shift.endTime})
                    </div>

                    <div style={{ marginBottom: 6, color: '#333' }}>
                      <strong>Spaces remaining:</strong>{' '}
                      {Math.max(shift.needed - shift.assignedCount, 0)}
                    </div>

                    <div style={{ marginBottom: 12, color: '#333' }}>
                      <strong>Total needed:</strong> {shift.needed}
                    </div>

                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 10,
                        cursor: 'pointer',
                        fontWeight: 600,
                        color: shift.applied ? '#4c1d95' : '#374151',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={shift.applied}
                        onChange={() => toggleApplication(shift)}
                        style={{ transform: 'scale(1.1)' }}
                      />
                      {shift.applied ? 'Applied' : 'Apply for this shift'}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
