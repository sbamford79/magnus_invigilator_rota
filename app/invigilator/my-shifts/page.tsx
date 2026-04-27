'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type SessionKey = 'morning' | 'mid' | 'afternoon';

type MyShift = {
  assignmentId: string;
  shiftSlotId: string;
  date: string;
  label: string;
  session: SessionKey;
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

function daysUntil(dateStr: string) {
  const today = new Date();
  const target = new Date(dateStr);

  const diff = target.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

const sessionOrder: Record<SessionKey, number> = {
  morning: 1,
  mid: 2,
  afternoon: 3,
};

export default function MyShiftsPage() {
  const [shifts, setShifts] = useState<MyShift[]>([]);
  const [status, setStatus] = useState('Loading...');

  useEffect(() => {
    loadShifts();
  }, []);

  async function loadShifts() {
    setStatus('');

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setStatus('Not logged in');
      return;
    }

    const { data: invigilator } = await supabase
      .from('invigilators')
      .select('id')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (!invigilator) {
      setStatus('No invigilator record');
      return;
    }

    const { data, error } = await supabase
      .from('shift_assignments')
      .select(`
        id,
        shift_slot_id,
        shift_slots (
          session_key,
          exam_days (
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
        session: row.shift_slots?.session_key,
        date: row.shift_slots?.exam_days?.exam_date,
        label: row.shift_slots?.exam_days?.label,
      }))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (sessionOrder[a.session] ?? 99) - (sessionOrder[b.session] ?? 99);
      });

    setShifts(mapped);
  }

  async function releaseShift(assignmentId: string, shiftSlotId: string) {
    const confirmRelease = window.confirm(
      'Release this shift? It will return to the available shifts list and your application will be removed.'
    );
    if (!confirmRelease) return;

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setStatus('Not logged in');
      return;
    }

    const { data: invigilator } = await supabase
      .from('invigilators')
      .select('id')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (!invigilator) {
      setStatus('No invigilator record');
      return;
    }

    const { error: assignmentError } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('id', assignmentId);

    if (assignmentError) {
      setStatus(assignmentError.message);
      return;
    }

    const { error: applicationError } = await supabase
      .from('shift_applications')
      .delete()
      .eq('shift_slot_id', shiftSlotId)
      .eq('invigilator_id', invigilator.id);

    if (applicationError) {
      setStatus(applicationError.message);
      return;
    }

    setStatus('Shift released');
    loadShifts();
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
          <p style={{ margin: 0, color: '#555' }}>No assigned shifts.</p>
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
                  {group.shifts.map(shift => (
                    <div
                      key={shift.assignmentId}
                      style={{
                        borderTop: '1px solid #f1f5f9',
                        paddingTop: 10,
                      }}
                    >
                      <div style={{ marginBottom: 8 }}>
                        <strong>Session:</strong> {formatSession(shift.session)}
                      </div>

                      {canRelease ? (
                        <button
                          onClick={() =>
                            releaseShift(shift.assignmentId, shift.shiftSlotId)
                          }
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
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}