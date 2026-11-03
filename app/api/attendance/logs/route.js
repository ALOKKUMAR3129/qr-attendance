import { NextResponse } from 'next/server';
import { getGoogleSheet, getSheetByName } from '@/lib/googleSheets';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rollNo = searchParams.get('rollNo');
    const subject = searchParams.get('subject');

    const doc = await getGoogleSheet();
    const sheet = getSheetByName(doc, ['Attendance_Logs', 'AttendanceLogs', 'Logs']);

    if (!sheet) {
      return NextResponse.json({ success: true, logs: [] });
    }

    const rows = await sheet.getRows();
    const cleanQuery = subject
      ? subject.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '')
      : '';

    const logs = [];

    rows.forEach((row, idx) => {
      const rRoll = String(
        row.get('Roll_No') ||
        row.get('ROLL NO') ||
        row.get('Roll No') ||
        row.get('Roll_Number') ||
        row.get('User_ID') ||
        ''
      ).trim();

      const rSub = String(row.get('Subject') || row.get('SUBJECT') || '').trim();
      const cleanRowSub = rSub.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

      const rDate = String(row.get('Date') || row.get('DATE') || '');
      const rTime = String(row.get('Time') || row.get('TIME') || '');
      const rStatus = String(row.get('Status') || row.get('STATUS') || 'Present').trim();

      // Student View: Match by Roll Number
      if (rollNo && rRoll.toLowerCase() === rollNo.trim().toLowerCase()) {
        logs.push({
          id: `log_${idx}`,
          subject: rSub,
          date: rDate,
          time: rTime,
          status: rStatus,
        });
      }
      // Teacher View: Match by Subject for Live Scans
      else if (cleanQuery) {
        const isSubMatch = !cleanQuery || cleanRowSub.includes(cleanQuery) || cleanQuery.includes(cleanRowSub);
        if (isSubMatch && rStatus.toLowerCase() === 'present') {
          logs.push({
            id: `log_${idx}`,
            rollNo: rRoll,
            studentName: row.get('Student_Name') || row.get('NAME ') || row.get('NAME') || 'Student',
            subject: rSub,
            time: rTime,
            status: 'Present',
          });
        }
      }
    });

    return NextResponse.json({ success: true, logs: logs.reverse() });
  } catch (error) {
    console.error('Fetch logs error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}