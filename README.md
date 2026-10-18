# ChronoGrid | FSD_Project_ChronoGrid

ChronoGrid is an academic scheduling application for Vishnu Institute of Technology, Bhimavaram. It provides separate Student and Faculty login roles, a month/week/day timetable calendar, academic resource management, and constraint-based timetable generation.

## Run locally

Requirements: Node.js 20+, npm, and a MongoDB database.

```powershell
npm install
Copy-Item .env.example .env
```

Set `MONGODB_URI`, `JWT_SECRET`, and `REGISTRATION_KEY` in `.env`. The current project already has a local `.env`; keep it private and never commit it. The included `.gitignore` excludes it.

```powershell
npm run dev
```

Open <http://127.0.0.1:5173>. The Vite frontend proxies `/api` to the Express server on port 5000. To run separately, use `npm run dev:client` and `npm run dev:server`. Check MongoDB status at <http://127.0.0.1:5000/api/health>. Create a production frontend build with `npm run build`; run the API in production with `npm start`.

## Deploy to Render

The included `render.yaml` creates a single Render web service. In Render, create a Blueprint from this GitHub repository. Before the first deployment, enter the private `MONGODB_URI` value when prompted; Render generates `JWT_SECRET` and `REGISTRATION_KEY`. The service builds the React app and serves it from Express. Once deployed, open `/api/health` on the Render URL and confirm it reports `"database":"connected"`.

## Provision the first Faculty account

For security, account creation is not open in the login screen. A trusted workspace owner provisions accounts through the registration API using the private `REGISTRATION_KEY` from `.env`. The key is sent in the `x-registration-key` header. The API only accepts `faculty` and `student` roles; it cannot create an administrator account.

PowerShell example (replace values locally; do not paste secrets into source files):

```powershell
$registrationKey = 'copy REGISTRATION_KEY from your local .env'
$body = @{
  name = 'Faculty Name'
  email = 'faculty@vishnu.edu.in'
  password = 'use-a-unique-password-at-least-10-characters'
  role = 'faculty'
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri 'http://127.0.0.1:5000/api/auth/register' `
  -Headers @{ 'x-registration-key' = $registrationKey } `
  -ContentType 'application/json' -Body $body
```

Sign in through **Faculty Login**, then create faculty profiles, subjects, classrooms, and classes. To provision a student, obtain the class record's MongoDB `_id`, include it as `classId` in the registration request, and set `role = 'student'`. Students only receive schedules whose `classId` matches their account.

## Features

- VIT-specific Campus Indigo interface with responsive navigation and two role-specific login selections.
- Student timetable access is read-only in both the UI and API. Students can browse effective schedules by month, week, and day, filter by academic year/semester, search their schedule, export CSV, and print.
- Faculty-only API routes for faculty, subjects, rooms, classes/sections, availability, timetable generation, validation, publishing, and history.
- Constraint solver uses bounded backtracking with most-constrained-session selection. It checks faculty/resource/section conflicts, faculty availability, maximum teaching hours, room capacity, laboratory needs, and configured time slots. Infeasible resource assignments are reported.
- Timetables store effective start/end dates. Publishing a replacement preserves the earlier and later portions of overlapping published ranges and stores prior snapshots. Month views only show schedules valid on that date.
- Faculty may edit a session or remove it from a newly published version. Server-side validation runs before save; the old schedule remains available for the prior effective dates.
- Faculty and academic-resource records use MongoDB. Resource forms validate required fields and show API errors. Faculty records referenced by schedules are deactivated instead of deleted.
- In-app notifications are created for students assigned to a published timetable.

## Security notes

- Passwords use bcrypt hashes; login returns an expiring signed JWT.
- The client sends the token in the `Authorization: Bearer` header.
- Never distribute `REGISTRATION_KEY`, `JWT_SECRET`, or database credentials. Rotate them if exposed.
- Student APIs cannot read faculty/resource management endpoints or write timetables. Published timetables are read by the student's assigned class/section.
- The server binds to `127.0.0.1` by default. Configure an intentional deployment host and CORS origin before production deployment.

## Limitations

- No official VIT logo asset was supplied; branding uses a text-based VIT monogram and does not claim an official logo.
- Account recovery/email delivery is not configured. Provision accounts through the private registration key.
- Timetable schedules repeat by configured weekdays inside their effective date ranges. One-off holidays and calendar exceptions are not modeled.
- The generator's standard day offers a configurable start time, 4â€“8 periods, period duration, and lunch break boundary. A short break is inserted after period 2.
- PDF is provided through the browser print dialog. CSV export contains the selected day's timetable.
- A faculty-authenticated service account can manage all academic resources; per-department faculty scopes are not implemented.
