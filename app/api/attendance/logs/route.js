import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const rollNo = searchParams.get('rollNo');

    const doc = await getGoogleSheet();
    const logSheet = doc.sheetsByTitle['Attendance_Logs'];

    if (!logSheet) {
      return NextResponse.json({ success: true, logs: [] });
    }

    const rows = await logSheet.getRows();
    let filteredRows = rows;

    // Strict session filter taaki purani classes ka data na aaye
    if (sessionId) {
      filteredRows = filteredRows.filter(
        (row) => String(row.get('Session_ID') || '').trim() === String(sessionId).trim()
      );
    } else if (rollNo) {
      filteredRows = filteredRows.filter(
        (row) => String(row.get('Roll_No') || row.get('Roll_Number') || row.get('User_ID') || '').trim() === String(rollNo).trim()
      );
    }

    const logs = filteredRows.map((row, idx) => {
      // Name aur Roll ke alag-alag possible headers check karo
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
      let formattedTime = rawTime;
      if (rawTime) {
        try {
          formattedTime = new Date(rawTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
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
        distance: `${Math.round(parseFloat(row.get('Distance_M')) || 0)}m`,
        status: row.get('Status') || 'Verified',
      };
    });

    return NextResponse.json({ success: true, logs: logs.reverse() });
  } catch (error) {
    console.error('Fetch logs error:', error);
    return NextResponse.json({ success: false, logs: [], message: error.message }, { status: 500 });
  }
}