import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export async function getGoogleSheet() {
  // Check all possible aliases for Sheet ID
  const sheetId =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    process.env.GOOGLE_SHEET_ID ||
    process.env.SPREADSHEET_ID;

  // Check all possible aliases for Email
  const clientEmail =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    process.env.GOOGLE_CLIENT_EMAIL ||
    process.env.CLIENT_EMAIL;

  // Check all possible aliases for Private Key
  let privateKey =
    process.env.GOOGLE_PRIVATE_KEY ||
    process.env.GOOGLE_SHEETS_PRIVATE_KEY ||
    process.env.PRIVATE_KEY;

  if (privateKey) {
    // Handle quotes & escape characters from Vercel
    privateKey = privateKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
  }

  if (!sheetId || !clientEmail || !privateKey) {
    console.error('Debug Env Check:', {
      hasSheetId: !!sheetId,
      hasEmail: !!clientEmail,
      hasKey: !!privateKey
    });
    throw new Error('Missing Google Sheets API environment variables.');
  }

  const serviceAccountAuth = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
  await doc.loadInfo();
  return doc;
}