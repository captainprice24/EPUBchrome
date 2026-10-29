# Google Drive configuration

Local reading works without Google. Drive import is an optional integration for bringing a selected EPUB link into the local library. Live-account OAuth and downloads have not yet been verified in this development environment.

## Configure Google and Chrome

1. Build and load Folio as described in [Installation](INSTALLATION.md). Copy its extension ID from `chrome://extensions`.
2. Create or select a Google Cloud project and enable the **Google Drive API**.
3. Configure the OAuth consent screen, audience and required test users while the app is in testing mode.
4. Create an OAuth client for a **Chrome extension**, associated with that extension ID.
5. Copy `.env.example` to `.env` and set the public client ID:

   ```dotenv
   WXT_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

6. Run `npm run build`, reload Folio in `chrome://extensions`, and use **Open from Drive**.
7. Paste an EPUB file URL or file ID. Select **Connect & open**, sign in to the account with access, and approve the requested read-only scope.

The build places the client ID in the manifest’s `oauth2` section. Confirm that section is present when diagnosing a configuration issue. The client ID is public application configuration. Never add a client secret, access token or private extension signing key to the repository.

## Keep extension identity stable

Unpacked extension identity can depend on its folder location or configured public key. Moving the extension or distributing it under another ID can invalidate the OAuth client association and use a different local storage area. Use the actual stable ID for the build being tested. Public release signing/identity must be configured before distributing an OAuth-enabled build; do not commit a private signing key.

## Access and data handling

The implementation uses `chrome.identity.getAuthToken` with `https://www.googleapis.com/auth/drive.readonly`, then requests metadata and media for the file link supplied. It requests no Drive write access. This read-only scope is broader than per-file selection and can require Google verification before public distribution.

Downloading an arbitrary existing file link is why this version uses the broad read-only scope. A future Google Picker integration should evaluate narrower `drive.file` grants; simply replacing the scope does not grant access to every existing file.

The download is streamed to temporary origin-private browser storage before import. A local copy is saved, and temporary storage is cleaned up after the operation. Canceling the dialog aborts the download. Keep enough free browser storage for temporary and library copies. The Drive original is not changed.

## Diagnose common failures

- **Not configured:** check `.env`, rebuild, reload, and inspect the generated manifest for `oauth2.client_id`.
- **Sign-in or OAuth error:** verify extension ID, client type, consent configuration, testing users and Google’s current app verification requirements.
- **File access error:** use the correct Google account and confirm it has permission to read the linked EPUB. Check shared-drive and download restrictions.
- **Browser preview error:** Google sign-in uses Chrome extension APIs. The HTTP preview and test server cannot provide them.
- **Download/storage error:** check connectivity, file size, quotas and available free browser storage.

Do not paste credentials into issues, logs or screenshots. Include only redacted error messages and the steps needed to reproduce a problem.
