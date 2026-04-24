# Google Drive Setup Guide

## Why Google Drive?

To display images in Notion, they must be hosted at a public URL. Google Drive provides free hosting and the script automatically uploads images there.

**Without this setup:**
- ✅ PDFs will show images perfectly
- ❌ Notion will only show file paths (not actual images)

**With this setup:**
- ✅ PDFs show images
- ✅ Notion displays images beautifully

---

## One-Time Setup (15 minutes)

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account (use your work Gmail)
3. Click **"Select a Project"** dropdown (top bar)
4. Click **"NEW PROJECT"**
5. Enter project name: **"VT Orders Image Hosting"**
6. Click **"CREATE"**
7. Wait for project creation (notification will appear)

### Step 2: Enable Google Drive API

1. With your new project selected, go to:
   [https://console.cloud.google.com/apis/library](https://console.cloud.google.com/apis/library)
2. Search for **"Google Drive API"**
3. Click **"Google Drive API"** from results
4. Click **"ENABLE"**
5. Wait for API to be enabled

### Step 3: Configure OAuth Consent Screen

1. Go to [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
2. Select **"External"** user type
3. Click **"CREATE"**
4. Fill in required fields:
   - **App name:** VT Orders System
   - **User support email:** Your Gmail
   - **Developer contact:** Your Gmail
5. Click **"SAVE AND CONTINUE"**
6. On **"Scopes"** page, click **"SAVE AND CONTINUE"** (no changes needed)
7. On **"Test users"** page:
   - Click **"+ ADD USERS"**
   - Enter your Gmail address
   - Click **"ADD"**
8. Click **"SAVE AND CONTINUE"**
9. Review and click **"BACK TO DASHBOARD"**

### Step 4: Create OAuth 2.0 Credentials

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **"+ CREATE CREDENTIALS"** (top bar)
3. Select **"OAuth client ID"**
4. If prompted to configure consent screen, follow Step 3 above
5. For **"Application type"**, select **"Desktop app"**
6. Name: **"VT Orders Desktop"**
7. Click **"CREATE"**
8. A dialog appears with client ID and secret
9. Click **"DOWNLOAD JSON"**
10. **IMPORTANT:** Rename the downloaded file to **`credentials.json`**
11. Move **`credentials.json`** to your ORDERS_REPOSITORY folder

---

## File Placement

Your folder should look like this:

```
ORDERS_REPOSITORY/
├── notion_quick.py
├── credentials.json          ← Place downloaded file here
├── .env
├── config.yaml
└── ...other files
```

**Security Note:** `credentials.json` is git-ignored and won't be committed to version control.

---

## First-Time Authentication

### When you run the script for the first time:

1. Run: `python3 notion_quick.py`
2. A browser window will open automatically
3. Sign in with your Google account (use the one from Step 3)
4. You'll see: **"Google hasn't verified this app"**
   - Click **"Advanced"**
   - Click **"Go to VT Orders System (unsafe)"** (it's safe, it's your app!)
5. Grant permissions:
   - Check **"See, edit, create, and delete only the specific Google Drive files you use with this app"**
   - Click **"Continue"**
6. You'll see: **"The authentication flow has completed"**
7. Close the browser tab

**Done!** The script will create `token.pickle` to remember your login.

---

## How It Works

Once configured, every time you create an order:

1. Script uploads images to your Google Drive folder
2. Images are made publicly viewable (anyone with link can view)
3. Notion uses the Google Drive links to display images
4. Images appear both in Notion AND PDF

---

## Troubleshooting

### Error: "credentials.json not found"

**Solution:**
- Verify `credentials.json` is in the ORDERS_REPOSITORY folder
- Check the filename is exactly `credentials.json` (not `credentials.json.txt`)

### Error: "Google hasn't verified this app"

**Solution:**
- This is expected! Click "Advanced" → "Go to VT Orders System (unsafe)"
- Your app is safe, Google just hasn't reviewed it (not needed for personal use)

### Error: "Access blocked: VT Orders System has not completed verification"

**Solution:**
- Make sure you added yourself as a test user (Step 3.7)
- Go back to [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
- Add your email under "Test users"

### Images not showing in Notion

**Checklist:**
1. ✓ `credentials.json` exists in folder
2. ✓ Completed first-time authentication
3. ✓ Google Drive folder ID is in `.env`
4. ✓ Folder is shared with "Anyone with the link"

**Verify folder permissions:**
1. Open your Google Drive folder
2. Right-click → "Share"
3. Click "Change to anyone with the link"
4. Set permission to "Viewer"
5. Click "Done"

### Error: "Token has been expired or revoked"

**Solution:**
- Delete `token.pickle` file
- Run script again to re-authenticate

---

## Advanced: Using Service Account (Optional)

For automated deployments without browser authentication:

1. Create a service account in Google Cloud Console
2. Download service account JSON key
3. Modify `notion_quick.py` to use service account credentials
4. Share Google Drive folder with service account email

(Contact developer for implementation details)

---

## Security Notes

### What's Safe:
- ✅ `credentials.json` - OAuth client ID (like a username)
- ✅ `token.pickle` - Your personal login token (like a password)
- ✅ Both are git-ignored and won't be shared publicly

### What to Protect:
- ⚠️ Never commit `credentials.json` or `token.pickle` to Git
- ⚠️ Never share these files publicly
- ⚠️ If compromised, delete them in Google Cloud Console

### Permissions Granted:
- Script can only access files **it creates** in Google Drive
- Cannot access your existing Drive files
- Cannot delete files created by other apps
- Minimal, safe permissions

---

## Quick Reference

**Files:**
- `credentials.json` - OAuth client credentials (download from Google Cloud)
- `token.pickle` - Auto-generated after first login (keeps you logged in)

**URLs:**
- Google Cloud Console: https://console.cloud.google.com/
- APIs & Services: https://console.cloud.google.com/apis/dashboard
- Credentials: https://console.cloud.google.com/apis/credentials
- OAuth Consent: https://console.cloud.google.com/apis/credentials/consent

**Support:**
- If stuck, check terminal output for specific error messages
- Ensure your Gmail is added as a test user
- Verify Google Drive API is enabled

---

## FAQ

**Q: Do I need to pay for Google Cloud/Drive?**
A: No! Free tier includes:
- Google Drive: 15 GB free storage
- API calls: Plenty for this use case
- Cost: $0

**Q: Can multiple people use the same credentials?**
A: Yes! Share `credentials.json` with your team (via secure method).
Each person will authenticate once with their own Google account.

**Q: What if I don't want to use Google Drive?**
A: Script still works! Images will:
- ✅ Show perfectly in PDFs
- ⚠️ Show as file paths in Notion (not images)

**Q: Can I use a different cloud storage?**
A: Yes! Modify `GoogleDriveUploader` class to use:
- AWS S3
- Cloudinary
- Imgur
- Any service with public URLs

**Q: How many images can I upload?**
A: Your 15 GB free Google Drive storage can hold:
- ~100,000 product images (avg 150KB each)
- More than enough for years of orders!

---

**Ready?** Once you've completed the setup, run:

```bash
python3 notion_quick.py
```

Your images will now display beautifully in both Notion AND PDF!
