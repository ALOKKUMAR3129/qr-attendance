import { NextResponse } from 'next/server';
import { getGoogleSheet, getSheetByName } from '@/lib/googleSheets';

// Precise Haversine distance formula to calculate distance in meters
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export async function POST(req) {
  try {
    const { sessionId, rollNo, studentName, branchSection, latitude, longitude } = await req.json();

    if (!sessionId || !rollNo) {
      return NextResponse.json(
        { success: false, message: 'Session ID and Roll Number are required.' },
        { status: 400 }
      );
    }

    const doc = await getGoogleSheet();
    const sessionsSheet = getSheetByName(doc, ['Active_Sessions', 'ActiveSessions', 'Sessions']);
    const logsSheet = getSheetByName(doc, ['Attendance_Logs', 'AttendanceLogs', 'Logs']);
    const studentsSheet = getSheetByName(doc, ['Students', 'STUDENTS', 'Student Database']);

    if (!logsSheet) {
      return NextResponse.json(
        { success: false, message: 'Attendance logs sheet not found.' },
        { status: 500 }
      );
    }

    // 1. Fetch Session Details & Teacher GPS Coordinates
    let sessionSubject = 'Lecture';
    let sessionBranch = '';
    let teacherId = '';
    let teacherLat = null;
    let teacherLng = null;

    if (sessionsSheet) {
      const sRows = await sessionsSheet.getRows();
      const currentSession = sRows.find(
        (r) => String(r.get('Session_ID') || '').trim() === String(sessionId).trim()
      );
      if (currentSession) {
        sessionSubject = String(currentSession.get('Subject') || 'Lecture').trim();
        sessionBranch = String(currentSession.get('Branch_Section') || '').trim();
        teacherId = String(currentSession.get('Teacher_ID') || '').trim();

        const rawLat = currentSession.get('Latitude') || currentSession.get('LATITUDE') || currentSession.get('Teacher_Lat');
        const rawLng = currentSession.get('Longitude') || currentSession.get('LONGITUDE') || currentSession.get('Teacher_Lng');

        if (rawLat && rawLng) {
          teacherLat = parseFloat(rawLat);
          teacherLng = parseFloat(rawLng);
        }
      }
    }

    // 2. Strict 100-Meter Geofence Distance Verification
    if (teacherLat !== null && teacherLng !== null && !isNaN(teacherLat) && !isNaN(teacherLng)) {
      if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
        return NextResponse.json({
          success: false,
          message: 'Location access is required. Please turn on your device GPS to verify attendance.'
        }, { status: 403 });
      }

      const studentLat = parseFloat(latitude);
      const studentLng = parseFloat(longitude);

      const distance = getDistanceInMeters(teacherLat, teacherLng, studentLat, studentLng);

      // Maximum allowed radius: 100 meters
      if (distance > 100) {
        return NextResponse.json({
          success: false,
          message: `Location Verification Failed: You are ${distance}m away from the classroom. Maximum permitted range is 100m.`
        }, { status: 403 });
      }
    }

    // 3. Student Registered Section Verification
    let studentSec = String(branchSection || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!studentSec && studentsSheet) {
      const sRows = await studentsSheet.getRows();
      const sObj = sRows.find(
        (r) => String(r.get('ROLL NO') || r.get('Roll_No') || '').trim().toLowerCase() === String(rollNo).trim().toLowerCase()
      );
      if (sObj) {
        studentSec = String(sObj.get('SECTION') || sObj.get('Branch_Section') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      }
    }

    // 4. Batch & Section Matching
    const fullClassText = `${sessionSubject} ${sessionBranch}`.toUpperCase();
    const subBatchMatch = fullClassText.match(/2[A-H][12]/); // e.g., "2A1", "2A2", "2B1"
    const sectionMatch = fullClassText.match(/2[A-H](?![0-9])/); // e.g., "2A", "2B"

    const targetSubBatch = subBatchMatch ? subBatchMatch[0] : null;
    const targetSection = (!targetSubBatch && sectionMatch) ? sectionMatch[0] : (targetSubBatch ? targetSubBatch.slice(0, 2) : null);

    if (targetSubBatch) {
      if (!studentSec.includes(targetSubBatch)) {
        return NextResponse.json({
          success: false,
          message: `Access Denied: This lecture is scheduled for batch ${targetSubBatch}. Your registered section (${studentSec || 'Unknown'}) is not eligible.`
        }, { status: 403 });
      }
    } else if (targetSection) {
      if (!studentSec.includes(targetSection)) {
        return NextResponse.json({
          success: false,
          message: `Access Denied: This lecture is scheduled for Section ${targetSection}. Your registered section (${studentSec || 'Unknown'}) is not eligible.`
        }, { status: 403 });
      }
    }

    const todayIST = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date());

    const currentTimeIST = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(new Date());

    // 5. Duplicate Scan Check
    const logRows = await logsSheet.getRows();
    const cleanRoll = String(rollNo).trim().toLowerCase();
    const cleanSub = sessionSubject.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

    const alreadyMarked = logRows.some((r) => {
      const rowRoll = String(r.get('Roll_No') || r.get('ROLL NO') || '').trim().toLowerCase();
      const rowDate = String(r.get('Date') || '');
      const rowSub = String(r.get('Subject') || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
      const rowStatus = String(r.get('Status') || '').toLowerCase();

      return (
        rowRoll === cleanRoll &&
        rowDate.includes(todayIST) &&
        (rowSub.includes(cleanSub) || cleanSub.includes(rowSub)) &&
        rowStatus === 'present'
      );
    });

    if (alreadyMarked) {
      return NextResponse.json({
        success: true,
        message: 'Attendance already recorded for this lecture.'
      });
    }

    // 6. Save Attendance Entry
    await logsSheet.addRow({
      Roll_No: String(rollNo).trim(),
      Student_Name: studentName || 'Student',
      Branch_Section: studentSec || branchSection || '',
      Subject: sessionSubject,
      Date: todayIST,
      Time: currentTimeIST,
      Status: 'Present',
      Teacher_ID: teacherId
    });

    return NextResponse.json({
      success: true,
      message: 'Attendance verified successfully!'
    });
  } catch (error) {
    console.error('Scan Attendance Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Server error' },
      { status: 500 }
    );
  }
}