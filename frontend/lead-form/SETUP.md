# Lead Form Setup Guide

## 1. Deploy to Vercel

The form is already configured in `frontend/vercel.json`. After deploying, it will be available at:
- `https://axkan.art/cuestionario`

## 2. Set up Google Sheets + Email Backend

### Step 1: Create a Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name it "AXKAN Leads"
3. Add these headers in Row 1:
   | A | B | C | D | E | F | G | H | I |
   |---|---|---|---|---|---|---|---|---|
   | Timestamp | Nombre | WhatsApp | Email | Productos | Negocio/Evento | Cantidad | Plazo | Fuente |

### Step 2: Create the Google Apps Script

1. In your Google Sheet, go to **Extensions > Apps Script**
2. Delete the default code and paste the following:

```javascript
// AXKAN Lead Form - Google Apps Script Backend
// This handles: saving to sheet + sending email notification

const NOTIFICATION_EMAIL = 'tu@correo.com'; // Change this to your email
const SHEET_NAME = 'Sheet1'; // Change if your sheet tab has a different name

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Save to Google Sheet
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.name || '',
      data.whatsapp || '',
      data.email || '',
      data.products || '',
      data.company || '',
      data.quantity || '',
      data.timeline || '',
      data.source || ''
    ]);

    // Send email notification
    const subject = `Nuevo Lead AXKAN: ${data.name}`;
    const body = `
NUEVO LEAD - AXKAN Souvenirs
============================

Nombre: ${data.name}
WhatsApp: ${data.whatsapp}
Email: ${data.email}
Negocio/Evento: ${data.company || 'No especificado'}

PROYECTO:
- Productos: ${data.products}
- Cantidad: ${data.quantity}
- Plazo: ${data.timeline}

Fuente: ${data.source || 'Directo'}
Fecha: ${new Date().toLocaleString('es-MX', {timeZone: 'America/Mexico_City'})}

---
Responde por WhatsApp: https://wa.me/${(data.whatsapp || '').replace(/[^0-9]/g, '')}
    `;

    MailApp.sendEmail(NOTIFICATION_EMAIL, subject, body);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Handle preflight CORS requests
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. Change `NOTIFICATION_EMAIL` to your actual email address
4. Click **Save** (Ctrl+S)

### Step 3: Deploy the Script as a Web App

1. Click **Deploy > New deployment**
2. Click the gear icon and select **Web app**
3. Set:
   - Description: "AXKAN Lead Form"
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**
5. **Authorize** when prompted (click through the "unsafe" warning - it's your own script)
6. Copy the **Web app URL** (looks like `https://script.google.com/macros/s/...../exec`)

### Step 4: Add the URL to the Form

Open `frontend/lead-form/lead-form.js` and replace the empty string on this line:

```javascript
const GOOGLE_SCRIPT_URL = '';
```

With your Web App URL:

```javascript
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';
```

### Step 5: Deploy to Vercel

Deploy the updated code. Your lead form is now fully connected!

## 3. Google Ads Configuration

When setting up your Google Ads campaign:

1. **Destination URL**: `https://axkan.art/cuestionario`
2. **UTM Parameters**: Add these to track ad performance:
   - `?utm_source=google&utm_medium=cpc&utm_campaign=YOUR_CAMPAIGN_NAME`
   - Example: `https://axkan.art/cuestionario?utm_source=google&utm_medium=cpc&utm_campaign=souvenirs_mayoreo`
3. **Conversion tracking**: Set up a Google Ads conversion that fires on the success screen URL

The form automatically captures UTM parameters and includes them in the Google Sheet and WhatsApp message.

## How It Works

1. User fills the form (Name, WhatsApp, Email, Product, Quantity, Timeline)
2. On submit:
   - Data is sent to Google Apps Script (saves to Sheet + sends you email)
   - Success screen shows with WhatsApp button
3. User can click WhatsApp button to send you a pre-filled message with all their info
4. You receive: email notification + Google Sheet row + WhatsApp message

## Testing

- The WhatsApp redirect works immediately (no backend setup needed)
- To test the Google Sheets integration, fill the form after adding your Script URL
- Check your Google Sheet and email to confirm data arrives
