# YouTube Playlist Downloader

[![Electron](https://img.shields.io/badge/Electron-v43.3.0-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![yt-dlp](https://img.shields.io/badge/Engine-yt--dlp-FF0000?logo=youtube&logoColor=white)](https://github.com/yt-dlp/yt-dlp)
[![FFmpeg](https://img.shields.io/badge/Converter-FFmpeg-007808?logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, high-performance desktop application and command-line tool for downloading YouTube playlists, channels, or single videos in high quality (up to 4K), extracting audio tracks, and converting subtitles.

> ### 📌 Credits & Attribution / حقوق الملكية والتوثيق
> - **Desktop GUI & Enhancements by:** Mazen Mohamed (مازن محمد)
> - **Original Author & Creator:** Amir Haytham ([AmirHaytham/youtube_playlist_downloader](https://github.com/AmirHaytham/youtube_playlist_downloader))
> - **Note:** This repository builds upon and modernizes the original CLI tool created by Amir Haytham, adding a full Electron desktop GUI, multi-stream DASH progress tracking, and WebVTT to SubRip (.srt) subtitle cleaning.

---

## 🌟 Key Features

- **Full Playlist & Single Video Support:** Easily parse and download entire playlists, single videos, or selectively check/uncheck specific videos to download.
- **High-Quality Video (up to 4K / 2160p):** Automatically downloads separate high-resolution DASH video and audio streams and muxes them into standard `.mp4` using FFmpeg.
- **Audio Extraction:** Download high-bitrate audio directly (Opus, M4A/AAC, MP3).
- **Smart Subtitle Processing:** Download subtitles in desired languages and automatically convert WebVTT files into clean, styled SubRip (`.srt`) files.
- **Unified Progress Indicator:** Provides accurate, continuous 0-100% download progress bars across separate video and audio stream stages.
- **YouTube Bot Mitigation:** Integrates Deno JavaScript runtime for YouTube n-sig deciphering and client spoofing to prevent 403 Forbidden throttling.
- **Dual Mode:** Use the interactive **Desktop GUI** or the lightweight **Terminal / CLI script**.

---

## 📝 Subtitle Processing & Auto-Cleaning (WebVTT to SRT)

### The Problem with Default YouTube Subtitles:
1. **Format Compatibility:** YouTube delivers subtitles in WebVTT (`.vtt`) format, which is not supported by many smart TVs, standalone media players, and older video players that require SubRip (`.srt`).
2. **Artifacts & Tags:** Raw YouTube subtitles contain inline styling tags (e.g., `<c.colorE5E5E5>`, `<font>`, `<00:00:00.000>`) that render as ugly raw text on most players.
3. **Rolling Duplicate Cues:** YouTube's automatic captions use rolling line buffers, causing every subtitle line to repeat 2 to 3 times on screen.
4. **All-or-Nothing in Playlists:** Standard downloaders force downloading subtitles for every single video in a playlist.

### Our Solution:
- **Intelligent Parser & Converter:** The built-in subtitle engine (`cleanVttToSrt`) automatically parses downloaded `.vtt` files, removes HTML/Karaoke tags, and writes standard SubRip (`.srt`) files with proper comma timestamps (`00:00:00,000`).
- **De-duplication:** Automatically merges and filters adjacent rolling cues so subtitles display cleanly without repetition.
- **Selective Playlist Subtitles:** Allows downloading subtitles for **individual selected videos** in a playlist using checkboxes in the GUI, avoiding unnecessary downloads.

---

## 🏗️ Architecture & Technology Stack

- **Frontend UI:** HTML5, Vanilla CSS3, Preload IPC Bridge (`contextBridge`, `contextIsolation`).
- **Main Process:** Electron, Node.js child_process.
- **Core Engine:**
  - `yt-dlp.exe` — YouTube video and metadata extractor.
  - `ffmpeg.exe` & `ffprobe.exe` — Video/audio stream muxing and format conversion.
  - `deno.exe` — External JavaScript engine for YouTube signature deciphering.

---

## 📥 Download & Install (For Windows Users)

If you just want to use the application on Windows, **you do NOT need to install Node.js, Git, or run any terminal commands**:

1. Go to the **[Latest Releases](https://github.com/MazenMohamed05/yt-dlp-gui/releases/latest)** page.
2. Download the Windows installer: **`YouTube Playlist Downloader Setup 1.0.0.exe`** (under Assets).
3. Run the setup installer to install the application on your PC.
4. Launch **YouTube Playlist Downloader** from your Start menu or Desktop shortcut and start downloading! *(All core engines including `yt-dlp` and `ffmpeg` are fully pre-bundled inside)*.

---

## 🛠️ Developer Setup (Building from Source)

If you are a developer and want to inspect, modify, or build the project from source:

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Git](https://git-scm.com/)

### 1. Clone the repository
```bash
git clone https://github.com/MazenMohamed05/yt-dlp-gui.git
cd yt-dlp-gui
```

### 2. Install dependencies
```bash
npm install
```
> **Note on download time:** `npm install` downloads Electron's precompiled desktop binaries (~100MB). Depending on your internet speed, this step may take 1–3 minutes to complete.

### 3. Set Up Binary Tools (`/bin` folder)
If not already present in the workspace, ensure the required binaries are placed inside the `bin/` directory:
- `yt-dlp.exe` — [Download latest release](https://github.com/yt-dlp/yt-dlp/releases/latest)
- `ffmpeg.exe` and `ffprobe.exe` — [Download from Gyan.dev](https://www.gyan.dev/ffmpeg/builds/)
- `deno.exe` — [Download Deno](https://github.com/denoland/deno/releases/latest)

---

## 💻 Running in Development

### 1. Desktop GUI Version (Recommended)
Launch the Electron desktop application:
```bash
npm start
```
*Or double-click `start.bat` on Windows.*

### 2. Terminal / CLI Version
Run the interactive command-line downloader:
```bash
node downloadPlaylist.js
```

---

## 📦 Building Packaged Installer

To build a standalone Windows installer (`.exe` with NSIS):
```bash
npm run dist
```
The installer will be generated in the `dist/` directory.

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## Backlog (User Stories)
- [x] Add functionality to download video and audio from YouTube playlists.
- [x] Integrate `yt-dlp` for high-quality video downloads.
- [x] Integrate `ffmpeg` to merge audio and video files.
- [x] Add a progress bar to show download status.
- [x] Add functionality to download all videos from a channel.
- [ ] Create a setup script for easier installation.
- [ ] Add error handling for unsupported formats or unavailable videos.
