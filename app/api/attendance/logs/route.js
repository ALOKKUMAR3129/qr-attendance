import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rollNo = searchParams.get('rollNo');

    const doc = await getGoogleSheet();
    const sheet = doc.sheetsByTitle['Attendance_Logs'];

    if (!sheet) {
      return NextResponse.json({ success: true, logs: [], stats: {} });
    }

    const rows = await sheet.getRows();
    
    const studentRows = rollNo
      ? rows.filter((r) => String(r.get('Roll_No') || '').trim() === String(rollNo).trim())
      : rows;

    const logs = studentRows.map((r, i) => ({
      id: i + 1,
      subject: r.get('Subject') || 'Class',
      date: r.get('Date') || '',
      time: r.get('Timestamp') || '',
      distance: `${r.get('Distance_M') || 0}m`,
      status: r.get('Status') || 'Present'
    })).reverse();

    // Subject-wise attendance calculation
    const subjectStats = {};
    studentRows.forEach((r) => {
      const sub = r.get('Subject') || 'General';
      if (!subjectStats[sub]) {
        subjectStats[sub] = { attended: 0, total: 0 };
      }
      subjectStats[sub].attended += 1;
      subjectStats[sub].total += 1; 
    });

    return NextResponse.json({
      success: true,
      logs,
      totalAttended: studentRows.length,
      subjectStats
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}