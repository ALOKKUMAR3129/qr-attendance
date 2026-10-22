import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';
import { getDistanceFromLatLonInMeters } from '@/lib/geofence';

export async function POST(req) {
  try {
    const body = await req.json();
    const { sessionId, rollNo, studentName, branchSection, latitude, longitude } = body;

    if (!sessionId || !latitude || !longitude || !rollNo) {
      return NextResponse.json(
        { success: false, message: 'Session ID, Roll No, and Student GPS location are required.' },
        { status: 400 }
      );
    }

    const doc = await getGoogleSheet();
    const sessionSheet = doc.sheetsByTitle['Active_Sessions'];
    const logSheet = doc.sheetsByTitle['Attendance_Logs'];

    if (!sessionSheet || !logSheet) {
      return NextResponse.json(
        { success: false, message: 'Required sheets (Active_Sessions / Attendance_Logs) missing.' },
        { status: 500 }
      );
    }

    // 1. Fetch Session row
    const sessionRows = await sessionSheet.getRows();
    const activeSession = sessionRows.find((row) => row.get('Session_ID') === sessionId);

    if (!activeSession) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired attendance session.' },
        { status: 404 }
      );
    }

    // --- 2. SECTION MISMATCH VALIDATION (CRITICAL FIX) ---
    // Session ka section nikalna: Pehle column se, warna subject se extract karo (e.g. CSIT-2B1)
    const sessionSubject = activeSession.get('Subject') || '';
    const subjectMatch = sessionSubject.match(/CSIT-[0-9A-Z]+/i);
    const sessionSection = (
      activeSession.get('Branch_Section') ||
      activeSession.get('Section') ||
      (subjectMatch ? subjectMatch[0] : '')
    ).trim().toUpperCase();

    // Student ka section
    const studentSec = (branchSection || '').trim().toUpperCase();

    // Agar session kisi specific section ke liye hai, toh check karo dono match ho rahe hain ya nahi
    if (sessionSection && studentSec && sessionSection !== studentSec) {
      return NextResponse.json(
        {
          success: false,
          message: `Access Denied! Ye lecture ${sessionSection} ka hai, jabki aapka section ${studentSec} hai.`,
        },
        { status: 403 }
      );
    }

    // 3. Geofence Verification
    const teacherLat = parseFloat(activeSession.get('Teacher_Lat'));
    const teacherLng = parseFloat(activeSession.get('Teacher_Lng'));
    const allowedRadius = parseFloat(activeSession.get('Radius_Meters')) || 500;

    const distance = getDistanceFromLatLonInMeters(
      teacherLat,
      teacherLng,
      parseFloat(latitude),
      parseFloat(longitude)
    );

    if (distance > allowedRadius) {
      return NextResponse.json(
        {
          success: false,
          distance,
          message: `Out of range! You are ${distance}m away. Must be within ${allowedRadius}m.`,
        },
        { status: 403 }
      );
    }

    // 4. Duplicate Entry Check
    const logRows = await logSheet.getRows();
    const isAlreadyMarked = logRows.some(
      (row) => row.get('Session_ID') === sessionId && String(row.get('Roll_No')).trim() === String(rollNo).trim()
    );

    if (isAlreadyMarked) {
      return NextResponse.json(
        { success: false, message: 'Attendance already marked for this class session!' },
        { status: 409 }
      );
    }

    // 5. Append Attendance Entry
    const now = new Date();
    await logSheet.addRow({
      Timestamp: now.toISOString(),
      Date: now.toISOString().split('T')[0],
      Session_ID: sessionId,
      Roll_No: rollNo,
      Student_Name: studentName || 'Unknown Student',
      Branch_Section: studentSec || sessionSection || 'N/A',
      Subject: sessionSubject || 'General',
      Distance_M: distance,
      Status: 'PRESENT',
    });

    return NextResponse.json({
      success: true,
      distance,
      message: `Attendance marked successfully! Distance: ${distance}m.`,
    });
  } catch (error) {
    console.error('Attendance Error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}