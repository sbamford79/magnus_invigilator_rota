'use client';

import { useContext, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { SeasonContext } from '../SeasonContext';
import { formatLongDate, parseLocalDate, toYMD } from '../../../lib/dateHelpers';

type SessionKey = 'morning' | 'mid' | 'afternoon';

type DaySession = {
  enabled: boolean;
  needed: number;
};

type ExamDay = {
  id: string;
  date: string;
  label: string;
  sessions: Record<SessionKey, DaySession>;
};

type StaffingRules = {
  candidatesPerInvigilator: number;
  additionalInvigilatorsPerRoom: number;
  minimumInvigilatorsPerRoom: number;
  singleCandidateNeedsOne: boolean;
};

type RoomStaffingRules = Record<string, StaffingRules | null>;

const defaultStaffingRules: StaffingRules = {
  candidatesPerInvigilator: 30,
  additionalInvigilatorsPerRoom: 1,
  minimumInvigilatorsPerRoom: 1,
  singleCandidateNeedsOne: true,
};

function calculateInvigilatorsNeeded(
  candidateCount: number,
  rules: StaffingRules
) {
  if (candidateCount < 1) return 0;
  if (candidateCount === 1 && rules.singleCandidateNeedsOne) return 1;

  return Math.max(
    rules.minimumInvigilatorsPerRoom,
    Math.ceil(candidateCount / rules.candidatesPerInvigilator) +
      rules.additionalInvigilatorsPerRoom
  );
}

function formatDateLabel(dateStr: string) {
  return formatLongDate(dateStr);
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

function isWeekend(d: Date) {
  return d.getDay() === 0 || d.getDay() === 6;
}

function getDatesInRange(from: string, to: string, skipWeekends: boolean) {
  const result: string[] = [];
  const current = parseLocalDate(from);
  const end = parseLocalDate(to);

  while (current <= end) {
    if (!skipWeekends || !isWeekend(current)) result.push(toYMD(current));
    current.setDate(current.getDate() + 1);
  }

  return result;
}

function getWeekFromDate(dateStr: string) {
  const base = parseLocalDate(dateStr);
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + diff);

  const dates: string[] = [];

  for (let i = 0; i < 5; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dates.push(toYMD(d));
  }

  return dates;
}

function createLocalDay(d: string): Omit<ExamDay, 'id'> {
  return {
    date: d,
    label: formatDateLabel(d),
    sessions: {
      morning: { enabled: false, needed: 0 },
      mid: { enabled: false, needed: 0 },
      afternoon: { enabled: false, needed: 0 },
    },
  };
}

function sessionLabel(session: SessionKey) {
  if (session === 'mid') return 'Mid';
  return session.charAt(0).toUpperCase() + session.slice(1);
}

export default function ShiftSetupPage() {
  const { currentSeason } = useContext(SeasonContext);

  const [days, setDays] = useState<ExamDay[]>([]);
  const [singleDate, setSingleDate] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [skipWeekends, setSkipWeekends] = useState(true);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [uploadingRooms, setUploadingRooms] = useState(false);
  const [staffingRules, setStaffingRules] =
    useState<StaffingRules>(defaultStaffingRules);
  const [savingRules, setSavingRules] = useState(false);
  const [identifiedRooms, setIdentifiedRooms] = useState<string[]>([]);
  const [roomStaffingRules, setRoomStaffingRules] =
    useState<RoomStaffingRules>({});
  const [savingRoomRules, setSavingRoomRules] = useState(false);

  useEffect(() => {
    if (currentSeason?.id) {
      loadDays();
      loadSeasonPublishInfo();
      loadStaffingRules();
      loadRoomStaffingRules();
    }
  }, [currentSeason?.id]);

  async function loadStaffingRules() {
    if (!currentSeason?.id) return;

    const { data, error } = await supabase
      .from('staffing_rules')
      .select(
        'candidates_per_invigilator, additional_invigilators_per_room, minimum_invigilators_per_room, single_candidate_needs_one'
      )
      .eq('season_id', currentSeason.id)
      .maybeSingle();

    if (error) {
      setStatus(error.message);
      return;
    }

    setStaffingRules(
      data
        ? {
            candidatesPerInvigilator: data.candidates_per_invigilator,
            additionalInvigilatorsPerRoom:
              data.additional_invigilators_per_room,
            minimumInvigilatorsPerRoom: data.minimum_invigilators_per_room,
            singleCandidateNeedsOne:
              data.single_candidate_needs_one ?? true,
          }
        : defaultStaffingRules
    );
  }

  function updateStaffingRule(key: keyof StaffingRules, value: string) {
    setStaffingRules(current => ({
      ...current,
      [key]: value === '' ? 0 : Number(value),
    }));
  }

  async function saveStaffingRules() {
    if (!currentSeason?.id) return;

    if (
      !Number.isInteger(staffingRules.candidatesPerInvigilator) ||
      staffingRules.candidatesPerInvigilator < 1 ||
      !Number.isInteger(staffingRules.additionalInvigilatorsPerRoom) ||
      staffingRules.additionalInvigilatorsPerRoom < 0 ||
      !Number.isInteger(staffingRules.minimumInvigilatorsPerRoom) ||
      staffingRules.minimumInvigilatorsPerRoom < 1
    ) {
      setStatus('Enter whole numbers. Candidates and minimum must be at least 1.');
      return;
    }

    setSavingRules(true);
    setStatus('Saving staffing rules...');

    const { error } = await supabase.from('staffing_rules').upsert(
      {
        season_id: currentSeason.id,
        candidates_per_invigilator:
          staffingRules.candidatesPerInvigilator,
        additional_invigilators_per_room:
          staffingRules.additionalInvigilatorsPerRoom,
        minimum_invigilators_per_room:
          staffingRules.minimumInvigilatorsPerRoom,
        single_candidate_needs_one:
          staffingRules.singleCandidateNeedsOne,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'season_id' }
    );

    setSavingRules(false);
    setStatus(error ? error.message : 'Staffing rules saved.');
  }

  async function loadRoomStaffingRules() {
    if (!currentSeason?.id) return;

    const [{ data: roomRows, error: roomsError }, { data: ruleRows, error: rulesError }] =
      await Promise.all([
        supabase
          .from('room_requirements')
          .select('room_name')
          .eq('season_id', currentSeason.id),
        supabase
          .from('staffing_room_rules')
          .select(
            'room_name, candidates_per_invigilator, additional_invigilators_per_room, minimum_invigilators_per_room, single_candidate_needs_one'
          )
          .eq('season_id', currentSeason.id),
      ]);

    if (roomsError) {
      setStatus(roomsError.message);
      return;
    }

    const roomNames = Array.from(
      new Set(
        (roomRows ?? [])
          .map(row => row.room_name?.trim())
          .filter((name): name is string => Boolean(name))
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const loadedRules: RoomStaffingRules = {};
    roomNames.forEach(roomName => {
      loadedRules[roomName] = null;
    });

    (rulesError ? [] : ruleRows ?? []).forEach(rule => {
      if (!roomNames.includes(rule.room_name)) return;

      loadedRules[rule.room_name] = {
        candidatesPerInvigilator: rule.candidates_per_invigilator,
        additionalInvigilatorsPerRoom:
          rule.additional_invigilators_per_room,
        minimumInvigilatorsPerRoom: rule.minimum_invigilators_per_room,
        singleCandidateNeedsOne:
          rule.single_candidate_needs_one ?? true,
      };
    });

    setIdentifiedRooms(roomNames);
    setRoomStaffingRules(loadedRules);
  }

  function setRoomOverride(roomName: string, enabled: boolean) {
    setRoomStaffingRules(current => ({
      ...current,
      [roomName]: enabled ? { ...staffingRules } : null,
    }));
  }

  function updateRoomStaffingRule(
    roomName: string,
    key: keyof StaffingRules,
    value: string
  ) {
    setRoomStaffingRules(current => ({
      ...current,
      [roomName]: {
        ...(current[roomName] ?? staffingRules),
        [key]: value === '' ? 0 : Number(value),
      },
    }));
  }

  async function saveRoomStaffingRules() {
    if (!currentSeason?.id) return;

    const overrides = Object.entries(roomStaffingRules).filter(
      (entry): entry is [string, StaffingRules] => entry[1] !== null
    );

    const invalidRule = overrides.some(
      ([, rules]) =>
        !Number.isInteger(rules.candidatesPerInvigilator) ||
        rules.candidatesPerInvigilator < 1 ||
        !Number.isInteger(rules.additionalInvigilatorsPerRoom) ||
        rules.additionalInvigilatorsPerRoom < 0 ||
        !Number.isInteger(rules.minimumInvigilatorsPerRoom) ||
        rules.minimumInvigilatorsPerRoom < 1
    );

    if (invalidRule) {
      setStatus('Enter valid whole numbers for every room override.');
      return;
    }

    setSavingRoomRules(true);
    setStatus('Saving room rules...');

    const { error: deleteError } = await supabase
      .from('staffing_room_rules')
      .delete()
      .eq('season_id', currentSeason.id);

    if (deleteError) {
      setSavingRoomRules(false);
      setStatus(deleteError.message);
      return;
    }

    if (overrides.length > 0) {
      const { error: insertError } = await supabase
        .from('staffing_room_rules')
        .insert(
          overrides.map(([roomName, rules]) => ({
            season_id: currentSeason.id,
            room_name: roomName,
            candidates_per_invigilator: rules.candidatesPerInvigilator,
            additional_invigilators_per_room:
              rules.additionalInvigilatorsPerRoom,
            minimum_invigilators_per_room: rules.minimumInvigilatorsPerRoom,
            single_candidate_needs_one: rules.singleCandidateNeedsOne,
          }))
        );

      if (insertError) {
        setSavingRoomRules(false);
        setStatus(insertError.message);
        return;
      }
    }

    setSavingRoomRules(false);
    setStatus('Room staffing rules saved.');
  }

  async function loadSeasonPublishInfo() {
    if (!currentSeason?.id) return;

    const { data } = await supabase
      .from('seasons')
      .select('last_published_at')
      .eq('id', currentSeason.id)
      .single();

    setLastPublishedAt(data?.last_published_at ?? null);
  }

  async function loadDays() {
    if (!currentSeason?.id) return;

    setLoading(true);
    setStatus('');

    const { data: dayRows, error: dayError } = await supabase
      .from('exam_days')
      .select('id, exam_date, label')
      .eq('season_id', currentSeason.id)
      .order('exam_date', { ascending: true });

    if (dayError) {
      setStatus(dayError.message);
      setLoading(false);
      return;
    }

    const dayIds = (dayRows ?? []).map(day => day.id);

    let sessionRows:
      | {
          exam_day_id: string;
          session_key: string;
          enabled: boolean;
          needed: number;
        }[]
      = [];

    if (dayIds.length > 0) {
      const { data, error } = await supabase
        .from('exam_sessions')
        .select('exam_day_id, session_key, enabled, needed')
        .in('exam_day_id', dayIds);

      if (error) {
        setStatus(error.message);
        setLoading(false);
        return;
      }

      sessionRows = data ?? [];
    }

    const mappedDays: ExamDay[] = (dayRows ?? []).map(day => {
      const sessions: Record<SessionKey, DaySession> = {
        morning: { enabled: false, needed: 0 },
        mid: { enabled: false, needed: 0 },
        afternoon: { enabled: false, needed: 0 },
      };

      sessionRows
        .filter(session => session.exam_day_id === day.id)
        .forEach(session => {
          if (
            session.session_key === 'morning' ||
            session.session_key === 'mid' ||
            session.session_key === 'afternoon'
          ) {
            sessions[session.session_key] = {
              enabled: session.enabled,
              needed: session.enabled ? session.needed ?? 0 : 0,
            };
          }
        });

      return {
        id: day.id,
        date: day.exam_date,
        label: day.label,
        sessions,
      };
    });

    setDays(mappedDays);
    setLoading(false);
  }

  async function syncShiftSlot(
    examDayId: string,
    sessionKey: SessionKey,
    sessionData: DaySession
  ) {
    const { data: existingSlot, error: lookupError } = await supabase
      .from('shift_slots')
      .select('id')
      .eq('exam_day_id', examDayId)
      .eq('session_key', sessionKey)
      .maybeSingle();

    if (lookupError) throw new Error(lookupError.message);

    if (!sessionData.enabled) {
      if (existingSlot?.id) {
        const { error: deleteError } = await supabase
          .from('shift_slots')
          .delete()
          .eq('id', existingSlot.id);

        if (deleteError) throw new Error(deleteError.message);
      }
      return;
    }

    if (sessionData.needed < 1) return;

    if (existingSlot?.id) {
      const { error: updateError } = await supabase
        .from('shift_slots')
        .update({ needed: sessionData.needed })
        .eq('id', existingSlot.id);

      if (updateError) throw new Error(updateError.message);
    } else {
      const { error: insertError } = await supabase.from('shift_slots').insert({
        exam_day_id: examDayId,
        session_key: sessionKey,
        needed: sessionData.needed,
        published: false,
      });

      if (insertError) throw new Error(insertError.message);
    }
  }

  async function openPrivateAssignments() {
    try {
      setStatus('Preparing private shifts...');

      for (const day of days) {
        for (const session of Object.keys(day.sessions) as SessionKey[]) {
          await syncShiftSlot(day.id, session, day.sessions[session]);
        }
      }

      window.location.href = '/admin/assign-invigilators';
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Could not prepare shifts: ${error.message}`
          : 'Could not prepare shifts'
      );
    }
  }

  async function saveDayToSupabase(day: Omit<ExamDay, 'id'>) {
    if (!currentSeason?.id) return null;

    const { data: dayRow, error: dayError } = await supabase
      .from('exam_days')
      .upsert(
        {
          season_id: currentSeason.id,
          exam_date: day.date,
          label: day.label,
        },
        { onConflict: 'season_id,exam_date' }
      )
      .select('id, exam_date, label')
      .single();

    if (dayError || !dayRow) {
      throw new Error(dayError?.message || 'Failed to save day');
    }

    const sessionRows = (Object.keys(day.sessions) as SessionKey[]).map(key => ({
      exam_day_id: dayRow.id,
      session_key: key,
      enabled: day.sessions[key].enabled,
      needed: day.sessions[key].needed || 1,
    }));

    const { error: sessionError } = await supabase
      .from('exam_sessions')
      .upsert(sessionRows, { onConflict: 'exam_day_id,session_key' });

    if (sessionError) throw new Error(sessionError.message);

    for (const key of Object.keys(day.sessions) as SessionKey[]) {
      await syncShiftSlot(dayRow.id, key, day.sessions[key]);
    }

    return {
      id: dayRow.id,
      date: dayRow.exam_date,
      label: dayRow.label,
      sessions: day.sessions,
    } as ExamDay;
  }

  async function updateSession(
    dayId: string,
    session: SessionKey,
    updates: Partial<DaySession>
  ) {
    const day = days.find(d => d.id === dayId);
    if (!day) return;

    const updatedSession = {
      ...day.sessions[session],
      ...updates,
    };

    const updatedDay: ExamDay = {
      ...day,
      sessions: {
        ...day.sessions,
        [session]: updatedSession,
      },
    };

    setDays(prev => prev.map(d => (d.id === dayId ? updatedDay : d)));

    try {
      setStatus('Saving...');

      const { error } = await supabase.from('exam_sessions').upsert(
        {
          exam_day_id: dayId,
          session_key: session,
          enabled: updatedSession.enabled,
          needed: updatedSession.needed || 1,
        },
        { onConflict: 'exam_day_id,session_key' }
      );

      if (error) {
        setStatus(error.message);
        await loadDays();
        return;
      }

      await syncShiftSlot(dayId, session, updatedSession);
      setStatus('Saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed');
      await loadDays();
    }
  }

  async function handleNeededChange(
    dayId: string,
    session: SessionKey,
    value: string
  ) {
    const raw = value.replace(/\D/g, '');

    await updateSession(dayId, session, {
      needed: raw === '' ? 0 : Number(raw),
    });
  }

  function validateBeforePublish() {
    for (const day of days) {
      for (const session of Object.values(day.sessions)) {
        if (session.enabled && session.needed < 1) {
          alert('Please fill in all enabled sessions before publishing.');
          return false;
        }
      }
    }

    return true;
  }

  async function publishAllShifts() {
    if (!currentSeason?.id) return;
    if (!validateBeforePublish()) return;

    try {
      setStatus('Publishing all shifts...');

      const { data: seasonDays } = await supabase
        .from('exam_days')
        .select('id')
        .eq('season_id', currentSeason.id);

      const seasonDayIds = (seasonDays ?? []).map(day => day.id);

      if (seasonDayIds.length === 0) {
        setStatus('No days to publish yet.');
        return;
      }

      const { data: newlyPublishedSlots, error: newSlotsError } = await supabase
        .from('shift_slots')
        .select('id')
        .in('exam_day_id', seasonDayIds)
        .eq('published', false);

      if (newSlotsError) {
        setStatus(newSlotsError.message);
        return;
      }

      const { error: publishError } = await supabase
        .from('shift_slots')
        .update({ published: true })
        .in('exam_day_id', seasonDayIds);

      if (publishError) {
        setStatus(publishError.message);
        return;
      }

      const publishTime = new Date().toISOString();

      await supabase
        .from('seasons')
        .update({ last_published_at: publishTime })
        .eq('id', currentSeason.id);

      if ((newlyPublishedSlots ?? []).length > 0) {
        const { data: activeInvigilators } = await supabase
          .from('invigilators')
          .select('id')
          .eq('active', true);

        if ((activeInvigilators ?? []).length > 0) {
          const { error: notificationError } = await supabase
            .from('invigilator_shift_notifications')
            .insert(
              (activeInvigilators ?? []).map(invigilator => ({
                season_id: currentSeason.id,
                invigilator_id: invigilator.id,
                notification_type: 'shifts_available',
                title: 'New shifts are available',
                message:
                  'New shifts have been published. Visit Available Shifts to take a look.',
              }))
            );

          if (notificationError) {
            setStatus(
              `Shifts published, but notifications could not be created: ${notificationError.message}`
            );
            return;
          }
        }
      }

      setLastPublishedAt(publishTime);
      setStatus('All shifts published.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Publish failed');
    }
  }

  async function addOneDay(dateStr: string) {
    if (!dateStr) return;
    if (days.some(d => d.date === dateStr)) return;

    try {
      setStatus('Saving...');
      const savedDay = await saveDayToSupabase(createLocalDay(dateStr));
      if (!savedDay) return;

      setDays(prev =>
        [...prev, savedDay].sort((a, b) => a.date.localeCompare(b.date))
      );
      setStatus('Saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed');
    }
  }

  async function addDay() {
    await addOneDay(singleDate);
    setSingleDate('');
  }

  async function addWeek() {
    if (!singleDate) return;

    const weekDates = getWeekFromDate(singleDate).filter(
      d => !days.some(day => day.date === d)
    );

    try {
      setStatus('Saving...');
      for (const dateStr of weekDates) {
        await saveDayToSupabase(createLocalDay(dateStr));
      }
      await loadDays();
      setSingleDate('');
      setStatus('Saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed');
    }
  }

  async function addRange() {
    if (!fromDate || !toDate) return;

    const start = parseLocalDate(fromDate);
    const end = parseLocalDate(toDate);

    if (start > end) return;

    const rangeDates = getDatesInRange(fromDate, toDate, skipWeekends).filter(
      d => !days.some(day => day.date === d)
    );

    try {
      setStatus('Saving...');
      for (const dateStr of rangeDates) {
        await saveDayToSupabase(createLocalDay(dateStr));
      }
      await loadDays();
      setStatus('Saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed');
    }
  }

async function uploadRoomRequirements(
  event: React.ChangeEvent<HTMLInputElement>
) {
  if (!currentSeason?.id) return;

  const file = event.target.files?.[0];
  if (!file) return;

  try {
    setUploadingRooms(true);
    setStatus('Uploading room requirements...');

    const text = await file.text();

    const rows = text
  .replace(/^\uFEFF/, '')
  .split(/\r?\n/)
  .map(r => r.trim())
  .filter(Boolean);

    if (rows.length < 2) {
      setStatus('CSV is empty.');
      return;
    }

    const headers = rows[0].split(',').map(header => header.replace(/"/g, '').trim());

    const dataRows = rows.slice(1);

    const get = (row: string[], name: string) => {
      const index = headers.indexOf(name);
      return index >= 0 ? row[index]?.replace(/"/g, '') ?? '' : '';
    };

    await supabase
      .from('room_requirements')
      .delete()
      .eq('season_id', currentSeason.id);

    const inserts = [];

    for (const rowText of dataRows) {
      const row = rowText.split(',').map(cell => cell.replace(/"/g, '').trim());

      const rawDate = get(row, 'Date');
console.log('Room CSV row:', row);
console.log('Raw date:', rawDate);

      const cleanDate = rawDate.split(' ')[0];

      if (!rawDate) continue;

      const [day, month, year] = cleanDate.split('/');

      const examDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

      const start = get(row, 'Start');

      let sessionKey: SessionKey = 'morning';

      const hour = parseInt(start.split(':')[0] || '0');

      if (hour >= 13) {
        sessionKey = 'afternoon';
      } else if (hour >= 11) {
        sessionKey = 'mid';
      }

      const studentCount = Number(get(row, 'NoOfCands') || '0');

      const roomName = get(row, 'Room').trim();
      const rulesForRoom = roomStaffingRules[roomName] ?? staffingRules;
      const suggestedInvigilators = calculateInvigilatorsNeeded(
        studentCount,
        rulesForRoom
      );

      inserts.push({
        season_id: currentSeason.id,
        exam_date: examDate,
        session_key: sessionKey,
        start_time: start,
        room_name: roomName,
        exam_name: get(row, 'ComponentLocalName'),
        paper_code: get(row, 'ComponentCode'),
        student_count: studentCount,
        duration_minutes: Number(get(row, 'Length') || get(row, 'Length1') || '0'),
        suggested_invigilators: suggestedInvigilators,
      });
    }

    const { error } = await supabase
      .from('room_requirements')
      .insert(inserts);

    if (error) {
      setStatus(error.message);
      return;
    }

    await loadRoomStaffingRules();
    setStatus(`Uploaded ${inserts.length} room requirements.`);
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : 'Upload failed'
    );
  } finally {
    setUploadingRooms(false);
  }
}

async function calculateRoomRequirements() {
  if (!currentSeason?.id) return;

  try {
    setStatus('Calculating session requirements...');

    const { data: rooms, error } = await supabase
      .from('room_requirements')
      .select('*')
      .eq('season_id', currentSeason.id);

    if (error) {
      setStatus(error.message);
      return;
    }

    if (!rooms || rooms.length === 0) {
      setStatus('No room requirements uploaded.');
      return;
    }

    const roomGroups = new Map<string, number>();

    for (const room of rooms) {
      const key = JSON.stringify([
        room.exam_date,
        room.session_key,
        room.start_time,
        room.room_name,
      ]);

      const current = roomGroups.get(key) ?? 0;

      roomGroups.set(
        key,
        current + (room.student_count ?? 0)
      );
    }

    const sessionTotals = new Map<string, number>();

    for (const [roomKey, studentTotal] of Array.from(roomGroups.entries())) {
      const [examDate, sessionKey, , roomName] = JSON.parse(roomKey) as string[];
      const rulesForRoom = roomStaffingRules[roomName] ?? staffingRules;

      const invigilatorsNeeded = calculateInvigilatorsNeeded(
        studentTotal,
        rulesForRoom
      );

      const sessionKeyName = `${examDate}_${sessionKey}`;

      const current =
        sessionTotals.get(sessionKeyName) ?? 0;

      sessionTotals.set(
        sessionKeyName,
        current + invigilatorsNeeded
      );
    }

    for (const [key, total] of Array.from(sessionTotals.entries())) {
      const [examDate, sessionKey] = key.split('_');

      const day = days.find(d => d.date === examDate);

      if (!day) continue;

      await updateSession(day.id, sessionKey as SessionKey, {
        enabled: true,
        needed: total,
      });
    }

    await loadDays();

    setStatus('Session requirements calculated.');
  } catch (error) {
    setStatus(
      error instanceof Error
        ? error.message
        : 'Calculation failed'
    );
  }
}

  async function removeDay(id: string) {
    try {
      setStatus('Removing...');
      const { error } = await supabase.from('exam_days').delete().eq('id', id);

      if (error) {
        setStatus(error.message);
        return;
      }

      setDays(prev => prev.filter(day => day.id !== id));
      setStatus('Removed.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Remove failed');
    }
  }

  if (!currentSeason) {
    return <div style={page}>No season selected.</div>;
  }

  return (
    <div style={page}>
      <div style={hero}>
  <h1 style={heroTitle}>Shift Setup</h1>
  <p style={heroText}>
    Create exam days, choose which sessions are running, and set how many
    invigilators are needed.
  </p>
</div>

<section
  style={{
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
  }}
>
  <h2
    style={{
      marginTop: 0,
      marginBottom: 8,
      color: '#4c1d95',
    }}
  >
    Upload Room Requirements CSV
  </h2>

  <p
    style={{
      marginTop: 0,
      color: '#6b7280',
      marginBottom: 14,
    }}
  >
    Upload your MIS room timetable file to automatically calculate
    suggested invigilator numbers for each session.
  </p>

  <input
    type="file"
    accept=".csv,text/csv"
    onChange={uploadRoomRequirements}
    disabled={uploadingRooms}
  />

<div style={{ marginTop: 14 }}>
  <button
    onClick={calculateRoomRequirements}
    style={primaryButton}
    disabled={uploadingRooms}
  >
    Calculate session requirements
  </button>
</div>

</section>

<section
  style={{
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
  }}
>
  <h2 style={{ marginTop: 0, marginBottom: 8, color: '#4c1d95' }}>
    Staffing rules
  </h2>
  <p style={{ marginTop: 0, color: '#6b7280' }}>
    These rules are saved for this season and used when room requirements are
    uploaded or recalculated.
  </p>

  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
      gap: 14,
      marginBottom: 16,
    }}
  >
    <label style={{ display: 'grid', gap: 6 }}>
      <strong>Candidates per invigilator</strong>
      <input
        type="number"
        min={1}
        step={1}
        value={staffingRules.candidatesPerInvigilator}
        onChange={event =>
          updateStaffingRule('candidatesPerInvigilator', event.target.value)
        }
        style={input}
      />
    </label>

    <label style={{ display: 'grid', gap: 6 }}>
      <strong>Additional invigilators per room</strong>
      <input
        type="number"
        min={0}
        step={1}
        value={staffingRules.additionalInvigilatorsPerRoom}
        onChange={event =>
          updateStaffingRule(
            'additionalInvigilatorsPerRoom',
            event.target.value
          )
        }
        style={input}
      />
    </label>

    <label style={{ display: 'grid', gap: 6 }}>
      <strong>Minimum invigilators per room</strong>
      <input
        type="number"
        min={1}
        step={1}
        value={staffingRules.minimumInvigilatorsPerRoom}
        onChange={event =>
          updateStaffingRule(
            'minimumInvigilatorsPerRoom',
            event.target.value
          )
        }
        style={input}
      />
    </label>

    <label
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        alignSelf: 'end',
        padding: '10px 0',
      }}
    >
      <input
        type="checkbox"
        checked={staffingRules.singleCandidateNeedsOne}
        onChange={event =>
          setStaffingRules(current => ({
            ...current,
            singleCandidateNeedsOne: event.target.checked,
          }))
        }
      />
      <strong>If there is only 1 student, use 1 invigilator</strong>
    </label>
  </div>

  <p style={{ color: '#4b5563', marginTop: 0 }}>
    Example: a room with 61 candidates needs{' '}
    <strong>{calculateInvigilatorsNeeded(61, staffingRules)}</strong>{' '}
    invigilators with the current rules.
  </p>

  <button
    onClick={saveStaffingRules}
    style={primaryButton}
    disabled={savingRules}
  >
    {savingRules ? 'Saving...' : 'Save staffing rules'}
  </button>
</section>

<section
  style={{
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
  }}
>
  <h2 style={{ marginTop: 0, marginBottom: 8, color: '#4c1d95' }}>
    Rules by room
  </h2>
  <p style={{ marginTop: 0, color: '#6b7280' }}>
    Rooms found in the uploaded CSV appear here. Turn on an override only where
    a room needs different staffing from the season defaults.
  </p>

  {identifiedRooms.length === 0 ? (
    <div
      style={{
        background: '#f9fafb',
        border: '1px dashed #d1d5db',
        borderRadius: 12,
        padding: 16,
        color: '#6b7280',
      }}
    >
      Upload a room requirements CSV to identify rooms.
    </div>
  ) : (
    <>
      <div style={{ display: 'grid', gap: 12 }}>
        {identifiedRooms.map(roomName => {
          const override = roomStaffingRules[roomName];
          const displayedRules = override ?? staffingRules;

          return (
            <div
              key={roomName}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 14,
                background: override ? '#faf5ff' : '#f9fafb',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <strong style={{ color: '#4c1d95', fontSize: 17 }}>
                  {roomName}
                </strong>
                <label style={checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={override !== null && override !== undefined}
                    onChange={event =>
                      setRoomOverride(roomName, event.target.checked)
                    }
                  />
                  Use custom rules
                </label>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(190px, 1fr))',
                  gap: 10,
                  marginTop: 12,
                }}
              >
                <label style={{ display: 'grid', gap: 5 }}>
                  <span>Candidates per invigilator</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    disabled={!override}
                    value={displayedRules.candidatesPerInvigilator}
                    onChange={event =>
                      updateRoomStaffingRule(
                        roomName,
                        'candidatesPerInvigilator',
                        event.target.value
                      )
                    }
                    style={input}
                  />
                </label>
                <label style={{ display: 'grid', gap: 5 }}>
                  <span>Additional per room</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    disabled={!override}
                    value={displayedRules.additionalInvigilatorsPerRoom}
                    onChange={event =>
                      updateRoomStaffingRule(
                        roomName,
                        'additionalInvigilatorsPerRoom',
                        event.target.value
                      )
                    }
                    style={input}
                  />
                </label>
                <label style={{ display: 'grid', gap: 5 }}>
                  <span>Minimum per room</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    disabled={!override}
                    value={displayedRules.minimumInvigilatorsPerRoom}
                    onChange={event =>
                      updateRoomStaffingRule(
                        roomName,
                        'minimumInvigilatorsPerRoom',
                        event.target.value
                      )
                    }
                    style={input}
                  />
                </label>
                <label
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    alignSelf: 'end',
                    padding: '10px 0',
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={!override}
                    checked={displayedRules.singleCandidateNeedsOne}
                    onChange={event =>
                      setRoomStaffingRules(current => ({
                        ...current,
                        [roomName]: {
                          ...(current[roomName] ?? staffingRules),
                          singleCandidateNeedsOne: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>1 student needs only 1 invigilator</span>
                </label>
              </div>
              {!override && (
                <div style={{ color: '#6b7280', marginTop: 8, fontSize: 13 }}>
                  Using season defaults
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={saveRoomStaffingRules}
        style={{ ...primaryButton, marginTop: 16 }}
        disabled={savingRoomRules}
      >
        {savingRoomRules ? 'Saving...' : 'Save room rules'}
      </button>
    </>
  )}
</section>

<div style={infoGrid}>
        <div style={infoCard}>
          <span style={smallLabel}>Current season</span>
          <strong style={infoValue}>{currentSeason.name}</strong>
        </div>

        <div style={infoCard}>
          <span style={smallLabel}>Last published</span>
          <strong style={infoValue}>{formatDateTime(lastPublishedAt)}</strong>
        </div>
      </div>

      <div style={toolbar}>
        <button onClick={publishAllShifts} style={primaryButton}>
          Publish all shifts
        </button>

        <button
          onClick={openPrivateAssignments}
          style={secondaryButton}
        >
          Assign shifts privately
        </button>

        <span style={statusStyle(status)}>
          {loading ? 'Loading...' : status}
        </span>
      </div>

      <div
        style={{
          marginBottom: 20,
          padding: 14,
          background: '#f5f3ff',
          border: '1px solid #ddd6fe',
          borderRadius: 12,
          color: '#4c1d95',
          lineHeight: 1.5,
        }}
      >
        You can assign saved shifts before publishing them. Invigilators cannot
        see or apply for a shift until you choose <strong>Publish all shifts</strong>.
      </div>

      <div style={setupGrid}>
        <section style={panel}>
          <h2 style={panelTitle}>Add a day or week</h2>

          <div style={row}>
            <input
              type="date"
              value={singleDate}
              onChange={e => setSingleDate(e.target.value)}
              style={input}
            />

            <button onClick={addDay} style={secondaryButton}>
              Add day
            </button>

            <button onClick={addWeek} style={secondaryButton}>
              Add week
            </button>
          </div>
        </section>

        <section style={panel}>
          <h2 style={panelTitle}>Add a date range</h2>

          <div style={row}>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              style={input}
            />

            <span>to</span>

            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              style={input}
            />

            <label style={checkboxLabel}>
              <input
                type="checkbox"
                checked={skipWeekends}
                onChange={e => setSkipWeekends(e.target.checked)}
              />
              Skip weekends
            </label>

            <button onClick={addRange} style={secondaryButton}>
              Add days
            </button>
          </div>
        </section>
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        {days.length === 0 && !loading ? (
          <div style={emptyCard}>No exam days added yet.</div>
        ) : (
          days.map(day => (
            <div key={day.id} style={dayCard}>
              <div style={dayHeader}>
                <div>
                  <h2 style={dayTitle}>{day.label}</h2>
                  <p style={dayDate}>{day.date}</p>
                </div>

                <button onClick={() => removeDay(day.id)} style={dangerButton}>
                  Remove
                </button>
              </div>

              <div style={sessionGrid}>
                {(['morning', 'mid', 'afternoon'] as SessionKey[]).map(s => {
                  const isIncomplete =
                    day.sessions[s].enabled && day.sessions[s].needed < 1;

                  return (
                    <div
                      key={s}
                      style={{
                        ...sessionCard,
                        opacity: day.sessions[s].enabled ? 1 : 0.55,
                        border: isIncomplete
                          ? '2px solid #fca5a5'
                          : '1px solid #e5e7eb',
                      }}
                    >
                      <label style={sessionTopLine}>
                        <input
                          type="checkbox"
                          checked={day.sessions[s].enabled}
                          onChange={e =>
                            updateSession(day.id, s, {
                              enabled: e.target.checked,
                              needed: e.target.checked
                                ? day.sessions[s].needed
                                : 0,
                            })
                          }
                        />
                        <span style={sessionName}>{sessionLabel(s)}</span>
                      </label>

                      <label style={neededLine}>
                        <span>Needed</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Enter number"
                          value={
                            day.sessions[s].needed === 0
                              ? ''
                              : String(day.sessions[s].needed)
                          }
                          onChange={e =>
                            handleNeededChange(day.id, s, e.target.value)
                          }
                          style={numberInput}
                          disabled={!day.sessions[s].enabled}
                        />
                      </label>

                      {isIncomplete && (
                        <div style={warningText}>Enter a number before publishing</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
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

const infoGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
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
  marginBottom: 4,
};

const infoValue: React.CSSProperties = {
  color: '#4c1d95',
  fontSize: 16,
};

const toolbar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  marginBottom: 18,
};

const setupGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 16,
  marginBottom: 24,
};

const panel: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
};

const panelTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  color: '#4c1d95',
  fontSize: 20,
};

const row: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  flexWrap: 'wrap',
};

const input: React.CSSProperties = {
  padding: '9px 10px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
};

const checkboxLabel: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
};

const primaryButton: React.CSSProperties = {
  background: '#4c1d95',
  color: 'white',
  border: 'none',
  padding: '10px 14px',
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 700,
};

const secondaryButton: React.CSSProperties = {
  background: '#f5f3ff',
  color: '#4c1d95',
  border: '1px solid #ddd6fe',
  padding: '9px 12px',
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 700,
};

const dangerButton: React.CSSProperties = {
  background: '#fee2e2',
  color: '#991b1b',
  border: '1px solid #fecaca',
  padding: '8px 10px',
  borderRadius: 10,
  cursor: 'pointer',
  fontWeight: 700,
};

const emptyCard: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 24,
  color: '#555',
  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
};

const dayCard: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
};

const dayHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
  marginBottom: 16,
};

const dayTitle: React.CSSProperties = {
  margin: 0,
  color: '#4c1d95',
  fontSize: 22,
};

const dayDate: React.CSSProperties = {
  margin: '4px 0 0 0',
  color: '#6b7280',
};

const sessionGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
};

const sessionCard: React.CSSProperties = {
  background: '#fafafa',
  borderRadius: 12,
  padding: 14,
};

const sessionTopLine: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  marginBottom: 12,
};

const sessionName: React.CSSProperties = {
  fontWeight: 800,
  color: '#4c1d95',
};

const neededLine: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
  color: '#374151',
};

const numberInput: React.CSSProperties = {
  width: 110,
  padding: '7px 8px',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  textAlign: 'center',
  fontWeight: 700,
};

const warningText: React.CSSProperties = {
  marginTop: 8,
  color: '#991b1b',
  fontSize: 12,
  fontWeight: 700,
};

function statusStyle(status: string): React.CSSProperties {
  const isError =
    status.toLowerCase().includes('failed') ||
    status.toLowerCase().includes('error');

  return {
    color: isError ? '#991b1b' : '#4c1d95',
    fontWeight: 700,
    background: isError ? '#fee2e2' : '#f5f3ff',
    border: isError ? '1px solid #fecaca' : '1px solid #ddd6fe',
    borderRadius: 10,
    padding: '9px 12px',
    minHeight: 20,
  };
}
