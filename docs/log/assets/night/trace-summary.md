# Scroll traces — summed thread time (ms) per event, 1280×800, wheel 24 down + 24 up

Headless Chrome 152 (software compositing), so GPU numbers are noisy run to run; the main-thread result (0 long tasks, 0 frames over 25 ms in every run) is in checks-results.json. Raw traces were kept out of git (≈6 MB each).

| run | RasterTask | GPUTask | Layerize | Paint |
|---|---:|---:|---:|---:|
| day-calendar | 0.9 | 4.1 | 6.2 | 0.3 |
| day-routines | 3.6 | 57.2 | 3.9 | 0.0 |
| day-settings | 5.3 | 31.6 | 18.6 | 4.4 |
| day-today | 3.3 | 57.4 | 2.9 | 0.0 |
| night+blur-calendar | 0.8 | 2.8 | 6.6 | 0.0 |
| night+blur-routines | 2.9 | 42.5 | 3.4 | 0.0 |
| night+blur-settings | 4.2 | 34.2 | 13.7 | 3.8 |
| night+blur-today | 1.7 | 19.4 | 2.3 | 0.0 |
| night-calendar | 0.7 | 2.2 | 6.3 | 0.0 |
| night-routines | 4.4 | 82.7 | 3.4 | 0.0 |
| night-settings | 4.7 | 36.9 | 15.5 | 2.9 |
| night-today | 2.7 | 57.4 | 2.6 | 0.0 |
