# YouTube Playlist Downloader

[![Electron](https://img.shields.io/badge/Electron-v43.3.0-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![yt-dlp](https://img.shields.io/badge/Engine-yt--dlp-FF0000?logo=youtube&logoColor=white)](https://github.com/yt-dlp/yt-dlp)
[![FFmpeg](https://img.shields.io/badge/Converter-FFmpeg-007808?logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A desktop application and command-line utility for downloading YouTube playlists, channels, or single videos in high quality (up to 4K), extracting audio tracks, and converting subtitles.

> **Credits & Attribution:**
> - Desktop GUI & Enhancements: **Mazen Mohamed**
> - Original CLI Concept: **Amir Haytham** ([AmirHaytham/youtube_playlist_downloader](https://github.com/AmirHaytham/youtube_playlist_downloader))
> - Builds upon the original CLI script by adding an Electron desktop interface, multi-stream DASH progress tracking, and selective WebVTT-to-SRT subtitle conversion.

---

## Features

- **Playlists & Single Videos:** Download complete playlists, full channels, single videos, or select specific videos using checkboxes.
- **High-Quality Video (up to 4K):** Automatically downloads separate high-resolution DASH video and audio streams and muxes them into `.mp4` using FFmpeg.
- **Audio Extraction:** Download audio directly in high bitrate formats (Opus, M4A/AAC, MP3).
- **Subtitle Processing:** Download subtitle tracks and convert WebVTT files into clean SubRip (`.srt`) files.
- **Progress Tracking:** Continuous download and merge progress updates across separate stream stages.
- **Bot Mitigation:** Uses Deno runtime for YouTube signature deciphering to prevent throttling.
- **Dual Mode:** Choose between the desktop GUI or the standalone command-line script.

---

## Subtitle Processing (WebVTT to SRT)

### Why Clean Subtitles Matter
1. **Compatibility:** YouTube provides subtitles in WebVTT (`.vtt`), which is unsupported by many TVs and media players requiring SubRip (`.srt`).
2. **Tag Removal:** Raw WebVTT captions often contain inline styling tags (e.g., `<c.colorE5E5E5>`, `<00:00:00.000>`) that render as clutter on standard players.
3. **De-duplication:** YouTube auto-generated captions repeat consecutive lines across rolling line buffers.
4. **Selective Download:** Rather than forcing subtitle downloads for an entire playlist, you can select only the videos you need.

The built-in parser strips HTML and timing tags, deduplicates adjacent cues, formats timestamps with standard comma notation (`00:00:00,000`), and saves clean `.srt` files.

---

## Architecture

- **Frontend:** HTML5, CSS3, Preload IPC Bridge (`contextBridge`, `contextIsolation`).
- **Main Process:** Electron, Node.js child processes.
- **Engines:**
  - `yt-dlp.exe` — Video metadata and stream extractor.
  - `ffmpeg.exe` & `ffprobe.exe` — Video/audio stream muxing.
  - `deno.exe` — JavaScript runtime for YouTube signature solving.

---

## Download & Installation (Windows)

If you only want to run the application on Windows:

1. Go to the [Releases](https://github.com/MazenMohamed05/yt-dlp-gui/releases/latest) page.
2. Download **`YouTube Playlist Downloader Setup 1.0.0.exe`**.
3. Run the installer to set up the app on your computer.
4. Open **YouTube Playlist Downloader** from your Desktop or Start Menu.

*(All binary dependencies including yt-dlp and ffmpeg are bundled inside the installer).*

---

## Development Setup

To run or build the project from source:

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Git](https://git-scm.com/)

### 1. Clone repository
```bash
git clone https://github.com/MazenMohamed05/yt-dlp-gui.git
cd yt-dlp-gui
```

### 2. Install dependencies
```bash
npm install
```

### 3. Binary dependencies (`bin/` directory)
Ensure the following binaries exist in the `bin/` folder:
- `yt-dlp.exe` — [Download](https://github.com/yt-dlp/yt-dlp/releases/latest)
- `ffmpeg.exe` and `ffprobe.exe` — [Download](https://www.gyan.dev/ffmpeg/builds/)
- `deno.exe` — [Download](https://github.com/denoland/deno/releases/latest)

---

## Running the Application

### Desktop GUI
```bash
npm start
```
*Or run `start.bat` on Windows.*

### Command-line Interface
```bash
node downloadPlaylist.js
```

---

## Building the Installer

To package the application into a Windows installer:
```bash
npm run dist
```
The resulting executable will be placed in the `dist/` directory.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
