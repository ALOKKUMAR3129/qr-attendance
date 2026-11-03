import { NextResponse } from 'next/server';
import { getGoogleSheet, getSheetByName } from '@/lib/googleSheets';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rollNo = searchParams.get('rollNo');
    const subject = searchParams.get('subject');

    const doc = await getGoogleSheet();
    const sheet = getSheetByName(doc, ['Attendance_Logs', 'AttendanceLogs', 'Logs']);
    const studentsSheet = getSheetByName(doc, ['Students', 'STUDENTS', 'Student Database']);

    if (!sheet) {
      return NextResponse.json({ success: true, logs: [], absentees: [] });
    }

    const rows = await sheet.getRows();
    const cleanQuery = subject
      ? subject.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '')
      : '';

    const todayIST = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date());

    const logs = [];
    const absenteesFromLogs = [];
    const presentRolls = new Set();

    rows.forEach((row, idx) => {
      const rRoll = String(
        row.get('Roll_No') ||
        row.get('ROLL NO') ||
        row.get('Roll No') ||
        row.get('Roll_Number') ||
        row.get('User_ID') ||
        ''
      ).trim();

      const rSub = String(row.get('Subject') || row.get('SUBJECT') || '').trim();
      const cleanRowSub = rSub.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

      const rDate = String(row.get('Date') || row.get('DATE') || '');
      const rTime = String(row.get('Time') || row.get('TIME') || '');
      const rStatus = String(row.get('Status') || row.get('STATUS') || 'Present').trim().toLowerCase();
      const sName = String(row.get('Student_Name') || row.get('NAME ') || row.get('NAME') || 'Student').trim();

      // Student View: Match by Roll Number
      if (rollNo && rRoll.toLowerCase() === rollNo.trim().toLowerCase()) {
        logs.push({
          id: `log_${idx}`,
          subject: rSub,
          date: rDate,
          time: rTime,
          status: rStatus === 'present' ? 'Present' : 'Absent',
        });
      }
      // Teacher View: Match by Subject
      else if (cleanQuery) {
        const isSubMatch = !cleanQuery || cleanRowSub.includes(cleanQuery) || cleanQuery.includes(cleanRowSub);
        if (isSubMatch && rDate.includes(todayIST)) {
          if (rStatus === 'present') {
            presentRolls.add(rRoll.toLowerCase());
            logs.push({
              id: `log_${idx}`,
              rollNo: rRoll,
              studentName: sName,
              subject: rSub,
              time: rTime,
              status: 'Present',
            });
          } else if (rStatus === 'absent') {
            absenteesFromLogs.push({
              rollNo: rRoll,
              name: sName,
              status: 'Absent',
            });
          }
        }
      }
    });

    // If absent rows are already in Attendance_Logs, use them.
    // Otherwise calculate from Students sheet for this batch.
    let finalAbsentees = absenteesFromLogs;

    if (cleanQuery && finalAbsentees.length === 0 && studentsSheet) {
      const subBatchMatch = subject.toUpperCase().match(/2[A-H][12]/);
      const sectionMatch = subject.toUpperCase().match(/2[A-H](?![0-9])/);
      const targetSubBatch = subBatchMatch ? subBatchMatch[0] : null;
      const targetSection = (!targetSubBatch && sectionMatch) ? sectionMatch[0] : (targetSubBatch ? targetSubBatch.slice(0, 2) : null);

      if (targetSubBatch || targetSection) {
        const studentRows = await studentsSheet.getRows();
        studentRows.forEach((sRow) => {
          const sRoll = String(sRow.get('ROLL NO') || sRow.get('Roll_No') || sRow.get('User_ID') || '').trim();
          const sName = String(sRow.get('NAME ') || sRow.get('NAME') || sRow.get('Name') || 'Student').trim();
          const sSec = String(sRow.get('SECTION') || sRow.get('Branch_Section') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

          const isCandidate = targetSubBatch
            ? sSec.includes(targetSubBatch)
            : (targetSection ? sSec.includes(targetSection) : false);

          if (sRoll && isCandidate && !presentRolls.has(sRoll.toLowerCase())) {
            finalAbsentees.push({
              rollNo: sRoll,
              name: sName,
              status: 'Absent',
            });
          }
        });
      }
    }

    return NextResponse.json({
      success: true,
      logs: logs.reverse(),
      absentees: finalAbsentees,
    });
  } catch (error) {
    console.error('Fetch logs error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}