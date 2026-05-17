'use client';

import Link from 'next/link';

export default function AdminHomePage() {
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
        <h1 style={{ margin: 0, fontSize: 34 }}>Admin Dashboard</h1>
        <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.95 }}>
          Manage exam seasons, shifts, invigilators, assignments and reports.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: 18,
        }}
      >
        <DashboardCard
          href="/admin/shift-setup"
          icon="📅"
          title="Shift Setup"
          text="Create exam days and set how many invigilators are needed."
        />

        <DashboardCard
          href="/admin/assign-invigilators"
          icon="✅"
          title="Assign Invigilators"
          text="Assign applicants or manually add invigilators to shifts."
        />

        <DashboardCard
          href="/admin/my-team-today"
          icon="👥"
          title="My Team Today"
          text="See today’s staffing and any gaps"
        />

        <DashboardCard
          href="/admin/exam-timetable"
          icon="📝"
          title="Exam Timetable"
          text="View exams, candidate numbers and upload timetable CSV files."
        />

        <DashboardCard
          href="/admin/invigilators"
          icon="👥"
          title="Manage Invigilators"
          text="Add, edit, activate or deactivate invigilators."
        />

        <DashboardCard
          href="/admin/reports"
          icon="📊"
          title="Reports"
          text="View rota grids, totals and invigilator ratio reports."
        />
      </div>
    </div>
  );
}

function DashboardCard({
  href,
  icon,
  title,
  text,
}: {
  href: string;
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        style={{
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 16,
          padding: 22,
          minHeight: 170,
          boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ fontSize: 30, marginBottom: 10 }}>{icon}</div>

        <h2 style={{ margin: '0 0 8px 0', color: '#4c1d95' }}>
          {title}
        </h2>

        <p style={{ margin: 0, color: '#555', lineHeight: 1.5 }}>
          {text}
        </p>
      </div>
    </Link>
  );
}