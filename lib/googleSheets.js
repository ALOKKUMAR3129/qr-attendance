import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export async function getGoogleSheet() {
  const sheetId =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    process.env.GOOGLE_SHEET_ID ||
    process.env.SPREADSHEET_ID;

  const clientEmail =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    process.env.GOOGLE_CLIENT_EMAIL ||
    process.env.CLIENT_EMAIL;

  let privateKey =
    process.env.GOOGLE_PRIVATE_KEY ||
    process.env.GOOGLE_SHEETS_PRIVATE_KEY ||
    process.env.PRIVATE_KEY;

  if (privateKey) {
    privateKey = privateKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
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

// Universal Sheet Finder: Handles casing, spaces, trailing spaces, and underscores
export function getSheetByName(doc, targetNames) {
  const allTitles = Object.keys(doc.sheetsByTitle);
  const targets = Array.isArray(targetNames) ? targetNames : [targetNames];

  for (const target of targets) {
    const cleanTarget = target.trim().toLowerCase().replace(/[\s_-]/g, '');
    for (const title of allTitles) {
      const cleanTitle = title.trim().toLowerCase().replace(/[\s_-]/g, '');
      if (cleanTitle === cleanTarget) {
        return doc.sheetsByTitle[title];
      }
    }
  }
  return null;
}