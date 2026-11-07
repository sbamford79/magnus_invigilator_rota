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
  startTime: string | null;
  endTime: string | null;
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

type PendingRemoval = {
  shiftId: string;
  invigilatorId: string;
  updatedSelection: string[];
};

const sessionOrder: Record<string, number> = {
  morning: 1,
  mid: 2,
  afternoon: 3,
};

const sortToggleButton: React.CSSProperties = {
  border: 'none',
  borderRadius: 7,
  padding: '7px 10px',
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 700,
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
  const [publishedAssignments, setPublishedAssignments] = useState<
    Record<string, string[]>
  >({});
  const [manualPick, setManualPick] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'unfilled' | 'date'>('unfilled');
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(
    null
  );

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
        start_time,
        end_time,
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
        startTime: slot.start_time ?? null,
        endTime: slot.end_time ?? null,
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
      setPublishedAssignments({});
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
      .select('shift_slot_id, invigilator_id, published')
      .in('shift_slot_id', shiftSlotIds);

    if (assignmentsError) {
      setStatus(assignmentsError.message);
      return;
    }

    const assignedMap: Record<string, string[]> = {};
    const publishedAssignmentMap: Record<string, string[]> = {};

    (assignmentRows ?? []).forEach((row: any) => {
      if (!assignedMap[row.shift_slot_id]) {
        assignedMap[row.shift_slot_id] = [];
      }

      assignedMap[row.shift_slot_id].push(row.invigilator_id);

      if (row.published) {
        if (!publishedAssignmentMap[row.shift_slot_id]) {
          publishedAssignmentMap[row.shift_slot_id] = [];
        }
        publishedAssignmentMap[row.shift_slot_id].push(row.invigilator_id);
      }
    });

    setAssigned(assignedMap);
    setPublishedAssignments(publishedAssignmentMap);
    setSelected(assignedMap);
  }

  async function saveAssignmentsForShift(
    shiftId: string,
    invigilatorIds: string[],
    removeAvailabilityFor?: string
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

    if (removeAvailabilityFor) {
      const { error: applicationError } = await supabase
        .from('shift_applications')
        .delete()
        .eq('shift_slot_id', shiftId)
        .eq('invigilator_id', removeAvailabilityFor);

      if (applicationError) {
        setStatus(applicationError.message);
        await loadData();
        return;
      }
    }

    setAssigned(prev => ({
      ...prev,
      [shiftId]: invigilatorIds,
    }));

    setPublishedAssignments(prev => ({
      ...prev,
      [shiftId]: [],
    }));

    setStatus(
      removeAvailabilityFor
        ? 'Assignment and availability removed'
        : 'Assignments auto-saved'
    );
  }

  function requestRemoval(
    shiftId: string,
    invigilatorId: string,
    updatedSelection: string[]
  ) {
    const wasPublished = (publishedAssignments[shiftId] ?? []).includes(
      invigilatorId
    );

    if (wasPublished) {
      setPendingRemoval({ shiftId, invigilatorId, updatedSelection });
      return;
    }

    setSelected(prev => ({ ...prev, [shiftId]: updatedSelection }));
    void saveAssignmentsForShift(shiftId, updatedSelection);
  }

  async function confirmRemoval(removeAvailability: boolean) {
    if (!pendingRemoval) return;

    const { shiftId, invigilatorId, updatedSelection } = pendingRemoval;
    setPendingRemoval(null);
    setSelected(prev => ({ ...prev, [shiftId]: updatedSelection }));
    await saveAssignmentsForShift(
      shiftId,
      updatedSelection,
      removeAvailability ? invigilatorId : undefined
    );
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

    if (!exists && isAssignedToOverlappingShift(shiftId, invigilatorId)) {
      setStatus(
        'This invigilator is already assigned to an overlapping shift.'
      );
      return;
    }

    const updated = exists
      ? current.filter(id => id !== invigilatorId)
      : [...current, invigilatorId];

    if (exists) {
      requestRemoval(shiftId, invigilatorId, updated);
      return;
    }

    setSelected(prev => ({ ...prev, [shiftId]: updated }));
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

    if (isAssignedToOverlappingShift(shiftId, invigilatorId)) {
      setStatus(
        'This invigilator is already assigned to an overlapping shift.'
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

    requestRemoval(shiftId, invigilatorId, updated);
  }

  async function publishAll() {
    setStatus('Publishing assignments...');

    const shiftSlotIds = shifts.map(shift => shift.id);

    if (shiftSlotIds.length === 0) {
      setStatus('No assignments to publish');
      return;
    }

    if (!currentSeason?.id) {
      setStatus('Please select a season before publishing assignments');
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

    const { data: currentAssignments, error: currentAssignmentsError } =
      await supabase
        .from('shift_assignments')
        .select('shift_slot_id, invigilator_id')
        .in('shift_slot_id', shiftSlotIds);

    if (currentAssignmentsError) {
      setStatus(currentAssignmentsError.message);
      return;
    }

    const { data: previousAssignments, error: previousAssignmentsError } =
      await supabase
        .from('published_shift_assignments')
        .select('shift_slot_id, invigilator_id')
        .eq('season_id', currentSeason.id);

    if (previousAssignmentsError) {
      setStatus(
        `Unable to check previous allocations: ${previousAssignmentsError.message}`
      );
      return;
    }

    const currentAssignmentKeys = new Set(
      (currentAssignments ?? []).map(
        assignment => `${assignment.shift_slot_id}:${assignment.invigilator_id}`
      )
    );
    const previousAssignmentKeys = new Set(
      (previousAssignments ?? []).map(
        assignment => `${assignment.shift_slot_id}:${assignment.invigilator_id}`
      )
    );
    const affectedInvigilatorIds = new Set<string>();

    (currentAssignments ?? []).forEach(assignment => {
      const key = `${assignment.shift_slot_id}:${assignment.invigilator_id}`;
      if (!previousAssignmentKeys.has(key)) {
        affectedInvigilatorIds.add(assignment.invigilator_id);
      }
    });

    (previousAssignments ?? []).forEach(assignment => {
      const key = `${assignment.shift_slot_id}:${assignment.invigilator_id}`;
      if (!currentAssignmentKeys.has(key)) {
        affectedInvigilatorIds.add(assignment.invigilator_id);
      }
    });

    const { error: publishError } = await supabase
      .from('shift_assignments')
      .update({ published: true })
      .in('shift_slot_id', shiftSlotIds);

    if (publishError) {
      setStatus(publishError.message);
      return;
    }

    const publishTime = new Date().toISOString();

    const { error: clearSnapshotError } = await supabase
      .from('published_shift_assignments')
      .delete()
      .eq('season_id', currentSeason.id);

    if (clearSnapshotError) {
      setStatus(`Assignments published, but the rota snapshot could not be saved: ${clearSnapshotError.message}`);
      return;
    }

    if ((currentAssignments ?? []).length > 0) {
      const { error: saveSnapshotError } = await supabase
        .from('published_shift_assignments')
        .insert(
          currentAssignments.map(assignment => ({
            season_id: currentSeason.id,
            shift_slot_id: assignment.shift_slot_id,
            invigilator_id: assignment.invigilator_id,
          }))
        );

      if (saveSnapshotError) {
        setStatus(`Assignments published, but the rota snapshot could not be saved: ${saveSnapshotError.message}`);
        return;
      }
    }

    if (affectedInvigilatorIds.size > 0) {
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert(
          Array.from(affectedInvigilatorIds).map(invigilatorId => ({
            invigilator_id: invigilatorId,
            title: 'Your rota has changed',
            message:
              'Your shift allocation has been updated. Please check My Shifts for the latest rota.',
            is_read: false,
          }))
        );

      if (notificationError) {
        setStatus(`Assignments published, but notifications could not be created: ${notificationError.message}`);
        return;
      }
    }

    await supabase
      .from('seasons')
      .update({ last_published_at: publishTime })
      .eq('id', currentSeason.id);

    setLastPublishedAt(publishTime);
    setStatus(
      affectedInvigilatorIds.size > 0
        ? `Assignments published and ${affectedInvigilatorIds.size} invigilator${affectedInvigilatorIds.size === 1 ? '' : 's'} notified`
        : 'Assignments published — no allocation changes to notify'
    );
    await loadData();
  }

  function isApplicant(shiftId: string, invigilatorId: string) {
    return (applicants[shiftId] ?? []).some(
      app => app.invigilator_id === invigilatorId
    );
  }

  function shiftsOverlap(first: Shift, second: Shift) {
    if (
      first.id === second.id ||
      first.date !== second.date ||
      !first.startTime ||
      !first.endTime ||
      !second.startTime ||
      !second.endTime
    ) {
      return false;
    }

    return first.startTime < second.endTime && second.startTime < first.endTime;
  }

  function isAssignedToOverlappingShift(
    shiftId: string,
    invigilatorId: string
  ) {
    const shift = shifts.find(item => item.id === shiftId);

    return Boolean(
      shift &&
        shifts.some(
          otherShift =>
            shiftsOverlap(shift, otherShift) &&
            (selected[otherShift.id] ?? []).includes(invigilatorId)
        )
    );
  }

  function getInvigilatorName(invigilatorId: string) {
    return (
      allInvigilators.find(inv => inv.id === invigilatorId)?.full_name ??
      'Unknown invigilator'
    );
  }

  const sortedShifts = [...shifts].sort((a, b) => {
    if (sortMode === 'date') {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (sessionOrder[a.session] ?? 99) - (sessionOrder[b.session] ?? 99);
    }

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
          Assign applicants or manually add invigilators.
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontWeight: 700,
          }}
        >
          <span>Sort shifts by</span>
          <div
            style={{
              display: 'flex',
              padding: 3,
              borderRadius: 10,
              border: '1px solid #c4b5fd',
              background: 'white',
            }}
          >
            <button
              onClick={() => setSortMode('unfilled')}
              aria-pressed={sortMode === 'unfilled'}
              style={{
                ...sortToggleButton,
                background: sortMode === 'unfilled' ? '#4c1d95' : 'transparent',
                color: sortMode === 'unfilled' ? 'white' : '#4c1d95',
              }}
            >
              Unfilled first
            </button>
            <button
              onClick={() => setSortMode('date')}
              aria-pressed={sortMode === 'date'}
              style={{
                ...sortToggleButton,
                background: sortMode === 'date' ? '#4c1d95' : 'transparent',
                color: sortMode === 'date' ? 'white' : '#4c1d95',
              }}
            >
              Date order
            </button>
          </div>
        </div>

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
                    remaining > 0 ? '3px solid #dc2626' : '1px solid #e5e7eb',
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
                        const hasOverlappingAssignment =
                          !isChecked &&
                          isAssignedToOverlappingShift(
                            shift.id,
                            app.invigilator_id
                          );
                        const isDisabled =
                          !isChecked &&
                          (limitReached || hasOverlappingAssignment);

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
                            <span>
                              {app.name}
                              {hasOverlappingAssignment && (
                                <small
                                  style={{
                                    display: 'block',
                                    color: '#6b7280',
                                    marginTop: 2,
                                  }}
                                >
                                  Already assigned to an overlapping shift
                                </small>
                              )}
                            </span>
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
                      .filter(
                        inv =>
                          !selectedIds.includes(inv.id) &&
                          !isAssignedToOverlappingShift(shift.id, inv.id)
                      )
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

      {pendingRemoval && (
        <div style={modalBackdrop} role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="removal-dialog-title"
            style={modalCard}
          >
            <h2 id="removal-dialog-title" style={{ marginTop: 0, color: '#4c1d95' }}>
              Remove {getInvigilatorName(pendingRemoval.invigilatorId)}?
            </h2>
            <p style={{ color: '#374151', lineHeight: 1.5 }}>
              This assignment has already been published. Would you like to keep
              this invigilator available for the shift, or remove their
              availability completely?
            </p>
            <p style={{ color: '#6b7280', lineHeight: 1.5, marginBottom: 20 }}>
              Removing availability means they will no longer appear as an
              applicant and would need to reapply or be added manually again.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => confirmRemoval(false)}
                style={secondaryModalButton}
              >
                Keep available
              </button>
              <button
                onClick={() => confirmRemoval(true)}
                style={dangerModalButton}
              >
                Remove availability
              </button>
              <button
                onClick={() => setPendingRemoval(null)}
                style={cancelModalButton}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const modalBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  padding: 20,
  background: 'rgba(17, 24, 39, 0.45)',
  zIndex: 20,
};

const modalCard: React.CSSProperties = {
  width: 'min(100%, 520px)',
  background: 'white',
  borderRadius: 16,
  padding: 24,
  boxShadow: '0 18px 40px rgba(0,0,0,0.25)',
};

const secondaryModalButton: React.CSSProperties = {
  background: '#4c1d95',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '10px 12px',
  cursor: 'pointer',
  fontWeight: 700,
};

const dangerModalButton: React.CSSProperties = {
  background: '#991b1b',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '10px 12px',
  cursor: 'pointer',
  fontWeight: 700,
};

const cancelModalButton: React.CSSProperties = {
  background: 'white',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '10px 12px',
  cursor: 'pointer',
  fontWeight: 700,
};
