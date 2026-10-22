import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function POST(req) {
  try {
    const { subject, branchSection } = await req.json();

    const doc = await getGoogleSheet();
    // Sheet tab dhoondo: Students ya Users ya Enrolled_Students
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

    // Today in IST
    const todayIST = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const targetSub = (subject || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Aaj ke present roll numbers collect karo
    const presentRolls = new Set();
    logRows.forEach((row) => {
      const rowDate = String(row.get('Date') || row.get('Timestamp') || '').split('T')[0].trim();
      const rowSub = String(row.get('Subject') || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      if (rowDate === todayIST && (rowSub.includes(targetSub) || targetSub.includes(rowSub))) {
        const roll = String(
          row.get('Roll_No') || row.get('Roll_Number') || row.get('User_ID') || ''
        ).trim();
        if (roll) presentRolls.add(roll);
      }
    });

    // Extract Section code (jaise "CSIT-2B1" me se "2b1")
    const cleanSectionTarget = (branchSection || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

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

      // Agar section match ho raha ho (jaise 2b1 in csit2b1)
      const isSameSection =
        !cleanSectionTarget ||
        !sec ||
        cleanSectionTarget.includes(sec) ||
        sec.includes(cleanSectionTarget);

      if (roll && isSameSection && !presentRolls.has(roll)) {
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