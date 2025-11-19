# Configure Firebase Storage CORS

To fix the CORS error for video backgrounds, you need to configure CORS on your Firebase Storage bucket.

## Steps:

1. Install Google Cloud SDK (if not already installed):
   ```bash
   # Windows: Download from https://cloud.google.com/sdk/docs/install
   # Or use: choco install gcloudsdk
   ```

2. Authenticate with Google Cloud:
   ```bash
   gcloud auth login
   ```

3. Set your project:
   ```bash
   gcloud config set project habs-meet-dev
   ```

4. Configure CORS using the cors-config.json file:
   ```bash
   gsutil cors set cors-config.json gs://habs-meet-dev.firebasestorage.app
   ```

5. Verify CORS configuration:
   ```bash
   gsutil cors get gs://habs-meet-dev.firebasestorage.app
   ```

## Alternative: Use Firebase Console

1. Go to Firebase Console → Storage
2. Click on the "..." menu → Edit CORS configuration
3. Add the following JSON:
   ```json
   [
     {
       "origin": ["https://habs-meet-dev.web.app", "https://habs-meet-dev.firebaseapp.com"],
       "method": ["GET", "HEAD"],
       "responseHeader": ["Content-Type", "Content-Length"],
       "maxAgeSeconds": 3600
     }
   ]
   ```


