import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function POST(req) {
  try {
    const { subject, branchSection, classTitle } = await req.json();

    const doc = await getGoogleSheet();
    // Google Sheet ke potential student tabs
    const studentsSheet =
      doc.sheetsByTitle['Students'] ||
      doc.sheetsByTitle['Users'] ||
      doc.sheetsByTitle['Student_List'];

    const logSheet = doc.sheetsByTitle['Attendance_Logs'];

    if (!studentsSheet || !logSheet) {
      return NextResponse.json(
        { success: false, message: 'Students or Attendance_Logs sheet not found.' },
        { status: 500 }
      );
    }

    const studentRows = await studentsSheet.getRows();
    const logRows = await logSheet.getRows();

    const todayIST = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    // Clean subject name (e.g., "Operating Systems" -> "operatingsystems")
    const cleanSubject = (subject || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Aaj ke present roll numbers nikaalo
    const presentRolls = new Set();
    logRows.forEach((row) => {
      const rowDate = String(row.get('Date') || row.get('Timestamp') || '').split('T')[0].trim();
      const rowSub = String(row.get('Subject') || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      if (rowDate === todayIST && (rowSub.includes(cleanSubject) || cleanSubject.includes(rowSub))) {
        const roll = String(
          row.get('Roll_No') || row.get('Roll_Number') || row.get('User_ID') || ''
        ).trim();
        if (roll) presentRolls.add(roll);
      }
    });

    // 2. Extract section text (e.g. from "CSIT-2B1" or "Operating Systems (CSIT-2B1)")
    const fullSearchText = `${branchSection || ''} ${classTitle || ''} ${subject || ''}`.toLowerCase();
    
    // Detect batch pattern like 2b1, 2b2, etc.
    const batchMatch = fullSearchText.match(/2b\d|csit[_-]?2b\d/);
    const targetBatch = batchMatch ? batchMatch[0].replace(/[^a-z0-9]/g, '') : '';

    const absentees = [];

    studentRows.forEach((row) => {
      const role = String(row.get('Role') || 'student').toLowerCase();
      if (role !== 'student') return;

      const roll = String(
        row.get('Roll_No') ||
        row.get('Roll_Number') ||
        row.get('User_ID') ||
        row.get('ID') ||
        row.get('Roll') ||
        ''
      ).trim();

      const name =
        row.get('Student_Name') ||
        row.get('Name') ||
        row.get('Student') ||
        'Student';

      const sec = String(
        row.get('Section') ||
        row.get('Branch_Section') ||
        row.get('Batch') ||
        ''
      )
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      // Check section match: agar batch detect hua hai toh batch match ho, nahi toh all students
      const isMatchingSection = !targetBatch || sec.includes(targetBatch) || targetBatch.includes(sec);

      if (roll && isMatchingSection && !presentRolls.has(roll)) {
        absentees.push({
          rollNo: roll,
          name: name,
          status: 'Absent',
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Attendance submitted.',
      absentees,
    });
  } catch (error) {
    console.error('Submit Attendance Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}