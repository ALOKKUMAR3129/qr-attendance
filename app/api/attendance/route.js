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

    const teacherLat = parseFloat(activeSession.get('Teacher_Lat'));
    const teacherLng = parseFloat(activeSession.get('Teacher_Lng'));
    const allowedRadius = parseFloat(activeSession.get('Radius_Meters')) || 500;

    // 2. Calculate Distance
    const distance = getDistanceFromLatLonInMeters(
      teacherLat,
      teacherLng,
      parseFloat(latitude),
      parseFloat(longitude)
    );

    // 3. Geofence Verification (500 meters)
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
      (row) => row.get('Session_ID') === sessionId && row.get('Roll_No') === String(rollNo)
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
      Branch_Section: branchSection || activeSession.get('Branch_Section') || 'N/A',
      Subject: activeSession.get('Subject') || 'General',
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