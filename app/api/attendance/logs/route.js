import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rollNo = searchParams.get('rollNo');
    const subject = searchParams.get('subject');

    const doc = await getGoogleSheet();
    const sheet =
      doc.sheetsByTitle['Attendance_Logs'] ||
      doc.sheetsByTitle['attendance_logs'] ||
      doc.sheetsByTitle['ATTENDANCE_LOGS'];

    if (!sheet) {
      return NextResponse.json({ success: true, logs: [] });
    }

    const rows = await sheet.getRows();

    // Clean query (e.g. "DS Tutorial (CSIT-2A2)" -> "dstutorial")
    const cleanQuery = subject
      ? subject.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '')
      : '';

    const logs = [];

    rows.forEach((row, idx) => {
      // Universal Roll No Header check
      const rRoll = String(
        row.get('Roll_No') ||
        row.get('ROLL NO') ||
        row.get('Roll No') ||
        row.get('Roll_Number') ||
        row.get('User_ID') ||
        ''
      ).trim();

      // Universal Subject Header check
      const rSub = String(row.get('Subject') || row.get('SUBJECT') || '').trim();
      const cleanRowSub = rSub.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

      const rDate = String(row.get('Date') || row.get('DATE') || row.get('Timestamp') || '');
      const rTime = String(row.get('Time') || row.get('TIME') || '');
      const rStatus = String(row.get('Status') || row.get('STATUS') || 'Present').trim();

      // 1. Student Portal Check (by Roll No)
      if (rollNo && rRoll.toLowerCase() === rollNo.trim().toLowerCase()) {
        logs.push({
          id: `log_${idx}`,
          subject: rSub,
          date: rDate,
          time: rTime,
          status: rStatus,
        });
      }
      // 2. Teacher Portal Check (by Subject for Live Scans)
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