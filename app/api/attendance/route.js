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

    // 1. Identify Target Batch strictly
    // Strings like: "DS Training Lab (CSIT-2G1)", "CSIT-2G1", "2G1", "CSIT-2G"
    const fullText = `${subject || ''} ${classTitle || ''} ${branchSection || ''}`.toUpperCase();

    // Check for 2A1 - 2H2
    const subBatchMatch = fullText.match(/2[A-H][12]/);
    // Check for 2A - 2H (entire section)
    const sectionMatch = fullText.match(/2[A-H](?![0-9])/);

    const targetSubBatch = subBatchMatch ? subBatchMatch[0] : null; // e.g., "2G1"
    const targetSection = (!targetSubBatch && sectionMatch) ? sectionMatch[0] : (targetSubBatch ? targetSubBatch.slice(0, 2) : null); // e.g., "2G"

    // Base Subject without brackets or section
    const cleanSubject = (subject || '')
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/[^a-z0-9]/g, '');

    // 2. Fetch Present Students from Logs (Today / Recent)
    const presentRolls = new Set();
    const todayIST = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date()); // e.g. "31/10/2026"

    logRows.forEach((row) => {
      const rSub = String(row.get('Subject') || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
      const rDate = String(row.get('Date') || row.get('Timestamp') || '');
      const roll = String(row.get('Roll_No') || row.get('Roll_Number') || row.get('User_ID') || '').trim();

      // Check subject match
      const subMatches = !cleanSubject || rSub.includes(cleanSubject) || cleanSubject.includes(rSub);

      // Check if logged today or recent
      let dateMatches = false;
      if (rDate.includes(todayIST) || rDate.includes(todayIST.replace(/\//g, '-'))) {
        dateMatches = true;
      } else {
        const parsedTime = new Date(rDate).getTime();
        if (!isNaN(parsedTime) && (Date.now() - parsedTime < 18 * 60 * 60 * 1000)) {
          dateMatches = true;
        } else if (isNaN(parsedTime)) {
          dateMatches = true; // Fallback if timestamp string format is custom
        }
      }

      if (roll && subMatches && dateMatches) {
        presentRolls.add(roll.toLowerCase());
      }
    });

    // 3. Filter only students belonging to this Batch / Section
    const absentees = [];
    let matchedTotal = 0;

    studentRows.forEach((row) => {
      const roll = String(
        row.get('Roll_No') ||
        row.get('Roll_Number') ||
        row.get('User_ID') ||
        row.get('ID') ||
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

      let isCandidate = false;

      if (targetSubBatch) {
        // Specific lab/tut: only students of 2G1 (e.g. CSIT2G1)
        isCandidate = sec.includes(targetSubBatch);
      } else if (targetSection) {
        // Combined lecture: only students of section 2G (e.g. CSIT2G1 & CSIT2G2)
        isCandidate = sec.includes(targetSection);
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
      message: 'Attendance submitted successfully.',
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