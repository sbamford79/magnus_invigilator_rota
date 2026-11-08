'use client';

import { useContext, useEffect, useMemo, useState } from 'react';
import { AlignmentType, BorderStyle, Document, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { supabase } from '../../../lib/supabase';
import { SeasonContext } from '../SeasonContext';
import { formatLongDate } from '../../../lib/dateHelpers';

type RoomExam = { id: string; exam_date: string; start_time: string | null; room_name: string | null; exam_name: string | null; paper_code: string | null; duration_minutes: number | null; session_key: string | null };
type RunningOrder = { date: string; room: string; session: string; firstSession: RoomExam[]; secondSession: RoomExam[] };
const border = { style: BorderStyle.SINGLE, size: 8, color: '000000' };

function timeToMinutes(value: string | null) { const match = String(value ?? '').match(/(\d{1,2}):(\d{2})/); return match ? Number(match[1]) * 60 + Number(match[2]) : 0; }
function formatTime(value: string | null) { const total = timeToMinutes(value); const hours = Math.floor(total / 60); return `${hours % 12 || 12}:${String(total % 60).padStart(2, '0')}${hours >= 12 ? 'pm' : 'am'}`; }
function formatDuration(value: number | null) { const minutes = Math.max(0, Number(value) || 0); const hours = Math.floor(minutes / 60); const remainder = minutes % 60; return hours && remainder ? `${hours}hr ${remainder}mins` : hours ? `${hours}hr` : `${remainder}mins`; }
function sessionLabel(key: string | null, start: string | null) { if (key === 'morning') return 'AM'; if (key === 'mid') return 'MID'; if (key === 'afternoon') return 'PM'; return timeToMinutes(start) < 720 ? 'AM' : 'PM'; }
function subjectName(value: string | null) {
  return String(value ?? '')
    .replace(/\b(gcse|gce|igcse|a\s*level|as\s*level)\b/gi, '')
    .replace(/\b(foundation|higher|combined|trilogy|tier)\b/gi, '')
    .replace(/\bpaper\s*\d+\b/gi, '')
    .replace(/\b(award|qualification|component)\b/gi, '')
    .replace(/[\-–—:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function examLine(exam: RoomExam) { const end = timeToMinutes(exam.start_time) + (Number(exam.duration_minutes) || 0); const endTime = `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`; const detail = [exam.exam_name, exam.paper_code ? `(${exam.paper_code})` : ''].filter(Boolean).join(' '); return `${formatTime(exam.start_time)} - ${formatTime(endTime)} (${formatDuration(exam.duration_minutes)}) ${detail}`; }

function makeOrders(rows: RoomExam[]): RunningOrder[] {
  const byRoomDay = new Map<string, RoomExam[]>();
  rows.forEach(row => { const room = row.room_name?.trim() || 'Room not specified'; const key = `${row.exam_date}|${room}`; byRoomDay.set(key, [...(byRoomDay.get(key) ?? []), row]); });
  return Array.from(byRoomDay.entries()).flatMap(([key, roomRows]) => {
    const [date, room] = key.split('|'); const byStart = new Map<number, RoomExam[]>();
    roomRows.forEach(row => { const start = timeToMinutes(row.start_time); byStart.set(start, [...(byStart.get(start) ?? []), row]); });
    const starts = Array.from(byStart.keys()).sort((a, b) => a - b);
    const result: RunningOrder[] = [];

    // Work through every time block, not only the first one of the day. This
    // means an afternoon 13:30 / 14:40 pairing is treated just like an AM one.
    for (let index = 0; index < starts.length;) {
      const firstStart = starts[index];
      const firstSession = byStart.get(firstStart) ?? [];
      const secondSession: RoomExam[] = [];
      let nextIndex = index + 1;

      while (nextIndex < starts.length) {
        const nextStart = starts[nextIndex];
        const previousExams = [...firstSession, ...secondSession];
        const followsOn = previousExams.some(exam => {
          const end = timeToMinutes(exam.start_time) + (Number(exam.duration_minutes) || 0);
          return nextStart >= end && nextStart - end < 20;
        });
        if (!followsOn) break;
        secondSession.push(...(byStart.get(nextStart) ?? []));
        nextIndex += 1;
      }

      result.push({ date, room, session: sessionLabel(firstSession[0]?.session_key, firstSession[0]?.start_time), firstSession, secondSession });
      index = nextIndex;
    }
    return result;
  }).sort((a, b) => a.date.localeCompare(b.date) || a.room.localeCompare(b.room) || timeToMinutes(a.firstSession[0]?.start_time) - timeToMinutes(b.firstSession[0]?.start_time));
}

function paragraph(text: string, options: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; size?: number; divider?: boolean } = {}) {
  return new Paragraph({ alignment: options.align, spacing: { after: 120 }, border: options.divider ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A6A6A6', space: 6 } } : undefined, children: [new TextRun({ text, bold: options.bold, size: options.size ?? 22, font: 'Calibri' })] });
}
function sessionContent(title: string, exams: RoomExam[], second = false) {
  const content: Paragraph[] = [paragraph(title, { bold: true, size: 22 })];
  exams.forEach(exam => {
    content.push(paragraph(examLine(exam), { bold: true, size: 21 }));
    const continues = !second && exams.some(candidate => { const end = timeToMinutes(exam.start_time) + (Number(exam.duration_minutes) || 0); const start = timeToMinutes(candidate.start_time); return start >= end && start - end < 20; });
    content.push(paragraph(continues ? 'Students sitting the following exam remain for session 2' : 'All students to leave at the end of the exam', { size: 20, divider: true }));
  });
  return content;
}
function documentForOrders(orders: RunningOrder[]) {
  return new Document({ sections: orders.map(order => {
    const subjects = Array.from(new Set([...order.firstSession, ...order.secondSession].map(exam => subjectName(exam.exam_name)).filter(Boolean))).join(', ');
    return { properties: { page: { margin: { top: 550, bottom: 550, left: 1800, right: 1800 } } }, children: [
      paragraph(`EXAM RUNNING ORDER - ${order.room}`, { bold: true, align: AlignmentType.CENTER, size: 28 }), paragraph(`SUBJECTS:     ${subjects}`, { bold: true }), paragraph(`DATE:          ${formatLongDate(order.date)}`, { bold: true }), paragraph(`SESSION:     ${order.session}`, { bold: true }), paragraph('Papers Checked By     1 _______________________', { size: 20 }), paragraph('                              2 _______________________', { size: 20 }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border }, rows: [
        new TableRow({ children: [new TableCell({ children: sessionContent('SESSION 1', order.firstSession), margins: { top: 160, bottom: 160, left: 160, right: 160 } })] }),
        ...(order.secondSession.length ? [new TableRow({ children: [new TableCell({ children: [paragraph('SHORT BREAK - IN SILENCE', { bold: true, align: AlignmentType.CENTER, size: 20 })], shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E7E6E6' }, margins: { top: 120, bottom: 120, left: 160, right: 160 } })] }), new TableRow({ children: [new TableCell({ children: sessionContent('SESSION 2', order.secondSession, true), margins: { top: 160, bottom: 160, left: 160, right: 160 } })] })] : []),
      ] }), paragraph('At the break, the students must remain silent as other exams may still be continuing.', { bold: true, size: 19 }), paragraph('Students must not leave unless absolutely necessary and must be fully supervised if they do leave the examination room.', { bold: true, size: 19 }),
    ] };
  }) });
}

export default function RunningOrdersPage() {
  const { currentSeason } = useContext(SeasonContext); const [rows, setRows] = useState<RoomExam[]>([]); const [loading, setLoading] = useState(false); const [generating, setGenerating] = useState(false); const [status, setStatus] = useState('');
  useEffect(() => { async function loadRows() { if (!currentSeason?.id) { setRows([]); return; } setLoading(true); setStatus(''); const { data, error } = await supabase.from('room_requirements').select('id, exam_date, start_time, room_name, exam_name, paper_code, duration_minutes, session_key').eq('season_id', currentSeason.id).order('exam_date', { ascending: true }).order('start_time', { ascending: true }); if (error) setStatus(error.message); else setRows((data ?? []) as RoomExam[]); setLoading(false); } loadRows(); }, [currentSeason?.id]);
  const orders = useMemo(() => makeOrders(rows), [rows]);
  async function downloadOrders() { if (!currentSeason || orders.length === 0) return; setGenerating(true); setStatus('Creating your editable Word running orders...'); try { const blob = await Packer.toBlob(documentForOrders(orders)); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${currentSeason.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-running-orders.docx`; link.click(); URL.revokeObjectURL(link.href); setStatus(`Downloaded ${orders.length} running order${orders.length === 1 ? '' : 's'} in one editable Word file.`); } catch (error) { setStatus(error instanceof Error ? error.message : 'The Word file could not be created.'); } finally { setGenerating(false); } }
  return <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}><div style={{ background: 'linear-gradient(135deg, #4c1d95, #6d28d9)', color: 'white', borderRadius: 16, padding: 28, boxShadow: '0 8px 20px rgba(0,0,0,0.12)' }}><h1 style={{ margin: 0, fontSize: 32 }}>Running Orders</h1><p style={{ margin: '10px 0 0', opacity: .95 }}>Create editable Word running orders for every exam room in a season.</p></div><section style={{ marginTop: 24, background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24 }}><h2 style={{ marginTop: 0, color: '#4c1d95' }}>Selected season</h2><p style={{ fontSize: 18, fontWeight: 700 }}>{currentSeason?.name ?? 'Choose a season above'}</p><p style={{ color: '#4b5563', lineHeight: 1.5 }}>This will create one editable Word document containing {loading ? 'your' : orders.length} running order{orders.length === 1 ? '' : 's'}. Each room, date and session gets its own page. Exams starting less than 20 minutes after an earlier exam in the same room are shown in Session 2.</p><button onClick={downloadOrders} disabled={!currentSeason || orders.length === 0 || loading || generating} style={{ marginTop: 12, border: 0, borderRadius: 9, padding: '13px 18px', background: generating ? '#9ca3af' : '#5b21b6', color: 'white', fontWeight: 700, fontSize: 16, cursor: generating ? 'wait' : 'pointer' }}>{generating ? 'Creating Word file...' : 'Download all running orders (Word)'}</button>{!loading && currentSeason && rows.length === 0 && <p style={{ color: '#b91c1c', marginBottom: 0 }}>There are no room requirements for this season yet. Upload them in Shift Setup first.</p>}{status && <p style={{ marginBottom: 0, color: status.includes('Downloaded') ? '#166534' : '#374151' }}>{status}</p>}</section></div>;
}
