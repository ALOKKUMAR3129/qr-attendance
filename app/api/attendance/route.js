import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';
import { calculateDistance } from '@/lib/geofence';

export async function POST(req) {
  try {
    const { sessionId, rollNo, studentName, branchSection, latitude, longitude } = await req.json();

    if (!sessionId || !rollNo || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { success: false, message: 'Missing required scan data.' },
        { status: 400 }
      );
    }

    const doc = await getGoogleSheet();
    const sessionSheet = doc.sheetsByTitle['Active_Sessions'];
    const logSheet = doc.sheetsByTitle['Attendance_Logs'];

    if (!sessionSheet || !logSheet) {
      return NextResponse.json(
        { success: false, message: 'Required database sheets not found.' },
        { status: 500 }
      );
    }

    // 1. Session dhoondo
    const sessionRows = await sessionSheet.getRows();
    const activeSession = sessionRows.find(
      (r) => String(r.get('Session_ID')).trim() === String(sessionId).trim()
    );

    if (!activeSession) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired session QR code.' },
        { status: 400 }
      );
    }

    const teacherLat = parseFloat(activeSession.get('Teacher_Lat'));
    const teacherLng = parseFloat(activeSession.get('Teacher_Lng'));
    const subject = activeSession.get('Subject') || 'General';

    // 2. Geofence check (500m)
    const distanceMeters = calculateDistance(latitude, longitude, teacherLat, teacherLng);
    if (distanceMeters > 500) {
      return NextResponse.json(
        {
          success: false,
          distance: Math.round(distanceMeters),
          message: `Outside geofence! You are ${Math.round(distanceMeters)}m away (Max allowed: 500m).`,
        },
        { status: 403 }
      );
    }

    // 3. Strict Duplicate Check: Same Date + Same Subject + Same Roll No
    const todayIST = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const cleanSub = subject.toLowerCase().replace(/[^a-z0-9]/g, '');
    const logRows = await logSheet.getRows();

    const alreadyMarked = logRows.some((row) => {
      const rRoll = String(row.get('Roll_No') || row.get('Roll_Number') || row.get('User_ID') || '').trim();
      const rDate = String(row.get('Date') || row.get('Timestamp') || '').split('T')[0].trim();
      const rSub = String(row.get('Subject') || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      return rRoll === String(rollNo).trim() && rDate === todayIST && (rSub.includes(cleanSub) || cleanSub.includes(rSub));
    });

    if (alreadyMarked) {
      return NextResponse.json({
        success: false,
        message: 'Attendance already marked for this lecture today!',
      });
    }

    // 4. Save entry in Google Sheets
    await logSheet.addRow({
      Timestamp: new Date().toISOString(),
      Date: todayIST,
      Session_ID: sessionId,
      Roll_No: rollNo,
      Student_Name: studentName || 'Student',
      Branch_Section: branchSection || 'General',
      Subject: subject,
      Distance_M: Math.round(distanceMeters),
      Status: 'Present',
    });

    return NextResponse.json({
      success: true,
      distance: Math.round(distanceMeters),
      message: 'Attendance marked successfully!',
    });
  } catch (error) {
    console.error('Attendance Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}