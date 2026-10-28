import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export async function getGoogleSheet() {
  const sheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    process.env.GOOGLE_CLIENT_EMAIL;

  let privateKey =
    process.env.GOOGLE_PRIVATE_KEY ||
    process.env.GOOGLE_SHEETS_PRIVATE_KEY;

  if (privateKey) {
    // Escape characters clean up for Vercel env
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  if (!sheetId || !clientEmail || !privateKey) {
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