import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role'); // 'student' ya 'teacher'
    const identifier = searchParams.get('id'); // teacher ke liye Teacher_ID, student ke liye Branch_Section
    const day = searchParams.get('day') || 'Thu';

    const doc = await getGoogleSheet();
    const sheet = doc.sheetsByTitle['Timetable'];

    if (!sheet) {
      return NextResponse.json({ success: true, data: [] });
    }

    const rows = await sheet.getRows();
    const filtered = rows
      .filter((row) => {
        const matchRole = !role || String(row.get('Role') || '').trim().toLowerCase() === role.trim().toLowerCase();
        const matchDay = !day || String(row.get('Day') || '').trim().toLowerCase() === day.trim().toLowerCase();
        
        // Agar id provide ki hai toh section ya teacher id se match karo
        const sheetUserId = String(row.get('User_ID') || '').trim().toLowerCase();
        const matchId = !identifier || sheetUserId === identifier.trim().toLowerCase();

        return matchRole && matchDay && matchId;
      })
      .map((row, idx) => ({
        id: idx + 1,
        subject: row.get('Subject') || 'Class',
        time: row.get('Time') || '',
        room: row.get('Room') || '',
        status: 'Upcoming'
      }));

    return NextResponse.json({ success: true, data: filtered });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}