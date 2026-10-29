import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function POST(req) {
  try {
    const { subject, branchSection, classTitle } = await req.json();

    const doc = await getGoogleSheet();
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

    const now = Date.now();
    const EIGHTEEN_HOURS_MS = 18 * 60 * 60 * 1000;
    const cleanSubject = (subject || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Recent present roll numbers
    const presentRolls = new Set();
    logRows.forEach((row) => {
      const rowSub = String(row.get('Subject') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const rawTime = row.get('Timestamp') || row.get('Date') || '';
      const logTime = new Date(rawTime).getTime();

      const isRecent = !isNaN(logTime) ? (now - logTime) < EIGHTEEN_HOURS_MS : true;

      if (isRecent && (rowSub.includes(cleanSubject) || cleanSubject.includes(rowSub))) {
        const roll = String(
          row.get('Roll_No') || row.get('Roll_Number') || row.get('User_ID') || ''
        ).trim();
        if (roll) presentRolls.add(roll);
      }
    });

    // 2. Identify target batch/section dynamically from class title
    // Examples: "CSIT-2A", "CSIT-2A1", "CSIT-2B", "CSIT-2B2"
    const fullSearchText = `${branchSection || ''} ${classTitle || ''} ${subject || ''}`.toUpperCase();

    // Check if it's a specific sub-batch (e.g., 2A1, 2B2, 2H1)
    const subBatchMatch = fullSearchText.match(/2[A-H][12]/);
    // Check if it's an entire section (e.g., 2A, 2B, 2C ... 2H)
    const sectionMatch = fullSearchText.match(/2[A-H]/);

    const targetSubBatch = subBatchMatch ? subBatchMatch[0] : null; // e.g. "2A1"
    const targetSection = sectionMatch ? sectionMatch[0] : null;   // e.g. "2A"

    const absentees = [];

    studentRows.forEach((row) => {
      const roll = String(
        row.get('Roll_No') ||
        row.get('Roll_Number') ||
        row.get('User_ID') ||
        row.get('ID') ||
        row.get('Roll') ||
        ''
      ).trim();

      const name =
        row.get('Name') ||
        row.get('Student_Name') ||
        row.get('Student') ||
        'Student';

      const sec = String(
        row.get('Branch_Section') ||
        row.get('Section') ||
        row.get('Batch') ||
        ''
      ).toUpperCase().replace(/[^A-Z0-9]/g, '');

      let isMatching = false;

      if (targetSubBatch) {
        // Lab / Tutorial: only students of that exact batch (e.g. 2A1)
        isMatching = sec.includes(targetSubBatch);
      } else if (targetSection) {
        // Combined Theory Lecture: all students of that section (e.g. 2A includes 2A1 & 2A2)
        isMatching = sec.includes(targetSection);
      } else {
        isMatching = true;
      }

      if (roll && isMatching && !presentRolls.has(roll)) {
        absentees.push({
          rollNo: roll,
          name: name,
          status: 'Absent',
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Attendance submitted successfully.',
      absentees,
    });
  } catch (error) {
    console.error('Submit Attendance Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}