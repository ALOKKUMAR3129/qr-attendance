import { NextResponse } from 'next/server';
import { getGoogleSheet, getSheetByName } from '@/lib/googleSheets';

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

    if (!logsSheet) {
      return NextResponse.json(
        { success: false, message: 'Attendance_Logs sheet not found.' },
        { status: 500 }
      );
    }

    // 1. Fetch Session Details from Active_Sessions
    let sessionSubject = 'Lecture';
    let teacherId = '';

    if (sessionsSheet) {
      const sRows = await sessionsSheet.getRows();
      const currentSession = sRows.find(
        (r) => String(r.get('Session_ID') || '').trim() === String(sessionId).trim()
      );
      if (currentSession) {
        sessionSubject = currentSession.get('Subject') || 'Lecture';
        teacherId = currentSession.get('Teacher_ID') || '';
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

    // 2. Prevent Duplicate Scan in Same Session
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

    // 3. Insert Attendance Record into Google Sheets
    await logsSheet.addRow({
      Roll_No: String(rollNo).trim(),
      Student_Name: studentName || 'Student',
      Branch_Section: branchSection || '',
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