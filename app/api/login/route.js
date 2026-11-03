import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function POST(req) {
  try {
    const { role, email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email aur Password zaroori hai.' },
        { status: 400 }
      );
    }

    const doc = await getGoogleSheet();
    const sheet = role === 'teacher'
      ? (doc.sheetsByTitle['Teachers'] || doc.sheetsByTitle['TEACHERS'] || doc.sheetsByTitle['teachers'])
      : (doc.sheetsByTitle['Students'] || doc.sheetsByTitle['STUDENTS'] || doc.sheetsByTitle['students']);

    if (!sheet) {
      return NextResponse.json(
        { success: false, message: `Sheet '${role === 'teacher' ? 'Teachers' : 'Students'}' nahi mili.` },
        { status: 500 }
      );
    }

    const rows = await sheet.getRows();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    const userRow = rows.find((row) => {
      // Email header compatibility: 'Email', 'MAIL ID', 'Mail ID', 'email'
      const rowEmail = String(
        row.get('Email') ||
        row.get('MAIL ID') ||
        row.get('Mail ID') ||
        row.get('mail_id') ||
        row.get('email') ||
        ''
      ).trim().toLowerCase();

      // Password header compatibility: 'Password', 'PASSWORD', 'password'
      const rowPassword = String(
        row.get('Password') ||
        row.get('PASSWORD') ||
        row.get('password') ||
        ''
      ).trim();

      return rowEmail === cleanEmail && rowPassword === cleanPassword;
    });

    if (!userRow) {
      return NextResponse.json(
        { success: false, message: 'Invalid Email or Password. Please check your credentials.' },
        { status: 401 }
      );
    }

    const userData = {
      role,
      name: userRow.get('Name') || userRow.get('NAME ') || userRow.get('NAME') || 'User',
      email: cleanEmail,
      id: String(
        userRow.get('Roll_No') ||
        userRow.get('ROLL NO') ||
        userRow.get('Teacher_ID') ||
        userRow.get('TEACHER_ID') ||
        ''
      ).trim(),
      section: String(
        userRow.get('Branch_Section') ||
        userRow.get('SECTION') ||
        userRow.get('Department') ||
        ''
      ).trim()
    };

    return NextResponse.json({
      success: true,
      message: 'Login successful',
      user: userData
    });
  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}