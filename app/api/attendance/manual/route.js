import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function POST(req) {
  try {
    const body = await req.json();
    const { rollNo, studentName, branchSection, subject, teacherId } = body;

    if (!rollNo || !subject) {
      return NextResponse.json(
        { success: false, message: 'Roll Number aur Subject zaroori hai.' },
        { status: 400 }
      );
    }

    const doc = await getGoogleSheet();
    const logSheet = doc.sheetsByTitle['Attendance_Logs'];

    if (!logSheet) {
      return NextResponse.json(
        { success: false, message: 'Attendance_Logs sheet nahi mili.' },
        { status: 500 }
      );
    }

    const todayIST = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date());

    const currentTimeIST = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(new Date());

    const cleanSubject = (subject || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

    // 1. Check karo student pehle se Present toh nahi hai
    const existingRows = await logSheet.getRows();
    const alreadyPresent = existingRows.some((row) => {
      const rRoll = String(row.get('Roll_No') || row.get('ROLL NO') || '').trim().toLowerCase();
      const rDate = String(row.get('Date') || '');
      const rSub = String(row.get('Subject') || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
      const rStatus = String(row.get('Status') || '').toLowerCase();

      return (
        rRoll === String(rollNo).trim().toLowerCase() &&
        rDate.includes(todayIST) &&
        (rSub.includes(cleanSubject) || cleanSubject.includes(rSub)) &&
        rStatus === 'present'
      );
    });

    if (alreadyPresent) {
      return NextResponse.json({
        success: false,
        message: 'Student already Present mark ho chuka hai!'
      });
    }

    // 2. Google Sheet me Present row insert karo
    await logSheet.addRow({
      Roll_No: String(rollNo).trim(),
      Student_Name: studentName || 'Student',
      Branch_Section: branchSection || '',
      Subject: subject,
      Date: todayIST,
      Time: currentTimeIST,
      Status: 'Present',
      Teacher_ID: teacherId || ''
    });

    return NextResponse.json({
      success: true,
      message: `${studentName || rollNo} successfully Present mark ho gaya!`
    });
  } catch (error) {
    console.error('Manual Attendance Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}