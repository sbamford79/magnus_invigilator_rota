'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../../lib/supabase';
import { SeasonContext } from '../layout';

type SessionKey = 'morning' | 'mid' | 'afternoon';

type Invigilator = {
  id: string;
  full_name: string;
};

type ExamDay = {
  id: string;
  exam_date: string;
  label: string;
};

type ShiftSlot = {
  id: string;
  exam_day_id: string;
  session_key: SessionKey;
};

type Assignment = {
  shift_slot_id: string;
  invigilator_id: string;
};

type Application = {
  shift_slot_id: string;
  invigilator_id: string;
};

type RatioRow = {
  id: string;
  full_name: string;
  applications: number;
  assigned: number;
  ratio: number | null;
};

const sessionColours: Record<SessionKey, string> = {
  morning: '#2563eb',
  mid: '#f59e0b',
  afternoon: '#16a34a',
};

function Dot({ colour }: { colour: string }) {
  return (
    <span
      style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: colour,
        display: 'inline-block',
      }}
    />
  );
}

function formatRatio(ratio: number | null) {
  if (ratio === null) return '—';
  return `${Math.round(ratio)}%`;
}

function formatDateForHeader(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
  });
}

export default function ReportsPage() {
  const { currentSeason } = useContext(SeasonContext);

  const [invigilators, setInvigilators] = useState<Invigilator[]>([]);
  const [days, setDays] = useState<ExamDay[]>([]);
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [ratioSort, setRatioSort] = useState<'lowest' | 'highest' | 'name'>('lowest');

  useEffect(() => {
    if (currentSeason?.id) {
      loadReport();
    }
  }, [currentSeason?.id]);

  async function loadReport() {
    if (!currentSeason?.id) return;

    setLoading(true);
    setStatus('');

    const { data: invigilatorRows, error: invigilatorError } = await supabase
      .from('invigilators')
      .select('id, full_name')
      .eq('active', true)
      .order('full_name', { ascending: true });

    if (invigilatorError) {
      setStatus(invigilatorError.message);
      setLoading(false);
      return;
    }

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

    const examDays = (dayRows ?? []) as ExamDay[];
    const dayIds = examDays.map(day => day.id);

    let slotRows: ShiftSlot[] = [];
    let assignmentRows: Assignment[] = [];
    let applicationRows: Application[] = [];

    if (dayIds.length > 0) {
      const { data: fetchedSlots, error: slotError } = await supabase
        .from('shift_slots')
        .select('id, exam_day_id, session_key')
        .in('exam_day_id', dayIds)
        .eq('published', true);

      if (slotError) {
        setStatus(slotError.message);
        setLoading(false);
        return;
      }

      slotRows = (fetchedSlots ?? []) as ShiftSlot[];
      const slotIds = slotRows.map(slot => slot.id);

      if (slotIds.length > 0) {
        const { data: fetchedAssignments, error: assignmentError } = await supabase
          .from('shift_assignments')
          .select('shift_slot_id, invigilator_id')
          .in('shift_slot_id', slotIds)
          .eq('published', true);

        if (assignmentError) {
          setStatus(assignmentError.message);
          setLoading(false);
          return;
        }

        assignmentRows = (fetchedAssignments ?? []) as Assignment[];

        const { data: fetchedApplications, error: applicationError } = await supabase
          .from('shift_applications')
          .select('shift_slot_id, invigilator_id')
          .in('shift_slot_id', slotIds);

        if (applicationError) {
          setStatus(applicationError.message);
          setLoading(false);
          return;
        }

        applicationRows = (fetchedApplications ?? []) as Application[];
      }
    }

    setInvigilators((invigilatorRows ?? []) as Invigilator[]);
    setDays(examDays);
    setSlots(slotRows);
    setAssignments(assignmentRows);
    setApplications(applicationRows);
    setLoading(false);
  }

  const slotLookup = useMemo(() => {
    const lookup = new Map<string, ShiftSlot>();
    for (const slot of slots) {
      lookup.set(slot.id, slot);
    }
    return lookup;
  }, [slots]);

  const dayLookup = useMemo(() => {
    const lookup = new Map<string, ExamDay>();
    for (const day of days) {
      lookup.set(day.id, day);
    }
    return lookup;
  }, [days]);

  const assignmentLookup = useMemo(() => {
    const lookup = new Set<string>();

    for (const assignment of assignments) {
      const slot = slotLookup.get(assignment.shift_slot_id);
      if (!slot) continue;

      const day = dayLookup.get(slot.exam_day_id);
      if (!day) continue;

      lookup.add(`${assignment.invigilator_id}__${day.exam_date}__${slot.session_key}`);
    }

    return lookup;
  }, [assignments, slotLookup, dayLookup]);

  function hasAssignment(invigilatorId: string, date: string, session: SessionKey) {
    return assignmentLookup.has(`${invigilatorId}__${date}__${session}`);
  }

  function getAssignedTotal(invigilatorId: string) {
    return assignments.filter(a => a.invigilator_id === invigilatorId).length;
  }

  const ratioRows = useMemo(() => {
    const rows: RatioRow[] = invigilators.map(invigilator => {
      const applicationCount = applications.filter(
        app => app.invigilator_id === invigilator.id
      ).length;

      const assignedCount = assignments.filter(
        assignment => assignment.invigilator_id === invigilator.id
      ).length;

      const ratio =
        applicationCount === 0
          ? null
          : (assignedCount / applicationCount) * 100;

      return {
        id: invigilator.id,
        full_name: invigilator.full_name,
        applications: applicationCount,
        assigned: assignedCount,
        ratio,
      };
    });

    const sorted = [...rows];

    if (ratioSort === 'name') {
      sorted.sort((a, b) => a.full_name.localeCompare(b.full_name));
      return sorted;
    }

    if (ratioSort === 'highest') {
      sorted.sort((a, b) => {
        const aValue = a.ratio ?? -1;
        const bValue = b.ratio ?? -1;
        if (bValue !== aValue) return bValue - aValue;
        return a.full_name.localeCompare(b.full_name);
      });
      return sorted;
    }

    sorted.sort((a, b) => {
      const aValue = a.ratio ?? -1;
      const bValue = b.ratio ?? -1;
      if (aValue !== bValue) return aValue - bValue;
      return a.full_name.localeCompare(b.full_name);
    });

    return sorted;
  }, [invigilators, applications, assignments, ratioSort]);

  function exportRotaGridToExcel() {
    const headers = ['Invigilator', ...days.map(day => formatDateForHeader(day.exam_date)), 'Total'];

    const rows = invigilators.map(invigilator => {
      const dateCells = days.map(day => {
        const parts: string[] = [];

        if (hasAssignment(invigilator.id, day.exam_date, 'morning')) parts.push('Morning');
        if (hasAssignment(invigilator.id, day.exam_date, 'mid')) parts.push('Mid');
        if (hasAssignment(invigilator.id, day.exam_date, 'afternoon')) parts.push('Afternoon');

        return parts.join(', ');
      });

      return [
        invigilator.full_name,
        ...dateCells,
        getAssignedTotal(invigilator.id),
      ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rota Grid');
    XLSX.writeFile(
      workbook,
      `${currentSeason?.name ?? 'season'}-rota-grid.xlsx`
    );
  }

  function exportRatioReportToExcel() {
    const headers = ['Invigilator', 'Applications', 'Assigned', 'Ratio'];

    const rows = ratioRows.map(row => [
      row.full_name,
      row.applications,
      row.assigned,
      row.ratio === null ? '—' : `${Math.round(row.ratio)}%`,
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ratio Report');
    XLSX.writeFile(
      workbook,
      `${currentSeason?.name ?? 'season'}-invigilator-ratio-report.xlsx`
    );
  }

  if (!currentSeason) {
    return <div>No season selected.</div>;
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Loading reports...</div>;
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Reports</h1>

      <div style={{ marginBottom: 12, color: '#444' }}>
        Season: <strong>{currentSeason.name}</strong>
      </div>

      {status && (
        <div
          style={{
            marginBottom: 16,
            padding: 10,
            background: '#fef2f2',
            color: '#b91c1c',
            borderRadius: 6,
          }}
        >
          {status}
        </div>
      )}

      <section style={{ marginBottom: 36 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h2 style={{ margin: 0 }}>Rota Grid</h2>

          <button onClick={exportRotaGridToExcel}>
            Export Rota Grid to Excel
          </button>
        </div>

        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            gap: 18,
            alignItems: 'center',
            flexWrap: 'wrap',
            padding: 12,
            background: '#f7f7f7',
            borderRadius: 8,
          }}
        >
          <div style={{ fontWeight: 600 }}>Legend:</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Dot colour={sessionColours.morning} />
            <span>Morning</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Dot colour={sessionColours.mid} />
            <span>Mid</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Dot colour={sessionColours.afternoon} />
            <span>Afternoon</span>
          </div>
        </div>

        {invigilators.length === 0 ? (
          <p>No invigilators found.</p>
        ) : days.length === 0 ? (
          <p>No exam days found for this season.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                borderCollapse: 'collapse',
                minWidth: 900,
                width: '100%',
                background: '#fff',
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      position: 'sticky',
                      left: 0,
                      background: '#fff',
                      zIndex: 2,
                      border: '1px solid #ddd',
                      padding: 10,
                      textAlign: 'left',
                      minWidth: 150,
                      maxWidth: 150,
                      width: 150,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Invigilator
                  </th>

                  {days.map(day => (
                    <th
                      key={day.id}
                      style={{
                        border: '1px solid #ddd',
                        padding: 12,
                        textAlign: 'center',
                        minWidth: 120,
                      }}
                    >
                      {formatDateForHeader(day.exam_date)}
                    </th>
                  ))}

                  <th
                    style={{
                      border: '1px solid #ddd',
                      padding: 12,
                      textAlign: 'center',
                      minWidth: 80,
                      background: '#f7f7f7',
                    }}
                  >
                    Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {invigilators.map(invigilator => (
                  <tr key={invigilator.id}>
                    <td
                      style={{
                        position: 'sticky',
                        left: 0,
                        background: '#fff',
                        zIndex: 1,
                        border: '1px solid #ddd',
                        padding: 10,
                        fontWeight: 600,
                        minWidth: 150,
                        maxWidth: 150,
                        width: 150,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={invigilator.full_name}
                    >
                      {invigilator.full_name}
                    </td>

                    {days.map(day => {
                      const morning = hasAssignment(invigilator.id, day.exam_date, 'morning');
                      const mid = hasAssignment(invigilator.id, day.exam_date, 'mid');
                      const afternoon = hasAssignment(invigilator.id, day.exam_date, 'afternoon');

                      return (
                        <td
                          key={`${invigilator.id}-${day.id}`}
                          style={{
                            border: '1px solid #ddd',
                            padding: 12,
                            textAlign: 'center',
                            verticalAlign: 'middle',
                            height: 52,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: 8,
                              minHeight: 20,
                            }}
                          >
                            {morning && <Dot colour={sessionColours.morning} />}
                            {mid && <Dot colour={sessionColours.mid} />}
                            {afternoon && <Dot colour={sessionColours.afternoon} />}
                          </div>
                        </td>
                      );
                    })}

                    <td
                      style={{
                        border: '1px solid #ddd',
                        padding: 12,
                        textAlign: 'center',
                        fontWeight: 700,
                        background: '#fafafa',
                      }}
                    >
                      {getAssignedTotal(invigilator.id)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h2 style={{ margin: 0 }}>Invigilator Ratio Report</h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label htmlFor="ratio-sort" style={{ fontWeight: 600 }}>
              Order by:
            </label>
            <select
              id="ratio-sort"
              value={ratioSort}
              onChange={e =>
                setRatioSort(e.target.value as 'lowest' | 'highest' | 'name')
              }
            >
              <option value="lowest">Lowest ratio first</option>
              <option value="highest">Highest ratio first</option>
              <option value="name">Name A–Z</option>
            </select>

            <button onClick={exportRatioReportToExcel}>
              Export Ratio Report to Excel
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              borderCollapse: 'collapse',
              width: '100%',
              background: '#fff',
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Invigilator</th>
                <th style={thStyle}>Applications</th>
                <th style={thStyle}>Assigned</th>
                <th style={thStyle}>Ratio</th>
              </tr>
            </thead>

            <tbody>
              {ratioRows.map(row => (
                <tr key={row.id}>
                  <td style={tdStyle}>{row.full_name}</td>
                  <td style={tdStyleNumber}>{row.applications}</td>
                  <td style={tdStyleNumber}>{row.assigned}</td>
                  <td style={tdStyleNumber}>{formatRatio(row.ratio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: 12, color: '#555' }}>
          Invigilators with 0 applications are included so you can spot who has not applied at all.
        </p>
      </section>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: 12,
  textAlign: 'left',
  background: '#f7f7f7',
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: 12,
  textAlign: 'left',
};

const tdStyleNumber: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: 12,
  textAlign: 'right',
};