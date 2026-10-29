import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rollNo = searchParams.get('rollNo');
    const subject = searchParams.get('subject');

    const doc = await getGoogleSheet();
    const sheet = doc.sheetsByTitle['Attendance_Logs'];

    if (!sheet) {
      return NextResponse.json({ success: true, logs: [] });
    }

    const rows = await sheet.getRows();

    // 18 hours rolling window for today
    const now = Date.now();
    const EIGHTEEN_HOURS_MS = 18 * 60 * 60 * 1000;

    // Clean subject query (e.g. "COA Lab (CSIT-2B1)" -> "coalab")
    const cleanQuery = subject
      ? subject.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '')
      : '';

    const logs = [];

    rows.forEach((row, idx) => {
      const rRoll = String(
        row.get('Roll_No') || row.get('Roll_Number') || row.get('User_ID') || ''
      ).trim();

      const rSub = String(row.get('Subject') || '').trim();
      const cleanRowSub = rSub.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

      const rDate = String(row.get('Date') || '');
      const rawTimestamp = row.get('Timestamp') || rDate;
      const logTime = new Date(rawTimestamp).getTime();

      const isRecent = !isNaN(logTime) ? (now - logTime) < EIGHTEEN_HOURS_MS : true;

      // Filter by Student RollNo
      if (rollNo && rRoll.toLowerCase() === rollNo.toLowerCase()) {
        logs.push({
          id: `log_${idx}`,
          subject: rSub,
          date: rDate || new Date().toISOString().split('T')[0],
          time: new Date(rawTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: row.get('Status') || 'Present',
        });
      }
      // Filter by Teacher's Class/Subject
      else if (cleanQuery && isRecent) {
        if (cleanRowSub.includes(cleanQuery) || cleanQuery.includes(cleanRowSub)) {
          logs.push({
            id: `log_${idx}`,
            rollNo: rRoll,
            studentName: row.get('Student_Name') || 'Student',
            subject: rSub,
            time: new Date(rawTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: row.get('Status') || 'Present',
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