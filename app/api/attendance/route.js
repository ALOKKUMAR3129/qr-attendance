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

    // Clean subject query (removes brackets like "(CSIT-2B1)" -> "coalab")
    const cleanSubject = (subject || '')
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/[^a-z0-9]/g, '');

    // 1. Collect roll numbers of students who scanned recently
    const presentRolls = new Set();

    logRows.forEach((row) => {
      const rawRowSub = String(row.get('Subject') || '').trim();
      const cleanRowSub = rawRowSub
        .toLowerCase()
        .replace(/\(.*?\)/g, '')
        .replace(/[^a-z0-9]/g, '');

      const rawTime =
        row.get('Timestamp') ||
        row.get('Date') ||
        row.get('Time') ||
        '';
      const logTime = new Date(rawTime).getTime();

      const isRecent = !isNaN(logTime) ? now - logTime < EIGHTEEN_HOURS_MS : true;

      const isSubjectMatch =
        cleanSubject && cleanRowSub
          ? cleanRowSub.includes(cleanSubject) || cleanSubject.includes(cleanRowSub)
          : false;

      if (isRecent && isSubjectMatch) {
        const roll = String(
          row.get('Roll_No') ||
          row.get('Roll_Number') ||
          row.get('User_ID') ||
          row.get('Roll') ||
          ''
        ).trim();

        if (roll) {
          presentRolls.add(roll.toLowerCase());
        }
      }
    });

    // 2. Determine target batch/section dynamically
    const fullSearchText = `${branchSection || ''} ${classTitle || ''} ${subject || ''}`.toUpperCase();

    // Check for specific sub-batch (e.g. 2B1, 2A2) vs whole section (e.g. 2B, 2A)
    const subBatchMatch = fullSearchText.match(/2[A-H][12]/);
    const sectionMatch = fullSearchText.match(/2[A-H]/);

    const targetSubBatch = subBatchMatch ? subBatchMatch[0] : null; // e.g. "2B1"
    const targetSection = sectionMatch ? sectionMatch[0] : null;   // e.g. "2B"

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
      )
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

      let isMatching = false;

      if (targetSubBatch) {
        // Specific lab/tutorial: only students belonging to that exact sub-batch
        isMatching = sec.includes(targetSubBatch);
      } else if (targetSection) {
        // Combined lecture: students belonging to section (e.g. 2B includes 2B1 and 2B2)
        isMatching = sec.includes(targetSection);
      } else {
        isMatching = true;
      }

      if (roll && isMatching) {
        if (!presentRolls.has(roll.toLowerCase())) {
          absentees.push({
            rollNo: roll,
            name: name,
            status: 'Absent',
          });
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Attendance submitted successfully.',
      presentCount: presentRolls.size,
      absentees,
    });
  } catch (error) {
    console.error('Submit Attendance Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}