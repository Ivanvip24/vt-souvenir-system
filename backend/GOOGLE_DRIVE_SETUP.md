# Google Drive Integration Setup Guide

## Quick Overview
This guide will help you set up Google Drive integration so client-uploaded images (payment proofs and reference images) are stored in your Google Drive folder.

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it "VT Anunciando Files" or similar
4. Click "Create"

## Step 2: Enable Google Drive API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Google Drive API"
3. Click on it and press "Enable"

## Step 3: Create a Service Account

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "Service Account"
3. Fill in:
   - **Service account name:** vtanunciando-storage
   - **Service account ID:** (auto-filled)
4. Click "Create and Continue"
5. Skip optional steps, click "Done"

## Step 4: Generate and Download Keys

1. Click on the service account you just created
2. Go to the "Keys" tab
3. Click "Add Key" → "Create new key"
4. Select "JSON" format
5. Click "Create"
6. The JSON file will download automatically

## Step 5: Move Credentials File

1. Rename the downloaded file to `google-drive-credentials.json`
2. Move it to your backend folder:
   ```
   /backend/google-drive-credentials.json
   ```

⚠️ **IMPORTANT:** This file contains sensitive credentials. Never commit it to Git!

## Step 6: Share Drive Folder with Service Account

1. Open the JSON credentials file
2. Find the `client_email` field (looks like: `xxxxx@xxxxx.iam.gserviceaccount.com`)
3. Copy this email address
4. Open your Google Drive folder: https://drive.google.com/drive/folders/1CgF4LXj1K__VexRZP_QITE8ls0WeosvK
5. Click "Share"
6. Paste the service account email
7. Give it "Editor" permissions
8. Uncheck "Notify people"
9. Click "Share"

## Step 7: Verify Setup

The folder ID is already configured in your `.env` file:
```
GOOGLE_DRIVE_FOLDER_ID=1CgF4LXj1K__VexRZP_QITE8ls0WeosvK
```

## Step 8: Restart Server

```bash
killall -9 node
node demo-server.js
```

You should see: `✅ Google Drive integration configured`

## Testing

1. Go to client order form: http://localhost:3000/order
2. Create a test order
3. Upload a payment proof image
4. Check your Google Drive folder - the image should appear there!
5. The admin dashboard will now show the uploaded images

## Troubleshooting

### "Google Drive not configured" message
- Check that `google-drive-credentials.json` is in the backend folder
- Verify the JSON file is valid (open it and check it's proper JSON)
- Make sure you shared the folder with the service account email

### "No folder ID provided" error
- Check that `GOOGLE_DRIVE_FOLDER_ID` is set in your `.env` file
- Verify it matches your folder ID from the Drive URL

### "Permission denied" error
- Ensure you shared the folder with the service account email from the credentials file
- Give the service account "Editor" permissions, not just "Viewer"

### Files not appearing in dashboard
- Restart the server after adding credentials
- Check browser console for errors
- Verify the image URLs in the order data

## File Organization

All uploaded files will be stored in your Google Drive folder with names like:
- `payment-proof-ORD-001-1699123456789.jpg`
- `reference-image-ORD-001-1-1699123456789.jpg`

## Security Notes

- The `google-drive-credentials.json` file is added to `.gitignore`
- Files are uploaded with public sharing so they can be viewed in the dashboard
- To make files private, modify the `uploadToGoogleDrive` function in `utils/google-drive.js`
- The service account only has access to the specific folder you shared with it

## Next Steps

After setup, images will automatically:
1. Upload to Google Drive when clients submit orders
2. Display in the admin dashboard
3. Be downloadable with a single click
4. Stay organized in your Drive folder

---

Need help? Check the logs when you start the server - they'll tell you if Google Drive is properly configured.
