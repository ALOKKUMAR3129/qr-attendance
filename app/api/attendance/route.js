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
    const studentsSheet = getSheetByName(doc, ['Students', 'STUDENTS', 'Student Database']);

    if (!logsSheet) {
      return NextResponse.json(
        { success: false, message: 'Attendance_Logs sheet not found.' },
        { status: 500 }
      );
    }

    // 1. Fetch Session Details from Active_Sessions
    let sessionSubject = 'Lecture';
    let sessionBranch = '';
    let teacherId = '';

    if (sessionsSheet) {
      const sRows = await sessionsSheet.getRows();
      const currentSession = sRows.find(
        (r) => String(r.get('Session_ID') || '').trim() === String(sessionId).trim()
      );
      if (currentSession) {
        sessionSubject = String(currentSession.get('Subject') || 'Lecture').trim();
        sessionBranch = String(currentSession.get('Branch_Section') || '').trim();
        teacherId = String(currentSession.get('Teacher_ID') || '').trim();
      }
    }

    // 2. Student ka Exact Section Verify karo (Passed data ya Students sheet se)
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

    // 3. Strict Batch & Section Cross-Verification
    const fullClassText = `${sessionSubject} ${sessionBranch}`.toUpperCase();
    const subBatchMatch = fullClassText.match(/2[A-H][12]/); // e.g., "2A1", "2A2", "2B1"
    const sectionMatch = fullClassText.match(/2[A-H](?![0-9])/); // e.g., "2A", "2B"

    const targetSubBatch = subBatchMatch ? subBatchMatch[0] : null;
    const targetSection = (!targetSubBatch && sectionMatch) ? sectionMatch[0] : (targetSubBatch ? targetSubBatch.slice(0, 2) : null);

    if (targetSubBatch) {
      // Tutorial ya Lab jo kisi sub-batch ke liye scheduled hai
      if (!studentSec.includes(targetSubBatch)) {
        return NextResponse.json({
          success: false,
          message: `Access Denied: Yeh lecture ${targetSubBatch} ke liye hai. Aapka batch (${studentSec || 'Unknown'}) match nahi karta.`
        }, { status: 403 });
      }
    } else if (targetSection) {
      // Pure section ki common theory class
      if (!studentSec.includes(targetSection)) {
        return NextResponse.json({
          success: false,
          message: `Access Denied: Yeh lecture Section ${targetSection} ke liye hai. Aapka section (${studentSec || 'Unknown'}) match nahi karta.`
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

    // 4. Duplicate Check
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

    // 5. Valid Student Insert to Attendance_Logs
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