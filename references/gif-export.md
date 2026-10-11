# GIF export

The web interface records the current scene, including its current state, SVG, WebGL, CSS, text and live interactions. Export requires desktop Chrome or Edge, explicit permission to share the current tab, and FFmpeg with ffprobe on the local machine. No recording is sent to an external service. The underlying APIs and encoding filters are described in [Chrome's Region Capture guide](https://developer.chrome.com/docs/web-platform/region-capture) and the [FFmpeg filter documentation](https://www.ffmpeg.org/ffmpeg-filters.html).

## Capture

`web/capture.ts` uses native Region Capture to record only the scene's `.iso-plate`. A capture handle verifies the selected tab before any recording begins; other tabs, windows and monitors are rejected. The figure must be fully visible. The recorder requests 20 fps, prefers VP9 with VP8 fallback, and uses an 8 Mbps bitrate. Users can record 2, 4, 6 or 8 seconds, interact during recording, or cancel. All capture tracks are stopped on success, cancellation or failure.

`web/app.ts` manages scene loading, both themes, export progress and a reusable download link. A new export revokes the previous object URL. Unsupported browsers and missing FFmpeg disable export with an explanation. Scrolling the figure out of view, resizing it or zooming during recording cancels the export instead of returning clipped or inconsistent frames. Escape cancels an active export from either the interface or the scene.

## Encoding

`scripts/preview-server.ts` accepts WebM recordings from its own localhost origin. Uploads are capped at 32 MiB, only one encoding job runs at a time, and disconnects cancel the job. Invalid media, unsupported codecs and oversized dimensions are rejected. Encoding and uploads have time limits, and temporary files are removed after success or failure.

`scripts/gif.ts` preserves the aspect ratio, uses Lanczos downsampling and writes an infinite loop. Both dimensions are capped at 720 pixels; images are never enlarged. A small color analysis selects the palette strategy. Scenes with stable colors use a global palette, restrained ordered dithering and GIF frame differences. Strong color changes use per-frame palettes and error diffusion to avoid allocating the entire clip's colors to a single palette; these frames are fully redrawn to avoid artifacts from changed palette indices.

The first attempt uses 20 fps and 256 palette entries. If it exceeds 3 MiB, the encoder progressively reduces fps, width and palette size. Stable-color scenes also try removing dithering before reducing timing or resolution. The minimum preset uses a maximum width of 480 pixels, 12 fps and 128 palette entries. A file still exceeding the ceiling is rejected; the interface asks for a shorter recording.

These are maximum quality settings, not a guarantee that every recording is visually identical to its source or loops seamlessly. GIF has a limited palette and timing precision, and the end of a user interaction may differ from its beginning. No frames are invented to conceal that difference.

## Validation

```bash
npm test
npm run test:browser
```

The unit and integration suite validates playable GIF output, dimensions, duration, frame count, infinite looping, structural similarity on a moving reference image, automatic size reduction, disappearance of moving objects without ghosting, cancellation, timeouts, invalid media, browser recording events, same-origin restrictions and all sixteen scene/theme routes. The moving illustration must retain SSIM of at least 0.95 at both normal and reduced sizes. Full-color animated gradients use a separate PSNR threshold of 30 dB: SSIM penalizes the diffusion pattern used to keep GIF gradients visually smooth, so it is unsuitable as the only acceptance criterion for that case.

The browser suite records all eight scenes in both themes using real tab capture. A changing marker inside each figure checks that the captured region contains live frames, and ffprobe verifies output duration and animation. It also tests cancellation and rejects uncaught browser errors. It requires Chrome, FFmpeg and permission to launch browsers and bind a local port. GitHub Actions runs this suite on Ubuntu. Merely adding a CI job does not mean that job has already passed.

`FFMPEG_PATH`, `FFPROBE_PATH` and `CHROME_PATH` can point to executable files outside the usual paths. After changing them, restart the interface.
