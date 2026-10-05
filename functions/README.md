# Notification token backend

Notification tokens are stored in `notifyDevices/{anonymous-user-id}` and are
written only by the callable Cloud Function. Browser Firestore access to these
documents is denied by `firestore.rules`.

## Firebase project setup

1. Enable **Anonymous** in Firebase Authentication.
2. Register the hosted web origin with Firebase App Check using the reCAPTCHA v3
   provider. Copy its site key into the `firebase-app-check-site-key` meta tag
   in `index.html`, and enable App Check enforcement for Cloud Firestore.
3. Install the Firebase CLI and authenticate with an account allowed to deploy
   Firestore rules and Cloud Functions.
4. From the repository root, run `firebase deploy --only firestore:rules,functions`.
5. Install the `functions` dependencies and deploy the GitHub Actions workflow
   with a service account that can read/write Firestore and send FCM messages.
6. Open the app on each device and use **アプリ外通知を登録し直す** once. Tokens
   previously stored in `notify/state` are intentionally not trusted or migrated.

Keep App Check enforcement enabled for the callable function. Firestore access
to `notify/state` requires Firebase Authentication; `/notifyDevices/*` is
server-only. Application data is sent to `notify/state` to drive scheduled
notifications, so restrict and monitor the Firebase project’s anonymous-auth
and App Check quotas.
