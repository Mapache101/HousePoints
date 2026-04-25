# Firestore data model

V2 intentionally uses the same base path as the existing app:

```text
artifacts/scis-house-points/public/data
```

## Existing collections reused

```text
houseTotals
rankings
students
active_reflections
attendance
scheduled_tests
settings/roles
```

## New support collections

```text
userAccess/{uid}
accessInvites/{emailKey}
auditLogs/{logId}
```

## Access document

```json
{
  "uid": "firebase-auth-uid",
  "email": "teacher@scis-bo.com",
  "displayName": "Teacher Name",
  "active": true,
  "roles": {
    "teacher": true,
    "coordinator": false,
    "admin": false
  },
  "permissions": {
    "canSubmitPoints": true,
    "canGiveAR": true,
    "canGiveDR": false,
    "canSubmitAttendance": false,
    "canManageCalendar": false,
    "canManageStudents": false,
    "canApproveReflections": false,
    "canProcessHousePoints": false,
    "canManageRoles": false
  }
}
```

## Invite document

Used when the user has not signed in yet. The callable `syncUserAccessAfterLogin` converts it into `userAccess/{uid}` on first sign-in.

```json
{
  "email": "newteacher@scis-bo.com",
  "active": true,
  "roles": { "teacher": true, "coordinator": false, "admin": false },
  "permissions": { "canSubmitPoints": true, "canGiveAR": false }
}
```
