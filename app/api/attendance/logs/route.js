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

    const cleanQuery = subject
      ? subject.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '')
      : '';

    const todayIST = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date());

    const logs = [];

    rows.forEach((row, idx) => {
      const rRoll = String(
        row.get('Roll_No') || row.get('Roll_Number') || row.get('User_ID') || ''
      ).trim();

      const rSub = String(row.get('Subject') || '').trim();
      const cleanRowSub = rSub.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

      const rDate = String(row.get('Date') || row.get('Timestamp') || '');

      let isRecent = false;
      if (rDate.includes(todayIST) || rDate.includes(todayIST.replace(/\//g, '-'))) {
        isRecent = true;
      } else {
        const parsedTime = new Date(rDate).getTime();
        isRecent = !isNaN(parsedTime) ? (Date.now() - parsedTime < 18 * 60 * 60 * 1000) : true;
      }

      // 1. Filter by Student RollNo
      if (rollNo && rRoll.toLowerCase() === rollNo.toLowerCase()) {
        logs.push({
          id: `log_${idx}`,
          subject: rSub,
          date: rDate,
          time: String(row.get('Time') || ''),
          status: row.get('Status') || 'Present',
        });
      }
      // 2. Filter by Teacher's Subject for Live Attendance
      else if (cleanQuery && isRecent) {
        if (!cleanQuery || cleanRowSub.includes(cleanQuery) || cleanQuery.includes(cleanRowSub)) {
          logs.push({
            id: `log_${idx}`,
            rollNo: rRoll,
            studentName: row.get('Student_Name') || 'Student',
            subject: rSub,
            time: String(row.get('Time') || ''),
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