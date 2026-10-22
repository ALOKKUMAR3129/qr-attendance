import { NextResponse } from 'next/server';
import { getGoogleSheet } from '@/lib/googleSheets';

export async function POST(req) {
  try {
    const body = await req.json();
    const { teacherId, subject, branchSection, latitude, longitude } = body;

    if (!latitude || !longitude) {
      return NextResponse.json(
        { success: false, message: 'GPS coordinates required.' },
        { status: 400 }
      );
    }

    const doc = await getGoogleSheet();
    const sessionSheet = doc.sheetsByTitle['Active_Sessions'];

    if (!sessionSheet) {
      return NextResponse.json(
        { success: false, message: 'Active_Sessions sheet not found in spreadsheet.' },
        { status: 500 }
      );
    }

    const sessionId = `SESS_${Date.now()}`;
    const createdAt = new Date().toISOString();

    await sessionSheet.addRow({
      Session_ID: sessionId,
      Teacher_ID: teacherId || 'TEACHER_1',
      Subject: subject || 'General',
      Branch_Section: branchSection || 'All',
      Teacher_Lat: latitude,
      Teacher_Lng: longitude,
      Radius_Meters: 500,
      Status: 'ACTIVE',
      Created_At: createdAt,
    });

    return NextResponse.json({
      success: true,
      sessionId,
      message: 'Session created successfully.',
    });
  } catch (error) {
    console.error('Session Error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}