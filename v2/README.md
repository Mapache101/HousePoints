# SCIS HousePoints Unified V2

This package adds a unified, role-based V2 application beside the existing HousePoints GitHub Pages files.

## What this package does

- Keeps the current Firebase project: `scis-house-points`.
- Keeps the current Firestore data path: `artifacts/scis-house-points/public/data/...`.
- Adds a new static app at `/v2/` so the existing pages can still run at `/index.html`, `/ar.html`, `/att.html`, and `/calendar.html`.
- Adds an Access Control dashboard for admins to decide who can submit ARs, submit house points, manage calendar, manage students, approve reflections, process points, and manage roles.
- Includes Firebase Functions for secure privileged operations.
- Includes staged Firestore rules. Do not deploy stricter rules until the functions and V2 app are tested.

## Quick test on GitHub Pages

Copy the `v2/` folder into your existing repository. Commit and push. Then open:

```text
https://mapache101.github.io/HousePoints/v2/
```

By default the V2 frontend uses callable Firebase Functions for privileged actions when available. For early testing before deploying functions, open the browser console and run:

```js
localStorage.setItem('scisUseFunctions', 'false');
location.reload();
```

This fallback mode writes access data directly to Firestore and is only for testing with your current rules. The secure end state is to deploy the functions and keep `scisUseFunctions` enabled.

To return to secure callable mode:

```js
localStorage.removeItem('scisUseFunctions');
location.reload();
```

## Deploy Firebase backend

Install Firebase CLI and log in:

```bash
npm install -g firebase-tools
firebase login
```

Initialize your project if needed:

```bash
firebase use scis-house-points
```

Install function dependencies:

```bash
cd functions
npm install
cd ..
```

Deploy functions only first:

```bash
firebase deploy --only functions
```

Deploy Firestore rules only after V2 and functions are tested:

```bash
firebase deploy --only firestore:rules
```

## Bootstrap the first admin

Create a Firebase service account JSON file from Firebase Console and run:

```bash
node scripts/bootstrap-admin.mjs ./service-account.json dolguin@scis-bo.com
```

This creates or updates the legacy `settings/roles` document. If the user has already signed in and you know their UID, pass it as the third argument:

```bash
node scripts/bootstrap-admin.mjs ./service-account.json dolguin@scis-bo.com FIREBASE_AUTH_UID
```

## Important security note

The frontend hides buttons for convenience, but Firestore rules and Cloud Functions must enforce the real permissions. Do not rely on client-side role checks alone.
