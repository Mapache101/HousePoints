# Deployment notes

## Recommended rollout

1. Copy `v2/` into the existing repository and test the static app on GitHub Pages.
2. Bootstrap the first admin using `scripts/bootstrap-admin.mjs`.
3. Deploy functions.
4. Use V2 Access Control to add teachers, coordinators, and admins.
5. Patch the legacy points page to read `settings/roles.admins` if you want legacy admin access to follow the same dashboard.
6. Deploy strict Firestore rules only after V2 and functions are working.

## Testing without functions

For early testing only:

```js
localStorage.setItem('scisUseFunctions', 'false');
location.reload();
```

Do not rely on this mode for production. It exists so you can test V2 before the Firebase Functions deployment is complete.
