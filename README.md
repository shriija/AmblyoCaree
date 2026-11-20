# AmblyoCare

**AI-Driven Adaptive Visual Training Platform with Gaze Interaction for Amblyopia**

AmblyoCare is a full-stack MERN (MongoDB, Express.js, React, Node.js) web application that supports accessible home visual training using a standard webcam, MediaPipe facial and iris landmark detection, interactive gaze-controlled exercises, adaptive difficulty, and longitudinal performance tracking.

> **Educational & Medical Disclaimer:** AmblyoCare is an educational and visual-training support platform. Standard webcam landmark estimation is not clinical-grade eye tracking and does not replace professional diagnosis, medical advice, or prescribed amblyopia treatment from an ophthalmologist or optometrist.

---

## Key Features

1. **Authentication & Protected Workspace**
   - Registration, login, logout, and password reset code flow.
   - `bcryptjs` password hashing and JWT authentication delivered via HTTP-only cookies.
2. **9-Point Webcam Eye Calibration**
   - Requests webcam access via `navigator.mediaDevices.getUserMedia()`.
   - Uses `@mediapipe/tasks-vision` (`FaceLandmarker`) to extract 478 facial landmarks including left/right iris rings and eye corners.
   - Records multi-frame reference samples per target and stores normalized calibration bounds (`Xmin`, `Xmax`, `Ymin`, `Ymax`) per user.
3. **Real-Time Gaze Tracking & Normalization**
   - Applies per-frame normalization:
     - `Xnorm = (X - Xmin) / (Xmax - Xmin)`
     - `Ynorm = (Y - Ymin) / (Ymax - Ymin)`
     - `Xscreen = Xnorm * ScreenWidth`
     - `Yscreen = Ynorm * ScreenHeight`
   - Includes real-time lighting/luminance diagnostics (Canvas pixel analysis with optional OpenCV.js hook) and face-presence alerts.
4. **Interactive Visual Training Games**
   - **Catch the Targets**: Gaze fixation acquisition with per-target reaction-time tracking.
   - **Follow the Moving Object**: Smooth-pursuit gaze tracking along an adaptive continuous path.
   - **Focus and Hold**: Sustained fixation drill with circular progress ring.
   - Full session controls: Start, Pause, Resume, Restart, End Session, plus a clearly labelled **Development Fallback: Mouse Pointer** mode when a webcam is unavailable.
5. **Performance Measurement & Adaptive Difficulty**
   - Computes real accuracy `(Targets Hit / Total Targets) * 100` and reaction time `Response Time - Target Display Time`.
   - Bounded adaptive difficulty engine adjusts target size, speed, spread ratio, target count, and response window across Beginner, Intermediate, and Advanced levels with plain-language explanations.
6. **Progress & Analytics Dashboard**
   - Interactive Recharts line and bar charts built exclusively from saved session records.
   - Date range filters (`7d`, `30d`, `90d`, `all`), exercise filters, clickable session detail inspection, and Left-Eye vs. Right-Eye comparisons when monocular sessions are recorded.

---

## Project Structure

```text
├── server.ts                         # Express + Vite unified server (port 3000)
├── server/
│   ├── config/database.ts            # Mongoose MongoDB connection + persistent local fallback
│   ├── models/                       # Mongoose schemas (User, Calibration, TrainingSession, UserProgress)
│   ├── services/repository.ts        # Unified data-access repository
│   ├── controllers/                  # Auth, User, Calibration, Training & Analytics controllers
│   ├── routes/                       # REST API routers
│   ├── middleware/                   # JWT auth guard & centralized error handler
│   └── utils/                        # JWT cookie helpers & adaptive difficulty engine
└── src/
    ├── components/                   # Reusable UI components (WebcamPreview, GazeIndicator, etc.)
    ├── layouts/                      # Authenticated AppLayout sidebar shell
    ├── pages/                        # Landing, Auth, Dashboard, Calibration, Gaze Tracking, Training, Analytics, Profile
    ├── hooks/useGazeTracker.ts       # Webcam + MediaPipe rAF tracking hook
    ├── utils/cv/                     # Separated Computer Vision & gaze estimation modules
    ├── services/api.ts               # Axios API client
    ├── store/                        # Zustand state stores (Auth & Gaze)
    └── types/                        # Shared TypeScript interfaces
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure your values:

```env
MONGODB_URI="mongodb://localhost:27017/amblyocare"
JWT_SECRET="replace-with-a-strong-random-secret"
JWT_EXPIRES_IN="7d"
PORT="3000"
APP_URL="http://localhost:3000"
```

> **Note on Local Database Fallback:** If `MONGODB_URI` is provided and reachable, AmblyoCare connects directly to MongoDB via Mongoose. If no MongoDB instance is running locally, the server automatically persists all collections in `./data/amblyocare-db.json` using MongoDB ObjectId-compatible records so every feature works immediately out of the box.

---

## Local Installation & Running

```bash
# 1. Install dependencies
npm install

# 2. Start the full-stack development server (Express API + Vite frontend on port 3000)
npm run dev

# 3. Build for production
npm run build

# 4. Run production server
NODE_ENV=production npm start
```

---

## REST API Documentation

### Authentication (`/api/auth`)
- `POST /api/auth/register` — Register a new account (bcrypt hash + HTTP-only JWT cookie).
- `POST /api/auth/login` — Authenticate and receive session cookie.
- `POST /api/auth/logout` — Clear authentication cookie.
- `GET /api/auth/me` — Return currently authenticated user profile.
- `POST /api/auth/forgot-password` — Generate a 15-minute password reset code.
- `POST /api/auth/reset-password` — Reset password using email + reset code.

### User Profile & Settings (`/api/users`) *(Protected)*
- `GET /api/users/profile` — Fetch user profile, latest calibration, and aggregate progress.
- `PUT /api/users/profile` — Update name, email, and profile image.
- `PUT /api/users/preferences` — Update webcam preference, default eye mode, session length, gaze reticle visibility, and adaptive difficulty toggle.

### Calibration (`/api/calibration`) *(Protected)*
- `POST /api/calibration` — Save recorded calibration points and normalized reference bounds (`Xmin`, `Xmax`, `Ymin`, `Ymax`).
- `GET /api/calibration/latest` — Fetch the user's most recent calibration profile.
- `DELETE /api/calibration/reset` — Reset saved calibration profiles.

### Training & Adaptive Difficulty (`/api/training`) *(Protected)*
- `POST /api/training/sessions` — Save a completed exercise session, recompute `UserProgress`, and return adaptive difficulty adjustment.
- `GET /api/training/sessions` — List sessions filtered by `range` (`7d`, `30d`, `90d`, `all`) and `gameType`.
- `GET /api/training/sessions/:id` — Retrieve an individual session record.
- `GET /api/training/adaptive` — Retrieve current difficulty level, bounded parameters, and limits.
- `PUT /api/training/adaptive/level` — Manually select Beginner, Intermediate, or Advanced preset.

### Progress & Analytics (`/api/analytics`) *(Protected)*
- `GET /api/analytics/overview` — Return aggregated KPIs, accuracy & reaction-time trend series, daily score activity, monocular left/right eye comparison, recent sessions, and data-driven training recommendations.
