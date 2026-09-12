# MIRUS Field Force — Mobile App

React Native (Expo) app for the MIRUS mobile business-operations / field-force
workflows (BDM → ASM → RSM → ZSM → NSM → Admin). Talks to the **existing**
MIRUS HRMS backend over HTTPS REST — it never touches MongoDB directly and
uses no separate authentication, attendance, or leave system.

## Status: Milestone 5 — Foundation

What's here:

- Expo project scaffold (`app.json`, `babel.config.js`, `App.js`).
- Theming (`src/theme`) matching the **live web app's** actual brand colors
  (orange `#E89000` / charcoal `#707070`), not the HTML demo's navy/orange.
- API client (`src/api/client.js`) — axios instance that sends `X-Client:
  mobile` on every request (so the backend's login endpoint knows to return
  a Bearer token) and attaches the stored token to every subsequent call.
- Secure token storage (`src/api/tokenStorage.js`) via `expo-secure-store`
  (iOS Keychain / Android Keystore) — never AsyncStorage or plain storage.
- Auth state (`src/context/AuthContext.js`) — boots by checking for a stored
  token and calling `GET /auth/me`; exposes `signIn`/`signOut`.
- A real login screen (`src/screens/LoginScreen.js`) using the existing
  `companySlug` + `identifier` (email or Employee ID) + `password` contract —
  **not** the HTML demo's role-picker (that was a UI mock only; the real role
  and field-force tier always come from the server's response).
- A minimal role-aware landing screen confirming the full round trip works.
  Real per-tier dashboards (BDM, Manager, Admin) are Milestones 6-8.
- Reusable UI primitives: `Button`, `Card`, `StatusBadge`, `ErrorBanner`.

## Backend prerequisite (already implemented)

`POST /api/auth/login` now returns a raw JWT in the response body **only**
when the request carries `X-Client: mobile` — the web app never sends that
header, so its cookie-only behavior is completely unchanged. See
`server/controllers/authController.js` and `server/tests/mobileAuth.test.js`.

## Setup

```bash
cd mobile
npm install
npx expo install   # aligns dependency versions with your installed Expo SDK
npm start
```

Then press `a`/`i`/`w` in the Expo CLI, or scan the QR code with Expo Go.

By default the app points at `http://localhost:5000/api` (see `app.json` →
`expo.extra.apiBaseUrl`). On a physical device this must be your machine's
LAN IP instead of `localhost` (a phone can't resolve your computer's
`localhost`) — edit `app.json` or override via an Expo config plugin/env for
your environment before testing on a real device.

## What has NOT been verified

This environment has no iOS/Android simulator or Expo Go device attached, so
**the app has not been run**. `npm install` has not been executed either —
dependency versions in `package.json` are reasonable Expo 51-era pins, but
run `npx expo install` after `npm install` to let Expo correct any version
mismatches for your actual installed SDK before trusting them. Please run it
locally and confirm the login → home flow before building further screens on
top of it.
