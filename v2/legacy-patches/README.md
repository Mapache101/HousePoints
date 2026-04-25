# Legacy patches

The V2 app can run beside the old pages without patching them.

One useful compatibility patch is for the old `index.html` points portal: replace hard-coded admin checks with a check that also reads `settings/roles.admins`. See `index-admin-roles.patch` for the intended change.
