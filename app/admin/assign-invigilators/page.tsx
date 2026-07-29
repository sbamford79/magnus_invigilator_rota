'use client';

import { useContext, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { SeasonContext } from '../SeasonContext';
import { isPastDate } from '../../../lib/dateHelpers';

type Shift = {
  id: string;
  session: string;
  needed: number;
  label: string;
  date: string;
  visibleToInvigilators: boolean;
};

type Invigilator = {
  id: string;
  full_name: string;
  email: string | null;
  active: boolean;
};

type Applicant = {
  invigilator_id: string;
  name: string;
};

const sessionOrder: Record<string, number> = {
  morning: 1,
  mid: 2,
  afternoon: 3,
};

function formatSessionLabel(session: string) {
  if (session === 'mid') return 'Mid';
  return session.charAt(0).toUpperCase() + session.slice(1);
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

export default function AssignInvigilatorsPage() {
  const { currentSeason } = useContext(SeasonContext);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [allInvigilators, setAllInvigilators] = useState<Invigilator[]>([]);
  const [applicants, setApplicants] = useState<Record<string, Applicant[]>>({});
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [assigned, setAssigned] = useState<Record<string, string[]>>({});
  const [manualPick, setManualPick] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [currentSeason?.id]);

  async function loadData() {
    setStatus('');

    if (!currentSeason?.id) return;

    const { data: seasonData } = await supabase
      .from('seasons')
      .select('last_published_at')
      .eq('id', currentSeason.id)
      .single();

    if (seasonData) {
      setLastPublishedAt(seasonData.last_published_at ?? null);
    }

    const { data: invigilatorRows, error: invigilatorError } = await supabase
      .from('invigilators')
      .select('id, full_name, email, active')
      .eq('active', true)
      .order('full_name', { ascending: true });

    if (invigilatorError) {
      setStatus(invigilatorError.message);
      return;
    }

    setAllInvigilators((invigilatorRows ?? []) as Invigilator[]);

    const { data: slots, error: slotsError } = await supabase
      .from('shift_slots')
      .select(`
        id,
        needed,
        session_key,
        published,
        exam_days (
          label,
          exam_date,
          season_id
        )
      `);

    if (slotsError) {
      setStatus(slotsError.message);
      return;
    }

    const mappedShifts: Shift[] = (slots ?? [])
      .filter((slot: any) => slot.exam_days?.season_id === currentSeason.id)
      .map((slot: any) => ({
        id: slot.id,
        session: slot.session_key,
        needed: slot.needed,
        label: slot.exam_days?.label ?? 'Unknown date',
        date: slot.exam_days?.exam_date ?? '',
        visibleToInvigilators: slot.published === true,
      }));

    mappedShifts.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (sessionOrder[a.session] ?? 99) - (sessionOrder[b.session] ?? 99);
    });

    setShifts(mappedShifts);

    const shiftSlotIds = mappedShifts.map(shift => shift.id);

    if (shiftSlotIds.length === 0) {
      setApplicants({});
      setAssigned({});
      setSelected({});
      return;
    }

    const { data: apps, error: appsError } = await supabase
      .from('shift_applications')
      .select(`
        shift_slot_id,
        invigilators (
          id,
          full_name
        )
      `)
      .in('shift_slot_id', shiftSlotIds);

    if (appsError) {
      setStatus(appsError.message);
      return;
    }

    const groupedApplicants: Record<string, Applicant[]> = {};

    (apps ?? []).forEach((app: any) => {
      const slotId = app.shift_slot_id;

      if (!groupedApplicants[slotId]) {
        groupedApplicants[slotId] = [];
      }

      groupedApplicants[slotId].push({
        invigilator_id: app.invigilators.id,
        name: app.invigilators.full_name,
      });
    });

    setApplicants(groupedApplicants);

    const { data: assignmentRows, error: assignmentsError } = await supabase
      .from('shift_assignments')
      .select('shift_slot_id, invigilator_id')
      .in('shift_slot_id', shiftSlotIds);

    if (assignmentsError) {
      setStatus(assignmentsError.message);
      return;
    }

    const assignedMap: Record<string, string[]> = {};

    (assignmentRows ?? []).forEach((row: any) => {
      if (!assignedMap[row.shift_slot_id]) {
        assignedMap[row.shift_slot_id] = [];
      }

      assignedMap[row.shift_slot_id].push(row.invigilator_id);
    });

    setAssigned(assignedMap);
    setSelected(assignedMap);
  }

  async function saveAssignmentsForShift(
    shiftId: string,
    invigilatorIds: string[]
  ) {
    const { error: deleteError } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('shift_slot_id', shiftId);

    if (deleteError) {
      setStatus(deleteError.message);
      await loadData();
      return;
    }

    if (invigilatorIds.length > 0) {
      const { error: insertError } = await supabase
        .from('shift_assignments')
        .insert(
          invigilatorIds.map(id => ({
            shift_slot_id: shiftId,
            invigilator_id: id,
            published: false,
          }))
        );

      if (insertError) {
        setStatus(insertError.message);
        await loadData();
        return;
      }
    }

    setAssigned(prev => ({
      ...prev,
      [shiftId]: invigilatorIds,
    }));

    setStatus('Assignments auto-saved');
  }

  async function toggle(shiftId: string, invigilatorId: string) {
    const current = selected[shiftId] ?? [];
    const exists = current.includes(invigilatorId);
    const shift = shifts.find(s => s.id === shiftId);

    if (!exists && shift && current.length >= shift.needed) {
      setStatus(
        'This shift is already full. Untick someone first if you want to change it.'
      );
      return;
    }

    const updated = exists
      ? current.filter(id => id !== invigilatorId)
      : [...current, invigilatorId];

    setSelected(prev => ({
      ...prev,
      [shiftId]: updated,
    }));

    await saveAssignmentsForShift(shiftId, updated);
  }

  async function addManualInvigilator(shiftId: string) {
    const invigilatorId = manualPick[shiftId];

    if (!invigilatorId) {
      setStatus('Please choose an invigilator to add');
      return;
    }

    const current = selected[shiftId] ?? [];
    const shift = shifts.find(s => s.id === shiftId);

    if (current.includes(invigilatorId)) {
      setStatus('That invigilator is already selected for this shift');
      return;
    }

    if (shift && current.length >= shift.needed) {
      setStatus(
        'This shift is already full. Untick someone first if you want to change it.'
      );
      return;
    }

    const updated = [...current, invigilatorId];

    setSelected(prev => ({
      ...prev,
      [shiftId]: updated,
    }));

    setManualPick(prev => ({
      ...prev,
      [shiftId]: '',
    }));

    await saveAssignmentsForShift(shiftId, updated);
  }

  async function removeManualInvigilator(
    shiftId: string,
    invigilatorId: string
  ) {
    const current = selected[shiftId] ?? [];
    const updated = current.filter(id => id !== invigilatorId);

    setSelected(prev => ({
      ...prev,
      [shiftId]: updated,
    }));

    await saveAssignmentsForShift(shiftId, updated);
  }

  async function publishAll() {
    setStatus('Publishing assignments...');

    const shiftSlotIds = shifts.map(shift => shift.id);

    if (shiftSlotIds.length === 0) {
      setStatus('No assignments to publish');
      return;
    }

    const { data: unpublishedAssignments, error: unpublishedError } =
      await supabase
        .from('shift_assignments')
        .select('id, shift_slot_id, invigilator_id')
        .in('shift_slot_id', shiftSlotIds)
        .eq('published', false);

    if (unpublishedError) {
      setStatus(unpublishedError.message);
      return;
    }

    const { error: publishError } = await supabase
      .from('shift_assignments')
      .update({ published: true })
      .in('shift_slot_id', shiftSlotIds);

    if (publishError) {
      setStatus(publishError.message);
      return;
    }

    const publishTime = new Date().toISOString();

    if (currentSeason?.id) {
      await supabase
        .from('seasons')
        .update({ last_published_at: publishTime })
        .eq('id', currentSeason.id);

      setLastPublishedAt(publishTime);

      const newlyAssignedInvigilatorIds = Array.from(
        new Set(
          (unpublishedAssignments ?? []).map(
            assignment => assignment.invigilator_id
          )
        )
      );

      if (newlyAssignedInvigilatorIds.length > 0) {
        const { error: notificationError } = await supabase
          .from('invigilator_shift_notifications')
          .insert(
            newlyAssignedInvigilatorIds.map(invigilatorId => ({
              season_id: currentSeason.id,
              invigilator_id: invigilatorId,
              notification_type: 'assignments_published',
              title: 'You have new assigned shifts',
              message:
                'New shifts have been assigned to you. Visit My Shifts to review them.',
            }))
          );

        if (notificationError) {
          setStatus(
            `Assignments published, but notifications could not be created: ${notificationError.message}`
          );
          await loadData();
          return;
        }
      }
    }

    setStatus('All assignments published');
    await loadData();
  }

  function isApplicant(shiftId: string, invigilatorId: string) {
    return (applicants[shiftId] ?? []).some(
      app => app.invigilator_id === invigilatorId
    );
  }

  function getInvigilatorName(invigilatorId: string) {
    return (
      allInvigilators.find(inv => inv.id === invigilatorId)?.full_name ??
      'Unknown invigilator'
    );
  }

  const sortedShifts = [...shifts].sort((a, b) => {
    const aAssigned = assigned[a.id]?.length ?? 0;
    const bAssigned = assigned[b.id]?.length ?? 0;

    const aRemaining = Math.max(a.needed - aAssigned, 0);
    const bRemaining = Math.max(b.needed - bAssigned, 0);

    const aIsPast = isPastDate(a.date);
    const bIsPast = isPastDate(b.date);
    const aNeedsCurrentCover = aRemaining > 0 && !aIsPast;
    const bNeedsCurrentCover = bRemaining > 0 && !bIsPast;

    if (aNeedsCurrentCover !== bNeedsCurrentCover) {
      return aNeedsCurrentCover ? -1 : 1;
    }

    if (aIsPast !== bIsPast) {
      return aIsPast ? 1 : -1;
    }

    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }

    return (sessionOrder[a.session] ?? 99) - (sessionOrder[b.session] ?? 99);
  });

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
        <h1 style={{ margin: 0, fontSize: 32 }}>Assign Invigilators</h1>
        <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.95 }}>
          Assign invigilators before or after publishing. Private shifts stay
          hidden from invigilators until you publish them.
        </p>
      </div>

      <div
        style={{
          marginBottom: 16,
          padding: 14,
          background: 'white',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
        }}
      >
        <strong>Last published:</strong> {formatDateTime(lastPublishedAt)}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={publishAll}
          style={{
            background: '#4c1d95',
            color: 'white',
            border: 'none',
            padding: '10px 14px',
            borderRadius: 10,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Publish assignments
        </button>

        {status && (
          <span
            style={{
              color: '#4c1d95',
              fontWeight: 700,
              background: '#f5f3ff',
              border: '1px solid #ddd6fe',
              borderRadius: 10,
              padding: '9px 12px',
            }}
          >
            {status}
          </span>
        )}
      </div>

      {sortedShifts.length === 0 ? (
        <div
          style={{
            background: 'white',
            borderRadius: 14,
            padding: 24,
            border: '1px solid #e5e7eb',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          }}
        >
          <p style={{ margin: 0 }}>No shifts set up yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {sortedShifts.map(shift => {
            const selectedIds = selected[shift.id] ?? [];
            const limitReached = selectedIds.length >= shift.needed;
            const assignedCount = assigned[shift.id]?.length ?? 0;
            const remaining = Math.max(shift.needed - assignedCount, 0);
            const applicantRows = applicants[shift.id] ?? [];
            const manualSelectedIds = selectedIds.filter(
              id => !isApplicant(shift.id, id)
            );

            return (
              <div
                key={shift.id}
                style={{
                  background: 'white',
                  border:
                    remaining > 0 ? '2px solid #fde68a' : '1px solid #e5e7eb',
                  padding: 20,
                  borderRadius: 16,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                }}
              >
                <h3 style={{ marginTop: 0, color: '#4c1d95' }}>
                  {shift.label} - {formatSessionLabel(shift.session)} (
                  {assignedCount}/{shift.needed} assigned)
                </h3>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginBottom: 14,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '5px 9px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                      background: shift.visibleToInvigilators
                        ? '#dcfce7'
                        : '#f3f4f6',
                      color: shift.visibleToInvigilators ? '#166534' : '#4b5563',
                    }}
                  >
                    {shift.visibleToInvigilators
                      ? 'Visible on Available Shifts'
                      : 'Hidden from Available Shifts'}
                  </span>

                  <span
                    style={{
                      display: 'inline-block',
                      padding: '5px 9px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                      background: remaining > 0 ? '#fef3c7' : '#dcfce7',
                      color: remaining > 0 ? '#92400e' : '#166534',
                    }}
                  >
                    {remaining > 0
                      ? `${remaining} space${remaining === 1 ? '' : 's'} left`
                      : 'Full'}
                  </span>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <strong>Applicants</strong>

                  {applicantRows.length === 0 ? (
                    <p style={{ color: '#6b7280' }}>No applicants yet</p>
                  ) : (
                    <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                      {applicantRows.map(app => {
                        const isChecked = selectedIds.includes(
                          app.invigilator_id
                        );
                        const isDisabled = !isChecked && limitReached;

                        return (
                          <label
                            key={app.invigilator_id}
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                              opacity: isDisabled ? 0.4 : 1,
                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isDisabled}
                              onChange={() =>
                                toggle(shift.id, app.invigilator_id)
                              }
                            />
                            {app.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {manualSelectedIds.length > 0 && (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: 12,
                      background: '#f5f3ff',
                      border: '1px solid #ddd6fe',
                      borderRadius: 12,
                    }}
                  >
                    <strong style={{ color: '#4c1d95' }}>
                      Manually added
                    </strong>

                    <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                      {manualSelectedIds.map(id => (
                        <div
                          key={id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 10,
                            background: 'white',
                            borderRadius: 10,
                            padding: '8px 10px',
                          }}
                        >
                          <span>{getInvigilatorName(id)}</span>

                          <button
                            onClick={() => removeManualInvigilator(shift.id, id)}
                            style={{
                              background: '#fee2e2',
                              color: '#991b1b',
                              border: '1px solid #fecaca',
                              borderRadius: 8,
                              padding: '5px 8px',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    borderTop: '1px solid #f1f5f9',
                    paddingTop: 14,
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <strong>Add invigilator manually:</strong>

                  <select
                    value={manualPick[shift.id] ?? ''}
                    onChange={e =>
                      setManualPick(prev => ({
                        ...prev,
                        [shift.id]: e.target.value,
                      }))
                    }
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      minWidth: 220,
                    }}
                  >
                    <option value="">Choose invigilator...</option>
                    {allInvigilators
                      .filter(inv => !selectedIds.includes(inv.id))
                      .map(inv => (
                        <option key={inv.id} value={inv.id}>
                          {inv.full_name}
                        </option>
                      ))}
                  </select>

                  <button
                    onClick={() => addManualInvigilator(shift.id)}
                    style={{
                      background: '#4c1d95',
                      color: 'white',
                      border: 'none',
                      padding: '9px 12px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
