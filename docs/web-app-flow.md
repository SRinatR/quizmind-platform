# Web App Flow

The repo now includes the first web-facing composition layer for the future Next.js app.

## Dashboard sections

`apps/web/src/features/dashboard/sections.ts` defines the main user dashboard areas and the access requirements for each section.

## Admin sections

`apps/web/src/features/admin/sections.ts` defines admin modules and the permissions required to display them.

## Visibility helper

`apps/web/src/features/navigation/visibility.ts` uses the shared `evaluateAccess` logic to filter sections for a given access context and workspace.

This keeps the future web app aligned with the same permission and entitlement rules already used by the API and worker layers.
