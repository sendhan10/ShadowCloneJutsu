# Shadow Clone Jutsu Camera App

A browser app that uses your webcam + MediaPipe Hands to detect a Naruto-inspired two-hand sign. When the sign is detected, the app plays a smoke burst and overlays multiple "shadow clone" versions of you in the camera feed.

## Run locally

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080> in a modern browser and allow camera access.

## Notes

- Gesture recognition is heuristic (for fun), not exact anime-canon hand-tracking.
- Best results in good lighting with both hands visible.
