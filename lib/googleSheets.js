import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export async function getGoogleSheet() {
  let client_email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let private_key = process.env.GOOGLE_PRIVATE_KEY;

  if (!client_email || !private_key) {
    try {
      const creds = await import('../service-account.json');
      client_email = creds.client_email;
      private_key = creds.private_key;
    } catch (e) {
      // Ignore if file not found in production
    }
  }

  // Newlines decode
  if (private_key) {
    if (
      (private_key.startsWith('"') && private_key.endsWith('"')) ||
      (private_key.startsWith("'") && private_key.endsWith("'"))
    ) {
      private_key = private_key.slice(1, -1);
    }
    private_key = private_key.replace(/\\n/g, '\n');
  }

  const serviceAccountAuth = new JWT({
    email: client_email,
    key: private_key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });

  const doc = new GoogleSpreadsheet('15T414yErEVjIIkLK_TV5-0AXE8XYQxD-s85V8wr_D2Q', serviceAccountAuth);
  await doc.loadInfo();
  return doc;
}