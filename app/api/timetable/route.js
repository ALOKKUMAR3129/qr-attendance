import { NextResponse } from 'next/server';
import { getGoogleSheet, getSheetByName } from '@/lib/googleSheets';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');
    const id = searchParams.get('id'); // e.g. "CSIT-2B1" or "T-PARAMITA-01"
    const day = searchParams.get('day'); // e.g. "Thu"

    const doc = await getGoogleSheet();
    const sheet = getSheetByName(doc, ['Timetable', 'TIME TABLE', 'TIMETABLE']);
    const logSheet = getSheetByName(doc, ['Attendance_Logs', 'AttendanceLogs', 'Logs']);

    if (!sheet) return NextResponse.json({ success: true, data: [] });

    const rows = await sheet.getRows();
    const cleanId = (id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Check which classes are already submitted today from Attendance_Logs
    const completedSubjects = new Set();
    if (logSheet) {
      const logRows = await logSheet.getRows();
      const todayIST = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(new Date());

      logRows.forEach((r) => {
        const rDate = String(r.get('Date') || r.get('DATE') || '');
        const rStatus = String(r.get('Status') || r.get('STATUS') || '').trim().toLowerCase();
        const rSub = String(r.get('Subject') || r.get('SUBJECT') || '').trim();

        // Agar kisi subject ke against aaj absent log ho chuka hai, attendance lock ho chuki hai
        if (rDate.includes(todayIST) && rStatus === 'absent' && rSub) {
          const cleanSub = rSub.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
          completedSubjects.add(cleanSub);
        }
      });
    }

    const filtered = rows.filter((row) => {
      const rRole = String(row.get('Role') || '').toLowerCase().trim();
      const rUser = String(row.get('User_ID') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const rDay = String(row.get('Day') || '').trim();

      if (rRole !== (role || '').toLowerCase().trim()) return false;
      if (day && rDay.toLowerCase() !== day.toLowerCase()) return false;

      if (role === 'teacher') {
        return rUser === cleanId;
      } else {
        const baseSection = cleanId.slice(0, -1);
        return rUser === cleanId || rUser === baseSection || rUser.includes(cleanId) || (rUser.includes(baseSection) && !rUser.match(/2[A-H][12]/));
      }
    });

    const data = filtered.map((row, idx) => {
      const subject = row.get('Subject') || '';
      const cleanSub = subject.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
      const isCompleted = completedSubjects.has(cleanSub);

      return {
        // Stable static ID that never changes on refresh
        id: `class_${cleanId}_${row.get('Day') || 'day'}_${idx}`,
        subject: subject,
        time: row.get('Time') || '',
        room: row.get('Room') || '',
        status: isCompleted ? 'Completed' : 'Upcoming'
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}