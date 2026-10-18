# ChronoGrid | FSD_Project_ChronoGrid

ChronoGrid is an academic scheduling application for Vishnu Institute of Technology, Bhimavaram. It provides separate Student and Faculty login roles, a month/week/day timetable calendar, academic resource management, and constraint-based timetable generation.


## Sign in using LIVE LINK:https://fsd-project-chrono-grid.vercel.app/

Student and faculty accounts are provisioned privately by the workspace owner.
- For Student login(read mode only): Use these credentials
   mail:24pa1a05d51@vishnu.edu.in
   password:Rupa#2006
- For Faculty login(read and write mode): Use these credentials 
   mail:24pa1a05d5@vishnu.edu.in
   password:Lakshmipathi@123


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


