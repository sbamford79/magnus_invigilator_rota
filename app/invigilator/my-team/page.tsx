'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { toYMD } from '../../../lib/dateHelpers';

type TeamShift = {
  shiftSlotId: string;
  label: string;
  session: string;
  teamMembers: string[];
};

function formatSession(session: string) {
  if (session === 'mid') return 'Mid';
  return session.charAt(0).toUpperCase() + session.slice(1);
}

export default function MyTeamPage() {
  const [teamShifts, setTeamShifts] = useState<TeamShift[]>([]);
  const [status, setStatus] = useState('Loading...');

  useEffect(() => {
    loadTeamToday();
  }, []);

  async function loadTeamToday() {
    setStatus('');

    const today = toYMD(new Date());

    // 1. Get logged-in user
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      setStatus('Not logged in');
      return;
    }

    // 2. Get invigilator record
    const { data: invigilator, error: invigilatorError } = await supabase
      .from('invigilators')
      .select('id')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (invigilatorError || !invigilator) {
      setStatus('No invigilator record found');
      return;
    }

    const myInvigilatorId = invigilator.id;

    // 3. Get today's exam days
    const { data: todayDays, error: todayDaysError } = await supabase
      .from('exam_days')
      .select('id, exam_date, label')
      .eq('exam_date', today);

    if (todayDaysError) {
      setStatus(todayDaysError.message);
      return;
    }

    if (!todayDays || todayDays.length === 0) {
      setTeamShifts([]);
      return;
    }

    const todayDayIds = todayDays.map(day => day.id);

    // 4. Get shift slots for today
    const { data: todaySlots, error: todaySlotsError } = await supabase
      .from('shift_slots')
      .select('id, exam_day_id, session_key')
      .in('exam_day_id', todayDayIds);

    if (todaySlotsError) {
      setStatus(todaySlotsError.message);
      return;
    }

    if (!todaySlots || todaySlots.length === 0) {
      setTeamShifts([]);
      return;
    }

    const todaySlotIds = todaySlots.map(slot => slot.id);

    // 5. Get MY published assignments for today's slots
    const { data: myAssignments, error: myAssignmentsError } = await supabase
      .from('shift_assignments')
      .select('id, shift_slot_id')
      .eq('invigilator_id', myInvigilatorId)
      .eq('published', true)
      .in('shift_slot_id', todaySlotIds);

    if (myAssignmentsError) {
      setStatus(myAssignmentsError.message);
      return;
    }

    if (!myAssignments || myAssignments.length === 0) {
      setTeamShifts([]);
      return;
    }

    const myShiftSlotIds = myAssignments.map(a => a.shift_slot_id);

    // 6. Get ALL published assignments on those same shifts
    const { data: teamAssignments, error: teamAssignmentsError } = await supabase
      .from('shift_assignments')
      .select('shift_slot_id, invigilator_id')
      .eq('published', true)
      .in('shift_slot_id', myShiftSlotIds);

    if (teamAssignmentsError) {
      setStatus(teamAssignmentsError.message);
      return;
    }

    const allInvigilatorIds = Array.from(
  new Set((teamAssignments ?? []).map(a => a.invigilator_id))
);

    if (allInvigilatorIds.length === 0) {
      setTeamShifts([]);
      return;
    }

    // 7. Get invigilator names
    const { data: invigilators, error: invigilatorsError } = await supabase
      .from('invigilators')
      .select('id, full_name')
      .in('id', allInvigilatorIds);

    if (invigilatorsError) {
      setStatus(invigilatorsError.message);
      return;
    }

    // 8. Build result grouped by today's shifts, excluding current invigilator
    const mapped: TeamShift[] = myShiftSlotIds.map(shiftSlotId => {
      const slot = todaySlots.find(s => s.id === shiftSlotId);
      const day = todayDays.find(d => d.id === slot?.exam_day_id);

      const otherMembers = (teamAssignments ?? [])
        .filter(
          assignment =>
            assignment.shift_slot_id === shiftSlotId &&
            assignment.invigilator_id !== myInvigilatorId
        )
        .map(assignment => {
          const person = (invigilators ?? []).find(
            inv => inv.id === assignment.invigilator_id
          );
          return person?.full_name ?? 'Unknown invigilator';
        });

      return {
        shiftSlotId,
        label: day?.label ?? 'Today',
        session: slot?.session_key ?? '',
        teamMembers: otherMembers,
      };
    });

    setTeamShifts(mapped);
  }

  if (status === 'Loading...') {
    return <div style={{ padding: 24 }}>Loading team...</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <h1>My Team Today</h1>

      {status && <p>{status}</p>}

      {teamShifts.length === 0 ? (
        <p>You do not have any team shifts showing for today.</p>
      ) : (
        teamShifts.map(shift => (
          <div
            key={shift.shiftSlotId}
            style={{
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
              background: '#fff',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              {shift.label}
            </div>

            <div style={{ marginBottom: 10 }}>
              <strong>Session:</strong> {formatSession(shift.session)}
            </div>

            <div>
              <strong>Other invigilators:</strong>
            </div>

            {shift.teamMembers.length === 0 ? (
              <p style={{ marginTop: 8 }}>No other invigilators assigned yet.</p>
            ) : (
              <ul style={{ marginTop: 8 }}>
                {shift.teamMembers.map(name => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}
    </div>
  );
}
