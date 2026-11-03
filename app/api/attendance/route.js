import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function POST(req) {
  try {
    const { subject, branchSection, classTitle, teacherId } = await req.json();

    const doc = await getGoogleSheet();
    const studentsSheet =
      doc.sheetsByTitle['Students'] ||
      doc.sheetsByTitle['STUDENTS'] ||
      doc.sheetsByTitle['students'] ||
      doc.sheetsByTitle['STUDENT DATABASE'];

    const logSheet =
      doc.sheetsByTitle['Attendance_Logs'] ||
      doc.sheetsByTitle['attendance_logs'] ||
      doc.sheetsByTitle['ATTENDANCE_LOGS'];

    if (!studentsSheet || !logSheet) {
      return NextResponse.json(
        { success: false, message: 'Students or Attendance_Logs sheet not found.' },
        { status: 500 }
      );
    }

    const studentRows = await studentsSheet.getRows();
    const logRows = await logSheet.getRows();

    // 1. Identify Target Batch (e.g. 2A2, 2B1)
    const fullText = `${subject || ''} ${classTitle || ''} ${branchSection || ''}`.toUpperCase();
    const subBatchMatch = fullText.match(/2[A-H][12]/);
    const sectionMatch = fullText.match(/2[A-H](?![0-9])/);

    const targetSubBatch = subBatchMatch ? subBatchMatch[0] : null; // e.g. "2A2"
    const targetSection = (!targetSubBatch && sectionMatch) ? sectionMatch[0] : (targetSubBatch ? targetSubBatch.slice(0, 2) : null);

    const cleanSubject = (subject || '')
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/[^a-z0-9]/g, '');

    // 2. Fetch Present Roll Numbers
    const presentRolls = new Set();
    logRows.forEach((row) => {
      const rSub = String(row.get('Subject') || row.get('SUBJECT') || '')
        .toLowerCase()
        .replace(/\(.*?\)/g, '')
        .replace(/[^a-z0-9]/g, '');

      const roll = String(
        row.get('Roll_No') ||
        row.get('ROLL NO') ||
        row.get('Roll No') ||
        row.get('User_ID') ||
        ''
      ).trim();

      const rStatus = String(row.get('Status') || row.get('STATUS') || '').trim().toLowerCase();

      const isSubMatch = !cleanSubject || rSub.includes(cleanSubject) || cleanSubject.includes(rSub);

      if (isSubMatch && rStatus === 'present' && roll) {
        presentRolls.add(roll.toLowerCase());
      }
    });

    // 3. Filter Students of this Batch / Section
    const absentees = [];
    let matchedTotal = 0;

    studentRows.forEach((row) => {
      // Universal column reading for Students sheet
      const roll = String(
        row.get('ROLL NO') ||
        row.get('Roll_No') ||
        row.get('Roll No') ||
        row.get('User_ID') ||
        row.get('ID') ||
        ''
      ).trim();

      const name = String(
        row.get('NAME ') ||
        row.get('NAME') ||
        row.get('Name') ||
        row.get('Student_Name') ||
        'Student'
      ).trim();

      const sec = String(
        row.get('SECTION') ||
        row.get('Branch_Section') ||
        row.get('Section') ||
        row.get('Batch') ||
        ''
      ).toUpperCase().replace(/[^A-Z0-9]/g, '');

      let isCandidate = false;

      if (targetSubBatch) {
        // e.g. "CSIT2A2".includes("2A2") -> true
        isCandidate = sec.includes(targetSubBatch);
      } else if (targetSection) {
        // e.g. "CSIT2A2".includes("2A") -> true
        isCandidate = sec.includes(targetSection);
      } else {
        isCandidate = true;
      }

      if (roll && isCandidate) {
        matchedTotal++;
        if (!presentRolls.has(roll.toLowerCase())) {
          absentees.push({
            rollNo: roll,
            name: name,
            status: 'Absent'
          });
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Attendance processed successfully.',
      targetBatch: targetSubBatch || targetSection || 'ALL',
      totalCandidates: matchedTotal,
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