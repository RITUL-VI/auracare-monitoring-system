# AuraCare Monitoring System

Build a complete, single-page production-grade web application for a Touch-Free AI Patient Monitoring System named "AuraCare".

### UI/UX Theme & Design
- Medical-grade dark theme (Dark slate/navy background `#0B1120`, neon cyan/blue highlights `#06B6D4`, alert red `#EF4444`).
- Clean grid dashboard with smooth animations using Tailwind CSS, Framer Motion, and Lucide React icons.

### Core Layout & Components
1. Header Bar:
   - App name "AuraCare" with heart pulse icon.
   - Status badge: "System Active - Processing on Edge".
   - Patient ID selector (e.g., "Bed 04 - Infant NICU").

2. Live Camera & Face Mesh Viewport (Left/Center Column):
   - Real-time webcam feed element using browser `navigator.mediaDevices.getUserMedia`.
   - Overlaid `

` rendering MediaPipe Face Mesh landmarks on high-perfusion facial areas (forehead and cheeks).
   - Live bounding box overlay displaying "Target ROI Locked".
   - Control buttons: "Start Monitoring", "Stop", "Simulate Distress".

3. Real-Time Vitals Panel (Right Column):
   - Heart Rate Gauge Card: Live numeric display (e.g., "78 BPM") with pulse animation and status badge ("Stable").
   - Respiration Rate Gauge Card: Live numeric display (e.g., "16 br/min") with breathing wave animation.
   - Signal Quality Metric: "rPPG Signal Confidence: 96%".

4. Live Waveform Chart Section (Bottom Half):
   - Real-time updating smooth line chart using Chart.js or Recharts rendering continuous rPPG pulse waveforms (60 FPS simulated/POS extracted waveform).

5. Real-Time Alert Banner / Popup Modal:
   - Modal/Banner triggered when "Simulate Distress" is clicked or when HR > 120 / RR < 10.
   - Display red blinking banner: "CRITICAL ALERT: Tachycardia Detected | Bed 04".
   - Option to dispatch caregiver push alert.

### Functional Logic & Tech Stack
- Framework: Next.js (App Router) or React with Vite, Tailwind CSS, Lucide Icons, Recharts/Chart.js.
- Dependencies: `@mediapipe/face_mesh`, `@mediapipe/camera_utils`.
- Signal Algorithm Stub: Implement a clean client-side JS rPPG pipeline fallback function using color averaging across RGB channels in the ROI, passed through a Butterworth bandpass filter simulation to generate realistic heart rate data stream.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c031e488-f1bb-4b25-8cb7-1323b7063b5b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
