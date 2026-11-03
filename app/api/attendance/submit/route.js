import { NextResponse } from 'next/server';
import { getGoogleSheet, getSheetByName } from '@/lib/googleSheets';

export async function POST(req) {
  try {
    const { subject, branchSection, classTitle, teacherId } = await req.json();

    const doc = await getGoogleSheet();
    const studentsSheet = getSheetByName(doc, ['Students', 'STUDENTS', 'Student Database']);
    const logSheet = getSheetByName(doc, ['Attendance_Logs', 'AttendanceLogs', 'Logs']);

    if (!studentsSheet || !logSheet) {
      return NextResponse.json(
        { success: false, message: 'Students or Attendance_Logs sheet not found.' },
        { status: 500 }
      );
    }

    const studentRows = await studentsSheet.getRows();
    const logRows = await logSheet.getRows();

    // 1. Identify Target Batch (e.g. "2A2", "2B1") or entire Section ("2A", "2B")
    const fullText = `${subject || ''} ${classTitle || ''} ${branchSection || ''}`.toUpperCase();
    const subBatchMatch = fullText.match(/2[A-H][12]/);
    const sectionMatch = fullText.match(/2[A-H](?![0-9])/);

    const targetSubBatch = subBatchMatch ? subBatchMatch[0] : null; // e.g. "2A2"
    const targetSection = (!targetSubBatch && sectionMatch) ? sectionMatch[0] : (targetSubBatch ? targetSubBatch.slice(0, 2) : null);

    const cleanSubject = (subject || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

    // 2. Fetch Present Roll Numbers
    const presentRolls = new Set();
    logRows.forEach((row) => {
      const rSub = String(row.get('Subject') || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
      const roll = String(row.get('Roll_No') || row.get('ROLL NO') || '').trim();
      const rStatus = String(row.get('Status') || '').trim().toLowerCase();

      const isSubMatch = !cleanSubject || rSub.includes(cleanSubject) || cleanSubject.includes(rSub);
      if (isSubMatch && rStatus === 'present' && roll) {
        presentRolls.add(roll.toLowerCase());
      }
    });

    const absentees = [];
    let matchedTotal = 0;

    studentRows.forEach((row) => {
      const roll = String(
        row.get('ROLL NO') ||
        row.get('Roll_No') ||
        row.get('Roll No') ||
        row.get('User_ID') ||
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
        ''
      ).toUpperCase().replace(/[^A-Z0-9]/g, '');

      let isCandidate = false;
      if (targetSubBatch) {
        isCandidate = sec.includes(targetSubBatch);
      } else if (targetSection) {
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
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}