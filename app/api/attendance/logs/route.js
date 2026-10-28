import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const rollNo = searchParams.get('rollNo');
    const teacherSubject = searchParams.get('subject');

    const doc = await getGoogleSheet();
    const logSheet = doc.sheetsByTitle['Attendance_Logs'];

    if (!logSheet) {
      return NextResponse.json({ success: true, logs: [] });
    }

    const rows = await logSheet.getRows();
    let filteredRows = rows;

    const now = Date.now();
    const EIGHTEEN_HOURS_MS = 18 * 60 * 60 * 1000;

    if (rollNo) {
      // Student view: Unke saare logged records
      filteredRows = filteredRows.filter(
        (row) =>
          String(row.get('Roll_No') || row.get('Roll_Number') || row.get('User_ID') || '').trim() ===
          String(rollNo).trim()
      );
    } else if (teacherSubject) {
      // Teacher view: Pichhle 18 ghante me is subject ke saare scans (midnight date change resilient)
      const targetSub = teacherSubject.toLowerCase().replace(/[^a-z0-9]/g, '');
      filteredRows = filteredRows.filter((row) => {
        const rowSub = String(row.get('Subject') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const rawTime = row.get('Timestamp') || row.get('Date') || '';
        const logTime = new Date(rawTime).getTime();

        const isRecent = !isNaN(logTime) ? (now - logTime) < EIGHTEEN_HOURS_MS : true;
        return isRecent && (rowSub.includes(targetSub) || targetSub.includes(rowSub));
      });
    } else if (sessionId) {
      filteredRows = filteredRows.filter(
        (row) => String(row.get('Session_ID') || '').trim() === String(sessionId).trim()
      );
    }

    const logs = filteredRows.map((row, idx) => {
      const sName =
        row.get('Student_Name') ||
        row.get('Name') ||
        row.get('Student') ||
        'Student';

      const sRoll =
        row.get('Roll_No') ||
        row.get('Roll_Number') ||
        row.get('Roll') ||
        row.get('User_ID') ||
        '';

      const rawTime = row.get('Timestamp') || '';
      let formattedTime = '';
      if (rawTime) {
        try {
          formattedTime = new Date(rawTime).toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
        } catch {
          formattedTime = rawTime;
        }
      }

      return {
        id: (row.get('Session_ID') || 'sess') + '_' + (sRoll || idx),
        subject: row.get('Subject') || 'General',
        studentName: sName,
        rollNo: sRoll,
        time: formattedTime,
        date: row.get('Date') || '',
        status: row.get('Status') || 'Verified',
      };
    });

    return NextResponse.json({ success: true, logs: logs.reverse() });
  } catch (error) {
    console.error('Fetch logs error:', error);
    return NextResponse.json({ success: false, logs: [], message: error.message }, { status: 500 });
  }
}