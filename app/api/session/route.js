import { NextResponse } from 'next/server';
import { getGoogleSheet, getSheetByName } from '@/lib/googleSheets';

export async function POST(req) {
  try {
    const body = await req.json();
    const { teacherId, subject, branchSection, latitude, longitude } = body;

    if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
      return NextResponse.json(
        { success: false, message: 'GPS coordinates are required to create an attendance session.' },
        { status: 400 }
      );
    }

    const doc = await getGoogleSheet();
    const sessionSheet = getSheetByName(doc, ['Active_Sessions', 'ActiveSessions', 'Sessions']);

    if (!sessionSheet) {
      return NextResponse.json(
        { success: false, message: 'Active_Sessions sheet not found in spreadsheet.' },
        { status: 500 }
      );
    }

    const sessionId = `SESS_${Date.now()}`;
    const createdAt = new Date().toISOString();

    // Mapping exact column headers matching Google Sheet Column E & F
    await sessionSheet.addRow({
      Session_ID: sessionId,
      Subject: subject || 'General',
      Branch_Section: branchSection || 'All',
      Teacher_ID: teacherId || '',
      Latitude: String(latitude),
      Longitude: String(longitude),
      Status: 'ACTIVE',
      Created_At: createdAt,
    });

    return NextResponse.json({
      success: true,
      sessionId,
      message: 'Attendance session created with GPS location.',
    });
  } catch (error) {
    console.error('Session Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}