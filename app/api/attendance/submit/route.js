import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function POST(req) {
  try {
    const { subject, branchSection } = await req.json();

    const doc = await getGoogleSheet();
    const studentsSheet = doc.sheetsByTitle['Students'] || doc.sheetsByTitle['Users'];
    const logSheet = doc.sheetsByTitle['Attendance_Logs'];

    if (!studentsSheet || !logSheet) {
      return NextResponse.json(
        { success: false, message: 'Students or Attendance_Logs sheet missing.' },
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

    const targetSub = (subject || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Aaj ke present students
    const presentRolls = new Set();
    logRows.forEach((row) => {
      const rowDate = String(row.get('Date') || row.get('Timestamp') || '').split('T')[0].trim();
      const rowSub = String(row.get('Subject') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (rowDate === todayIST && (rowSub.includes(targetSub) || targetSub.includes(rowSub))) {
        const roll = String(row.get('Roll_No') || row.get('Roll_Number') || row.get('User_ID') || '').trim();
        if (roll) presentRolls.add(roll);
      }
    });

    // 2. Is section ke saare enrolled students nikalna
    const targetSec = (branchSection || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const absentees = [];

    studentRows.forEach((row) => {
      const role = String(row.get('Role') || 'student').toLowerCase();
      if (role !== 'student') return;

      const roll = String(row.get('Roll_No') || row.get('Roll_Number') || row.get('User_ID') || row.get('ID') || '').trim();
      const name = row.get('Name') || row.get('Student_Name') || 'Student';
      const sec = String(row.get('Section') || row.get('Branch_Section') || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      // Agar section match ho raha hai (ya targetSec empty hai) aur student present nahi hai
      if ((!targetSec || sec.includes(targetSec) || targetSec.includes(sec)) && !presentRolls.has(roll)) {
        absentees.push({
          rollNo: roll,
          name: name,
          status: 'Absent',
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Attendance locked and submitted successfully.',
      absentees,
    });
  } catch (error) {
    console.error('Submit Attendance Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}