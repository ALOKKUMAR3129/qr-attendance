import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function POST(req) {
  try {
    const { role, email, password } = await req.json();

    if (!email || !password || !role) {
      return NextResponse.json(
        { success: false, message: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const doc = await getGoogleSheet();
    const sheetTitle = role === 'teacher' ? 'Teachers' : 'Students';
    const sheet = doc.sheetsByTitle[sheetTitle];

    if (!sheet) {
      return NextResponse.json(
        { success: false, message: `Sheet '${sheetTitle}' not found in Google Spreadsheet.` },
        { status: 500 }
      );
    }

    const rows = await sheet.getRows();
    const userRow = rows.find(
      (r) =>
        r.get('Email')?.trim().toLowerCase() === email.trim().toLowerCase() &&
        String(r.get('Password') || '').trim() === String(password).trim()
    );

    if (!userRow) {
      return NextResponse.json(
        { success: false, message: 'Invalid Email or Password. Please check your credentials.' },
        { status: 401 }
      );
    }

    const userData = {
      role,
      email: userRow.get('Email'),
      name: userRow.get('Name'),
      id: role === 'teacher' ? userRow.get('Teacher_ID') : userRow.get('Roll_No'),
      section: role === 'teacher' ? userRow.get('Department') : userRow.get('Branch_Section'),
    };

    return NextResponse.json({ success: true, user: userData });
  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}