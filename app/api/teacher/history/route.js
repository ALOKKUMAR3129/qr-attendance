import { NextResponse } from 'next/server';
import { getGoogleSheet, getSheetByName } from '@/lib/googleSheets';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get('teacherId');
    const selectedDate = searchParams.get('date'); // Format expected: YYYY-MM-DD

    if (!teacherId) {
      return NextResponse.json({ success: false, message: 'Teacher ID zaroori hai.' }, { status: 400 });
    }

    const doc = await getGoogleSheet();
    const logsSheet = getSheetByName(doc, ['Attendance_Logs', 'AttendanceLogs', 'Logs']);

    if (!logsSheet) {
      return NextResponse.json({ success: true, history: [] });
    }

    const rows = await logsSheet.getRows();

    // Convert requested date (YYYY-MM-DD) into DD/MM/YYYY for Google Sheet matching
    let formattedSearchDate = '';
    if (selectedDate) {
      const [y, m, d] = selectedDate.split('-');
      formattedSearchDate = `${d}/${m}/${y}`;
    }

    const cleanTeacherId = teacherId.trim().toLowerCase();

    // Map to group lectures conducted by this teacher on the specified date
    const lecturesMap = new Map();

    rows.forEach((row, idx) => {
      const rTeacher = String(row.get('Teacher_ID') || '').trim().toLowerCase();
      const rDate = String(row.get('Date') || row.get('DATE') || '').trim();
      const rSub = String(row.get('Subject') || row.get('SUBJECT') || 'Lecture').trim();
      const rRoll = String(row.get('Roll_No') || row.get('ROLL NO') || '').trim();
      const rName = String(row.get('Student_Name') || row.get('NAME ') || 'Student').trim();
      const rStatus = String(row.get('Status') || 'Present').trim();
      const rTime = String(row.get('Time') || '').trim();

      // Check if row belongs to teacher and matches chosen date
      const isTeacherMatch = !rTeacher || rTeacher === cleanTeacherId;
      const isDateMatch = !formattedSearchDate || rDate.includes(formattedSearchDate) || rDate === selectedDate;

      if (isTeacherMatch && isDateMatch && rSub) {
        if (!lecturesMap.has(rSub)) {
          lecturesMap.set(rSub, {
            subject: rSub,
            date: rDate,
            students: []
          });
        }

        lecturesMap.get(rSub).students.push({
          id: `hist_${idx}`,
          rollNo: rRoll,
          name: rName,
          status: rStatus,
          time: rTime
        });
      }
    });

    const historyData = Array.from(lecturesMap.values()).map((lecture) => {
      const presents = lecture.students.filter((s) => s.status.toLowerCase() === 'present');
      const absents = lecture.students.filter((s) => s.status.toLowerCase() === 'absent');
      return {
        subject: lecture.subject,
        date: lecture.date,
        presentCount: presents.length,
        absentCount: absents.length,
        totalCount: lecture.students.length,
        students: lecture.students
      };
    });

    return NextResponse.json({ success: true, history: historyData });
  } catch (error) {
    console.error('Teacher history error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}