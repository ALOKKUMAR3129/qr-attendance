import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');
    const id = searchParams.get('id'); // e.g. "CSIT-2A1" or "T-PARAMITA-01"
    const day = searchParams.get('day'); // e.g. "Mon"

    const doc = await getGoogleSheet();
    const sheet = doc.sheetsByTitle['Timetable'];
    if (!sheet) return NextResponse.json({ success: true, data: [] });

    const rows = await sheet.getRows();
    const cleanId = (id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    const filtered = rows.filter((row) => {
      const rRole = String(row.get('Role') || '').toLowerCase().trim();
      const rUser = String(row.get('User_ID') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const rDay = String(row.get('Day') || '').trim();

      if (rRole !== (role || '').toLowerCase().trim()) return false;
      if (day && rDay.toLowerCase() !== day.toLowerCase()) return false;

      if (role === 'teacher') {
        return rUser === cleanId;
      } else {
        // Student matching:
        // Agar exact batch match ho (CSIT2A1 === CSIT2A1)
        // YA pure section ki class ho (CSIT2A in CSIT2A1)
        const baseSection = cleanId.slice(0, -1); // "CSIT2A1" -> "CSIT2A"
        return rUser === cleanId || rUser === baseSection;
      }
    });

    const data = filtered.map((row, idx) => ({
      id: `tt_${idx}_${Date.now()}`,
      subject: row.get('Subject') || '',
      time: row.get('Time') || '',
      room: row.get('Room') || '',
      status: 'Upcoming'
    }));

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}