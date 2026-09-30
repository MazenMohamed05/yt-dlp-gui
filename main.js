/**
 * YouTube Playlist Downloader - Electron Main Process
 *
 * Handles native application lifecycle, BrowserWindow creation, IPC communication,
 * and child process execution for media downloading and subtitle processing.
 */

const {
    app,
    BrowserWindow,
    ipcMain,
    dialog
} = require('electron');

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');


// ============================================================================
// Binary Dependencies & Executable Paths
// ============================================================================
// Resolves paths for required external CLI binaries (yt-dlp, ffmpeg, ffprobe, deno).
// When packaged via electron-builder, binaries reside in process.resourcesPath/bin.
// During development, binaries are resolved relative to the project root (/bin).

const BIN_PATH =
    app.isPackaged
        ? path.join(
            process.resourcesPath,
            'bin'
        )
        : path.join(
            __dirname,
            'bin'
        );

// Executable binary paths
const YTDLP_PATH =
    path.join(
        BIN_PATH,
        'yt-dlp.exe'
    );

const FFMPEG_PATH =
    path.join(
        BIN_PATH,
        'ffmpeg.exe'
    );

const FFPROBE_PATH =
    path.join(
        BIN_PATH,
        'ffprobe.exe'
    );

const DENO_PATH =
    path.join(
        BIN_PATH,
        'deno.exe'
    );

// ============================================================================
// Application Window Management
// ============================================================================

/**
 * Initializes and configures the primary Electron browser window.
 * Configures secure context isolation, attaches the preload script bridge,
 * and loads the application's HTML interface.
 */
function createWindow() {

    const win = new BrowserWindow({

        width: 1000,
        height: 700,

        autoHideMenuBar: true,

        webPreferences: {

            preload: path.join(
                __dirname,
                'preload.js'
            ),

            contextIsolation: true,

            nodeIntegration: false

        }

    });

    win.loadFile(
        path.join(
            __dirname,
            'index.html'
        )
    );

    win.on('close', () => {
        cleanupDownloadsOnExit();
    });

}

// ============================================================================
// File Conflict Detection & Auto-Numbering Helpers
// ============================================================================

function sanitizeFilename(str) {
    return String(str || '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .trim();
}

function normalizeForComparison(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/[\\/:*?"<>|_—\-()[\]{}.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function findExistingFile(outputDir, rawTitle, type, audioFormat = 'mp3', language = '') {
    if (!outputDir || !fs.existsSync(outputDir)) {
        return null;
    }

    let files;
    try {
        files = fs.readdirSync(outputDir);
    } catch {
        return null;
    }

    if (!files || files.length === 0) {
        return null;
    }

    const targetNorm = normalizeForComparison(rawTitle);
    if (!targetNorm) {
        return null;
    }

    const validExts = new Set();
    if (type === 'video') {
        ['.mp4', '.mkv', '.webm', '.avi', '.mov'].forEach(e => validExts.add(e));
    } else if (type === 'audio') {
        const af = (audioFormat || 'mp3').toLowerCase();
        ['.' + af, '.mp3', '.m4a', '.opus', '.wav', '.webm', '.aac', '.flac'].forEach(e => validExts.add(e));
    } else if (type === 'subtitle') {
        ['.srt', '.vtt'].forEach(e => validExts.add(e));
    }

    for (const file of files) {
        const parsed = path.parse(file);
        const ext = parsed.ext.toLowerCase();

        if (validExts.size > 0 && !validExts.has(ext)) {
            continue;
        }

        let fileStem = parsed.name;
        if (type === 'subtitle' && language) {
            fileStem = fileStem.replace(new RegExp('\\.' + language + '$', 'i'), '');
        }

        const fileNorm = normalizeForComparison(fileStem);
        if (fileNorm === targetNorm) {
            return file;
        }
    }

    return null;
}

function getNextRenameIndex(outputDir, rawTitle, type, audioFormat = 'mp3') {
    if (!outputDir || !fs.existsSync(outputDir)) {
        return 1;
    }

    let files;
    try {
        files = fs.readdirSync(outputDir);
    } catch {
        return 1;
    }

    const targetNorm = normalizeForComparison(rawTitle);
    let baseExists = false;
    let maxNumber = 0;

    for (const file of files) {
        const parsed = path.parse(file);
        const match = parsed.name.match(/\((\d+)\)$/);
        if (match) {
            const nameWithoutNumber = parsed.name.replace(/\(\d+\)$/, '').trim();
            if (normalizeForComparison(nameWithoutNumber) === targetNorm) {
                const num = parseInt(match[1], 10);
                if (num > maxNumber) {
                    maxNumber = num;
                }
            }
        } else if (normalizeForComparison(parsed.name) === targetNorm) {
            baseExists = true;
        }
    }

    return baseExists || maxNumber > 0 ? maxNumber + 1 : 0;
}

// ============================================================================
// yt-dlp Process Execution & Resilience Layer
// ============================================================================

let activeYtDlpProcess = null;
const downloadState = {
    isCancelled: false,
    isPaused: false,
    resumePromiseResolve: null
};

function killProcessTree(pid) {
    if (!pid) return;
    try {
        spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    } catch (e) {
        console.error('Error in killProcessTree:', e);
    }
}

function cleanupDownloadsOnExit() {
    downloadState.isCancelled = true;
    downloadState.isPaused = false;
    if (activeYtDlpProcess && activeYtDlpProcess.pid) {
        killProcessTree(activeYtDlpProcess.pid);
        activeYtDlpProcess = null;
    }
}

/**
 * Executes a yt-dlp operation with automatic exponential/delayed retry logic.
 * Primarily guards against transient network interruptions, rate limiting,
 * or temporary HTTP 403 Forbidden responses from YouTube media servers.
 *
 * @param {string[]} args - CLI arguments array passed directly to yt-dlp.
 * @param {Function|number|null} [onProgress=null] - Optional progress callback function.
 * @param {number} [maxRetries=3] - Maximum retry attempts before giving up.
 * @returns {Promise<string>} - Resolves with standard output (stdout) on success.
 */
async function downloadWithRetry(args, onProgress = null, maxRetries = 3) {
    if (typeof onProgress === 'number') {
        maxRetries = onProgress;
        onProgress = null;
    }

    let attempt = 1;
    while (attempt <= maxRetries) {
        if (downloadState.isCancelled) {
            throw new Error('DOWNLOAD_CANCELLED');
        }

        if (downloadState.isPaused) {
            await new Promise((resolve) => {
                downloadState.resumePromiseResolve = resolve;
            });
            if (downloadState.isCancelled) {
                throw new Error('DOWNLOAD_CANCELLED');
            }
        }

        try {
            const res = await runYtDlp(args, onProgress);
            if (res === 'PAUSED') {
                await new Promise((resolve) => {
                    downloadState.resumePromiseResolve = resolve;
                });
                if (downloadState.isCancelled) {
                    throw new Error('DOWNLOAD_CANCELLED');
                }
                continue;
            }
            return res;
        } catch (error) {
            if (downloadState.isCancelled || error.message === 'DOWNLOAD_CANCELLED') {
                throw new Error('DOWNLOAD_CANCELLED');
            }
            if (downloadState.isPaused) {
                await new Promise((resolve) => {
                    downloadState.resumePromiseResolve = resolve;
                });
                continue;
            }

            console.warn(`Attempt ${attempt} failed with error: ${error.message}`);
            if (attempt === maxRetries) {
                throw error;
            }
            attempt++;
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }
}

/**
 * Spawns a child process executing yt-dlp.exe with specified arguments.
 * Intercepts stdout and stderr streams in real-time, strips ANSI escape sequences,
 * and parses download metrics (percentage, file size, download speed, and ETA)
 * to emit normalized progress events.
 *
 * @param {string[]} args - Command-line flags and parameters for yt-dlp.
 * @param {Function|null} [onProgress=null] - Callback invoked with normalized progress strings.
 * @returns {Promise<string>} - Promise resolving with complete stdout on exit code 0.
 */
function runYtDlp(
    args,
    onProgress = null
) {

    return new Promise(
        (resolve, reject) => {

            if (downloadState.isCancelled) {
                return reject(new Error('DOWNLOAD_CANCELLED'));
            }

            const process = spawn(
                YTDLP_PATH,
                args,
                {
                    windowsHide: true
                }
            );
            activeYtDlpProcess = process;


            let stdout = '';
            let stderr = '';

            let progressBuffer = '';

            const cleanProgressText = (value) => {

                return value
                    .replace(
                        /\x1B\[[0-?]*[ -\/]*[@-~]/g,
                        ''
                    )
                    .replace(
                        /\r\n/g,
                        '\n'
                    )
                    .replace(
                        /\r/g,
                        '\n'
                    );

            };

            const emitProgressLines = (value) => {

                if (
                    typeof onProgress !== 'function'
                ) {

                    return;

                }


                progressBuffer +=
                    cleanProgressText(value);


                const lines =
                    progressBuffer.split('\n');


                progressBuffer =
                    lines.pop() || '';


                for (
                    const line
                    of lines
                ) {

                    const match =
                        line.match(
                            /\[download\]\s+(\d+(?:\.\d+)?)%(?:\s+of\s+([^\s]+))?(?:\s+at\s+([^\s]+))?(?:\s+ETA\s+([^\s]+))?/i
                        );


                    if (
                        !match
                    ) {

                        continue;

                    }


                    const normalized =
                        `[download] ${match[1]}%${match[2] ? ` of ${match[2]}` : ''} at ${match[3] || '--'} ETA ${match[4] || '--'}`;


                    console.log(
                        'Normalized yt-dlp progress:',
                        normalized
                    );


                    onProgress(
                        normalized
                    );

                }

            };

            process.stdout.on(
                'data',
                (data) => {

                    const value =
                        data.toString();

                    console.log('[yt-dlp stdout]:', value.trim());

                    stdout +=
                        value;


                    emitProgressLines(
                        value
                    );

                }
            );

            process.stderr.on(
                'data',
                (data) => {

                    const value =
                        data.toString();


                    stderr +=
                        value;


                    console.log(
                        'yt-dlp output:',
                        value
                    );


                    emitProgressLines(
                        value
                    );

                }
            );

            process.on(
                'error',
                (error) => {

                    reject(error);

                }
            );

            process.on(
                'close',
                (code) => {

                    if (
                        progressBuffer.trim()
                    ) {

                        emitProgressLines(
                            '\n'
                        );

                    }


                    activeYtDlpProcess = null;

                    if (downloadState.isCancelled) {
                        return reject(new Error('DOWNLOAD_CANCELLED'));
                    }

                    if (downloadState.isPaused) {
                        return resolve('PAUSED');
                    }

                    if (
                        code === 0
                    ) {

                        resolve(
                            stdout
                        );

                    } else {

                        reject(
                            new Error(
                                stderr ||
                                `yt-dlp exited with code ${code}`
                            )
                        );

                    }

                }
            );

        }
    );

}

// ============================================================================
// Multi-Stream Unified Progress Calculation
// ============================================================================

/**
 * Creates a unified progress tracking closure for multi-stream downloads.
 * 
 * When downloading best-quality formats (1080p, 2K, 4K), YouTube delivers video
 * and audio in separate adaptive DASH streams. Normally, yt-dlp reports 0-100%
 * for the video stream, then resets to 0-100% for the audio stream.
 * 
 * This handler intercepts both stream downloads, aggregates their byte sizes,
 * and calculates a single continuous, non-decreasing overall progress percentage
 * (0% to 100%) sent directly to the UI renderer.
 *
 * @param {Function} sendToRenderer - Callback function to emit formatted progress string to UI.
 * @returns {Function} Handler receiving raw progress lines from child process.
 */
function createUnifiedProgressHandler(
    sendToRenderer
) {

    let streams = [];

    let currentStream = -1;

    let lastPercent = 0;

    let lastSpeed = '--';

    let lastEta = '--';


    function unitToBytes(value) {

        if (!value) {
            return 0;
        }


        const match =
            String(value)
                .trim()
                .match(
                    /^([\d.]+)\s*(B|KiB|MiB|GiB|TiB|KB|MB|GB|TB)$/i
                );


        if (!match) {
            return 0;
        }


        const number =
            Number(match[1]);


        const unit =
            match[2].toLowerCase();


        const multipliers = {

            'b': 1,

            'kib': 1024,
            'kb': 1000,

            'mib': 1024 * 1024,
            'mb': 1000 * 1000,

            'gib': 1024 * 1024 * 1024,
            'gb': 1000 * 1000 * 1000,

            'tib': 1024 * 1024 * 1024 * 1024,
            'tb': 1000 * 1000 * 1000 * 1000

        };


        return (
            number *
            (
                multipliers[unit] ||
                1
            )
        );

    }


    function formatBytes(bytes) {

        if (
            !bytes ||
            bytes <= 0
        ) {
            return '--';
        }


        const units = [
            'B',
            'KiB',
            'MiB',
            'GiB',
            'TiB'
        ];


        let value =
            bytes;


        let index = 0;


        while (
            value >= 1024 &&
            index < units.length - 1
        ) {

            value /=
                1024;

            index++;

        }


        return (
            `${value.toFixed(
                value >= 10
                    ? 1
                    : 2
            )}${units[index]}`
        );

    }


    function parseProgress(text) {

        if (!text) {
            return null;
        }


        const match =
            String(text).match(
                /\[download\]\s+(\d+(?:\.\d+)?)%(?:\s+of\s+([^\s]+))?(?:\s+at\s+([^\s]+))?(?:\s+ETA\s+([^\s]+))?/i
            );


        if (!match) {
            return null;
        }


        return {

            percent:
                Number(match[1]),

            totalText:
                match[2] || '',

            speed:
                match[3] || '--',

            eta:
                match[4] || '--'

        };

    }


    return (
        progressText
    ) => {

        const progress =
            parseProgress(
                progressText
            );


        if (!progress) {
            return;
        }


        lastSpeed =
            progress.speed;


        lastEta =
            progress.eta;


        const totalBytes =
            unitToBytes(
                progress.totalText
            );


        if (
            totalBytes <= 0
        ) {

            lastPercent =
                Math.max(
                    lastPercent,
                    Math.min(
                        progress.percent,
                        100
                    )
                );


            sendToRenderer(
                `[download] ${lastPercent.toFixed(1)}% at ${lastSpeed} ETA ${lastEta}`
            );


            return;

        }


        let streamIndex =
            streams.findIndex(
                stream =>
                    stream.total ===
                    totalBytes
            );


        if (
            streamIndex === -1
        ) {

            streams.push({

                total:
                    totalBytes,

                percent:
                    0

            });


            streamIndex =
                streams.length - 1;

        }


        currentStream =
            streamIndex;


        streams[currentStream].percent =
            Math.max(
                streams[currentStream].percent,
                Math.min(
                    progress.percent,
                    100
                )
            );


        let totalDownloadBytes = 0;

        let downloadedBytes = 0;


        for (
            const stream
            of streams
        ) {

            totalDownloadBytes +=
                stream.total;


            downloadedBytes +=
                (
                    stream.total *
                    stream.percent /
                    100
                );

        }


        let overallPercent = 0;


        if (
            totalDownloadBytes > 0
        ) {

            overallPercent =
                (
                    downloadedBytes /
                    totalDownloadBytes
                ) *
                100;

        }


        overallPercent =
            Math.max(
                lastPercent,
                Math.min(
                    overallPercent,
                    100
                )
            );


        lastPercent =
            overallPercent;


        const downloadedText =
            formatBytes(
                downloadedBytes
            );


        const totalText =
            formatBytes(
                totalDownloadBytes
            );


        const unifiedProgress =
            `[download] ${overallPercent.toFixed(1)}% of ${totalText} at ${lastSpeed} ETA ${lastEta}`;


        console.log(
            'Unified progress:',
            unifiedProgress,
            `(${downloadedText} / ${totalText})`
        );


        sendToRenderer(
            unifiedProgress
        );

    };

}

// ============================================================================
// UI Progress Communication
// ============================================================================

/**
 * Dispatches real-time download status text to the UI renderer process.
 *
 * @param {Electron.IpcMainInvokeEvent} event - The originating IPC invoke event.
 * @param {string} text - Raw or normalized progress status string.
 */
function sendProgress(
    event,
    text
) {

    if (
        !event ||
        !event.sender ||
        !text
    ) {

        return;

    }


    event.sender.send(
        'download-progress',
        text
    );

}


// ============================================================================
// IPC Handler: URL Analysis & Metadata Extraction
// ============================================================================

/**
 * Handles 'analyze-url' requests from the renderer process.
 * 
 * Flow:
 *  1. Validates that the input is a non-empty string.
 *  2. Determines whether the URL points to a playlist (?list=) or a single video.
 *  3. Executes yt-dlp with --dump-single-json and Deno JavaScript runtime integration
 *     to extract full metadata, available video/audio streams, and subtitle tracks.
 *  4. Groups and standardizes available video resolutions (144p to 4K).
 *  5. Returns structured metadata payload to the UI for format selection.
 *
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event context.
 * @param {string} url - YouTube video or playlist URL to analyze.
 * @returns {Promise<{success: boolean, data?: object, message?: string}>} Analysis results.
 */
ipcMain.handle(
    'analyze-url',
    async (event, url) => {

        try {

            console.log("🔥 MAIN.JS IS RUNNING");

            console.log('');
            console.log(
                '================================'
            );

            console.log(
                'Analyzing URL'
            );

            console.log(
                '================================'
            );

            console.log(url);


            const isPlaylist =
                /[?&]list=/.test(
                    url
                );


            console.log(
                'Detected type:',
                isPlaylist
                    ? 'PLAYLIST'
                    : 'SINGLE VIDEO'
            );


            if (
                !url ||
                typeof url !== 'string'
            ) {

                throw new Error(
                    'Invalid YouTube URL.'
                );

            }


            const output =
                await runYtDlp([

                    '--js-runtimes',
                    `deno:${DENO_PATH}`,

                    '--dump-single-json',

                    isPlaylist
                        ? '--flat-playlist'
                        : '--no-playlist',

                    '--no-warnings',

                    '--skip-download',

                    url

                ]);


            const info =
                JSON.parse(output);

            console.log(
                'Playlist entries:',
                Array.isArray(info.entries)
                    ? info.entries.length
                    : 'NO ENTRIES'
            );

            if (
                Array.isArray(info.entries) &&
                info.entries.length > 0
            ) {

                console.log(
                    'FIRST PLAYLIST ENTRY:',
                    JSON.stringify(
                        info.entries[0],
                        null,
                        2
                    )
                );

            }


            const playlistEntries =
                isPlaylist &&
                Array.isArray(
                    info.entries
                )
                    ? info.entries
                        .filter(Boolean)
                        .map(
                            entry => {

                                const videoId =
                                    entry.id ||
                                    '';


                                const rawUrl =
                                    entry.webpage_url ||
                                    entry.url ||
                                    '';


                                let cleanWebpageUrl =
                                    '';


                                if (
                                    videoId
                                ) {

                                    cleanWebpageUrl =
                                        `https://www.youtube.com/watch?v=${videoId}`;

                                } else if (
                                    rawUrl
                                ) {

                                    cleanWebpageUrl =
                                        rawUrl.split(/[?&]list=/)[0];

                                }


                                return {

                                    id:
                                        videoId,

                                    title:
                                        entry.title ||
                                        'Unknown title',

                                    webpageUrl:
                                        cleanWebpageUrl,

                                    thumbnail:
                                        entry.thumbnail ||
                                        '',

                                    duration:
                                        Number(
                                            entry.duration
                                        ) || 0,

                                    durationFormatted:
                                        formatDuration(
                                            Number(
                                                entry.duration
                                            ) || 0
                                        ),

                                    subtitleLanguages: []

                                };

                            }
                        )
                    : [];

            console.log(
                'Prepared playlist entries:',
                playlistEntries.length
            );

            let playlistSubtitleLanguages =
                new Set(['ar', 'en']);

            console.log(
                'Playlist subtitle languages set to default:',
                Array.from(
                    playlistSubtitleLanguages
                )
            );

            const title =
                info.title ||
                'Unknown title';


            const duration =
                Number(info.duration) ||
                0;


            const thumbnail =
                info.thumbnail ||
                '';


            const formats =
                Array.isArray(info.formats)
                    ? info.formats
                    : [];


            /**
             * Resolves or calculates estimated file size for a given stream format.
             * Checks exact filesize, approximate filesize, and falls back to bitrate * duration.
             *
             * @param {object} format - Stream format metadata object from yt-dlp.
             * @param {number} duration - Video duration in seconds.
             * @returns {number} Size in bytes.
             */
            function getFileSize(
                format,
                duration
            ) {

                const filesize =
                    Number(format.filesize) ||
                    0;


                if (
                    filesize > 0
                ) {

                    return filesize;

                }


                const approximate =
                    Number(format.filesize_approx) ||
                    0;


                if (
                    approximate > 0
                ) {

                    return approximate;

                }


                let bitrate =
                    Number(format.tbr) ||
                    Number(format.vbr) ||
                    Number(format.abr) ||
                    0;


                if (
                    bitrate <= 0 &&
                    Number(format.height) > 0
                ) {

                    const h =
                        Number(format.height);


                    if (h >= 2160) bitrate = 15000;
                    else if (h >= 1440) bitrate = 8000;
                    else if (h >= 1080) bitrate = 4000;
                    else if (h >= 720) bitrate = 2500;
                    else if (h >= 480) bitrate = 1200;
                    else if (h >= 360) bitrate = 700;
                    else bitrate = 400;

                }


                if (
                    bitrate <= 0 &&
                    format.acodec &&
                    format.acodec !== 'none'
                ) {

                    bitrate = 128;

                }


                if (
                    bitrate > 0 &&
                    duration > 0
                ) {

                    return (
                        bitrate *
                        1000 *
                        duration /
                        8
                    );

                }


                return 0;

            }


            const audioFormats =
                formats
                    .filter(
                        (format) => {

                            return (
                                format.acodec &&
                                format.acodec !== 'none' &&
                                (
                                    !format.vcodec ||
                                    format.vcodec === 'none'
                                )
                            );

                        }
                    )
                    .map(
                        (format) => {

                            return {

                                formatId:
                                    format.format_id,

                                filesize:
                                    getFileSize(
                                        format,
                                        duration
                                    ),

                                abr:
                                    Number(
                                        format.abr
                                    ) ||
                                    Number(
                                        format.tbr
                                    ) ||
                                    0,

                                ext:
                                    format.ext ||
                                    ''

                            };

                        }
                    )
                    .sort(
                        (a, b) => {

                            if (
                                a.filesize > 0 &&
                                b.filesize === 0
                            ) {

                                return -1;

                            }


                            if (
                                a.filesize === 0 &&
                                b.filesize > 0
                            ) {

                                return 1;

                            }


                            return (
                                b.abr -
                                a.abr
                            );

                        }
                    );


            const bestAudio =
                audioFormats.length > 0
                    ? audioFormats[0]
                    : null;


            const standardQualities = [

                144,
                240,
                360,
                480,
                720,
                1080,
                1440,
                2160

            ];


            /**
             * Maps raw video dimensions to the nearest standard YouTube resolution height
             * (144, 240, 360, 480, 720, 1080, 1440, 2160).
             *
             * @param {number} width - Video width in pixels.
             * @param {number} height - Video height in pixels.
             * @returns {number} Standardized resolution height (e.g. 720, 1080).
             */
            function getStandardQuality(
                width,
                height
            ) {

                const smallerDimension =
                    Math.min(
                        Number(width) || 0,
                        Number(height) || 0
                    );


                if (
                    smallerDimension <= 0
                ) {

                    return 0;

                }


                let result = 0;


                for (
                    const quality
                    of standardQualities
                ) {

                    if (
                        quality <=
                        smallerDimension
                    ) {

                        result =
                            quality;

                    }

                }


                return result;

            }


            const videoFormats =
                formats
                    .filter(
                        (format) => {

                            return (
                                format.vcodec &&
                                format.vcodec !== 'none' &&
                                Number(format.width) > 0 &&
                                Number(format.height) > 0
                            );

                        }
                    )
                    .map(
                        (format) => {

                            const width =
                                Number(
                                    format.width
                                ) || 0;


                            const height =
                                Number(
                                    format.height
                                ) || 0;


                            const quality =
                                Math.min(
                                    width,
                                    height
                                );


                            const standardQuality =
                                getStandardQuality(
                                    width,
                                    height
                                );


                            const videoSize =
                                getFileSize(
                                    format,
                                    duration
                                );


                            const audioSize =
                                bestAudio
                                    ? getFileSize(
                                        bestAudio,
                                        duration
                                    )
                                    : 0;


                            let estimatedSizeBytes =
                                0;


                            if (
                                format.acodec &&
                                format.acodec !== 'none'
                            ) {

                                estimatedSizeBytes =
                                    videoSize;

                            } else {

                                if (
                                    videoSize > 0 &&
                                    audioSize > 0
                                ) {

                                    estimatedSizeBytes =
                                        videoSize +
                                        audioSize;

                                } else if (
                                    videoSize > 0
                                ) {

                                    estimatedSizeBytes =
                                        videoSize;

                                } else {

                                    estimatedSizeBytes =
                                        audioSize;

                                }

                            }


                            const estimatedSize =
                                estimatedSizeBytes > 0
                                    ? (
                                        estimatedSizeBytes /
                                        (1024 * 1024)
                                    )
                                    : 0;

                            return {

                                formatId:
                                    format.format_id,

                                resolution:
                                    format.resolution ||
                                    `${width}x${height}`,

                                width,

                                height,

                                quality,

                                standardQuality,

                                ext:
                                    format.ext ||
                                    '',

                                protocol:
                                    format.protocol ||
                                    '',

                                fps:
                                    Number(
                                        format.fps
                                    ) || 0,

                                filesize:
                                    videoSize,

                                audioFilesize:
                                    audioSize,

                                estimatedSize,

                                filesizeMB:
                                    estimatedSize > 0
                                        ? estimatedSize
                                        : 0,

                                hasAudio:
                                    !!(
                                        format.acodec &&
                                        format.acodec !== 'none'
                                    )

                            };

                        }
                    )
                    .filter(
                        (format) => {

                            return (
                                format.standardQuality > 0
                            );

                        }
                    );


            const qualityMap =
                new Map();


            for (
                const format
                of videoFormats
            ) {

                const quality =
                    format.standardQuality;


                const existing =
                    qualityMap.get(
                        quality
                    );


                if (
                    !existing
                ) {

                    qualityMap.set(
                        quality,
                        format
                    );

                    continue;

                }


                const existingDistance =
                    Math.abs(
                        existing.quality -
                        quality
                    );


                const currentDistance =
                    Math.abs(
                        format.quality -
                        quality
                    );


                if (
                    currentDistance <
                    existingDistance
                ) {

                    qualityMap.set(
                        quality,
                        format
                    );

                    continue;

                }


                // Prefer direct HTTPS stream over m3u8 stream for accurate size estimation
                const isFormatM3u8 = (format.protocol || '').includes('m3u8');
                const isExistingM3u8 = (existing.protocol || '').includes('m3u8');
                if (!isFormatM3u8 && isExistingM3u8) {
                    qualityMap.set(quality, format);
                    continue;
                }
                if (isFormatM3u8 && !isExistingM3u8) {
                    continue;
                }

                if (
                    format.ext === 'mp4' &&
                    existing.ext !== 'mp4'
                ) {

                    qualityMap.set(
                        quality,
                        format
                    );

                    continue;

                }


                if (
                    format.hasAudio &&
                    !existing.hasAudio
                ) {

                    qualityMap.set(
                        quality,
                        format
                    );

                }

            }


            const uniqueFormats =
                Array.from(
                    qualityMap.values()
                )
                .sort(
                    (a, b) => {

                        return (
                            b.standardQuality -
                            a.standardQuality
                        );

                    }
                );


            const subtitles = [];


            const manualSubtitles =
                info.subtitles &&
                typeof info.subtitles === 'object'
                    ? info.subtitles
                    : {};


            const automaticSubtitles =
                info.automatic_captions &&
                typeof info.automatic_captions === 'object'
                    ? info.automatic_captions
                    : {};


            for (
                const language of Object.keys(
                    manualSubtitles
                )
            ) {

                subtitles.push({

                    language,

                    manual: true,

                    autoGenerated: false

                });

            }


            for (
                const language of Object.keys(
                    automaticSubtitles
                )
            ) {
                const existing =
                    subtitles.find(
                        (subtitle) =>
                            subtitle.language ===
                            language
                    );


                if (
                    existing
                ) {

                    existing.autoGenerated =
                        true;

                } else {

                    subtitles.push({

                        language,

                        manual: false,

                        autoGenerated: true

                    });

                }

            }


            for (
                const language
                of playlistSubtitleLanguages
            ) {

                const existing =
                    subtitles.find(
                        (subtitle) =>
                            subtitle.language ===
                            language
                    );


                if (
                    !existing
                ) {

                    subtitles.push({

                        language,

                        manual: false,

                        autoGenerated: true

                    });

                }

            }


            return {

                success: true,
                data: {

                    id:
                        info.id ||
                        '',

                    title,

                    thumbnail,

                    duration,

                    durationFormatted:
                        formatDuration(
                            duration
                        ),

                    uploader:
                        info.uploader ||
                        '',

                    channel:
                        info.channel ||
                        '',

                    webpageUrl:
                        info.webpage_url ||
                        url,

                    playlistEntries:
                        playlistEntries,    
                    
                    formats:
                        uniqueFormats,

                    subtitles:
                        subtitles,

                    playlistSubtitleLanguages:
                        Array.from(
                            playlistSubtitleLanguages
                        ),

                    audioFormats:

                        audioFormats.map(
                            (format) => {

                                const filesizeMB =
                                    format.filesize > 0
                                        ? format.filesize /
                                        (1024 * 1024)
                                        : 0;


                                return {

                                    formatId:
                                        format.formatId,

                                    filesize:
                                        format.filesize,

                                    filesizeMB,

                                    abr:
                                        format.abr,

                                    ext:
                                        format.ext

                                };

                            }
                        ),

                    audio:

                        bestAudio
                            ? {

                                formatId:
                                    bestAudio.formatId,

                                filesize:
                                    bestAudio.filesize,

                                abr:
                                    bestAudio.abr,

                                ext:
                                    bestAudio.ext

                            }
                            : null

                }

            };


        } catch (error) {

            console.error(
                'Analyze error:',
                error
            );


            return {

                success: false,

                message:
                    error.message ||
                    'Failed to analyze URL.'

            };

        }

    }
);


// ============================================================================
// IPC Handler: Standalone Subtitle Download & Conversion
// ============================================================================

/**
 * Handles 'download-subtitles' requests from the renderer process.
 * 
 * Downloads subtitles for single videos or playlists in WebVTT format,
 * strips styling artifacts and metadata, converts them to clean SubRip (.srt) files,
 * and organizes them into a dedicated 'With Subtitles' output directory.
 *
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event context.
 * @param {object} options - Subtitle options { url, language, outputFolder, isPlaylist, ... }
 * @returns {Promise<{success: boolean, message?: string}>} Download status.
 */
ipcMain.handle(
    'download-subtitles',
    async (event, options) => {

        try {

            if (
                !options ||
                typeof options !== 'object'
            ) {

                throw new Error(
                    'Invalid subtitle download options.'
                );

            }


            const url =
                typeof options.url === 'string'
                    ? options.url.trim()
                    : '';


            const outputDir =
                typeof options.outputDir === 'string' &&
                options.outputDir.trim()
                    ? options.outputDir.trim()
                    : '';

            if (!outputDir) {
                throw new Error('Please select a download folder.');
            }


            const language =
                typeof options.language === 'string'
                    ? options.language.trim()
                    : '';


            if (
                !language ||
                language === 'none'
            ) {

                return {

                    success: true,

                    skipped: true,

                    message:
                        'No subtitles selected.',

                    outputDir

                };

            }


            if (!url) {

                throw new Error(
                    'YouTube URL is required.'
                );

            }


            const playlistEntries =
                Array.isArray(
                    options.playlistEntries
                )
                    ? options.playlistEntries
                    : [];


            const isPlaylist =
                playlistEntries.length > 0;

            fs.mkdirSync(
                outputDir,
                {
                    recursive: true
                }
            );


            const outputTemplate =
                path.join(
                    outputDir,
                    '%(title)s [%(id)s].%(ext)s'
                );


            if (
                isPlaylist
            ) {

                let downloadedCount = 0;
                let skippedCount = 0;
                const downloadedFiles = [];
                const skippedVideos = [];


                for (
                    let i = 0;
                    i < playlistEntries.length;
                    i++
                ) {

                    const entry =
                        playlistEntries[i];


                    const videoUrl =
                        entry.webpageUrl ||
                        entry.webpage_url ||
                        entry.url ||
                        '';


                    const videoTitle =
                        entry.title ||
                        `Video ${i + 1}`;

                    const videoId =
                        entry.id ||
                        '';


                    console.log(
                        `\n[${i + 1}/${playlistEntries.length}] ${videoTitle}`
                    );


                    if (
                        !videoUrl
                    ) {

                        skippedCount++;

                        skippedVideos.push({
                            title: videoTitle,
                            reason: 'No video URL.'
                        });

                        continue;

                    }


                    try {

                        const playlistOutputDir =
                            path.join(
                                outputDir,
                                'Subtitles'
                            );


                        fs.mkdirSync(
                            playlistOutputDir,
                            {
                                recursive: true
                            }
                        );


                        const playlistOutputTemplate =
                            path.join(
                                playlistOutputDir,
                                '%(title)s [%(id)s].%(ext)s'
                            );


                        const downloadPlaylistSource =
                            async () => {

                                const downloadArgs = [

                                    '--js-runtimes',
                                    `deno:${DENO_PATH}`,

                                    '--extractor-args',
                                    'youtube:player_client=web,android',

                                    '--user-agent',
                                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',

                                    '--no-cache-dir',

                                    '--sleep-requests',
                                    '1',

                                    '--sleep-subtitles',
                                    '2',

                                    '--retries',
                                    '5',

                                    '--retry-sleep',
                                    'http:exp=2:15',

                                    '--no-check-certificates',

                                    '--no-playlist',

                                    '--skip-download',

                                    '--write-subs',

                                    '--write-auto-subs',

                                    '--sub-langs',
                                    language,

                                    '--sub-format',
                                    'vtt',

                                    '--windows-filenames',

                    '--force-overwrites',

                    '--force-overwrites',

                                    '-o',
                                    playlistOutputTemplate,

                                    videoUrl

                                ];


                                try {

                                    const result =
                                        await downloadWithRetry(
                                            downloadArgs,
                                            null,
                                            3
                                        );


                                    console.log(
                                        `Subtitle output for "${videoTitle}":`,
                                        result
                                    );


                                    if (
                                        typeof result === 'string' &&
                                        result.includes(
                                            'There are no subtitles for the requested languages'
                                        )
                                    ) {

                                        return false;

                                    }


                                    return true;

                                }
                                catch (
                                    error
                                ) {

                                    console.log(
                                        `Subtitle failed for "${videoTitle}":`,
                                        error.message
                                    );


                                    return false;

                                }

                            };


                        const success =
                            await downloadPlaylistSource();            


                        if (
                            !success
                        ) {

                            skippedCount++;

                            skippedVideos.push({
                                title: videoTitle,
                                reason: `No ${language} subtitle available.`
                            });

                            console.log(
                                `↷ Skipped: ${videoTitle}`
                            );

                            continue;

                        }


                        const files =
                            fs.readdirSync(
                                playlistOutputDir
                            );


                        const safeLanguage =
                            language.replace(
                                /[.*+?^${}()|[\]\\]/g,
                                '\\$&'
                            );

                        const safeVideoId =
                            videoId.replace(
                                /[.*+?^${}()|[\]\\]/g,
                                '\\$&'
                            );


                        const vttRegex =
                            safeVideoId
                                ? new RegExp(
                                    `\\[${safeVideoId}\\]\\.${safeLanguage}(?:[-_].+)?\\.vtt$`,
                                    'i'
                                )
                                : new RegExp(
                                    `\\.${safeLanguage}(?:[-_].+)?\\.vtt$`,
                                    'i'
                                );


                        const vttCandidates =
                            files.filter(
                                file =>
                                    vttRegex.test(
                                        file
                                    )
                            );


                        if (
                            !vttCandidates.length
                        ) {

                            skippedCount++;

                            skippedVideos.push({
                                title: videoTitle,
                                reason: 'Subtitle file was not found.'
                            });

                            continue;

                        }


                        const vttFile =
                            vttCandidates
                                .sort(
                                    (a, b) => {

                                        const aTime =
                                            fs.statSync(
                                                path.join(
                                                    playlistOutputDir,
                                                    a
                                                )
                                            ).mtimeMs;


                                        const bTime =
                                            fs.statSync(
                                                path.join(
                                                    playlistOutputDir,
                                                    b
                                                )
                                            ).mtimeMs;


                                        return (
                                            bTime -
                                            aTime
                                        );

                                    }
                                )[0];


                        const vttPath =
                            path.join(
                                playlistOutputDir,
                                vttFile
                            );


                        const srtFile =
                            vttFile.replace(
                                /\.vtt$/i,
                                '.srt'
                            );


                        const srtPath =
                            path.join(
                                playlistOutputDir,
                                srtFile
                            );


                        cleanVttToSrt(
                            vttPath,
                            srtPath
                        );


                        if (
                            fs.existsSync(
                                vttPath
                            )
                        ) {

                            fs.unlinkSync(
                                vttPath
                            );

                        }


                        if (
                            !fs.existsSync(
                                srtPath
                            )
                        ) {

                            skippedCount++;

                            skippedVideos.push({
                                title: videoTitle,
                                reason: 'Subtitle conversion failed.'
                            });

                            continue;

                        }


                        downloadedCount++;

                        downloadedFiles.push({
                            title: videoTitle,
                            file: srtFile
                        });

                        console.log(
                            `✓ Downloaded: ${videoTitle}`
                        );

                    }
                    catch (
                        error
                    ) {

                        skippedCount++;

                        skippedVideos.push({
                            title: videoTitle,
                            reason: error.message
                        });

                        console.log(
                            `↷ Skipped: ${videoTitle}`
                        );

                    }

                }


                console.log(
                    '\n========================================'
                );


                console.log(
                    'Playlist subtitle download finished'
                );


                console.log(
                    `Downloaded: ${downloadedCount}`
                );


                console.log(
                    `Skipped: ${skippedCount}`
                );


                console.log(
                    '========================================'
                );


                return {

                    success:
                        downloadedCount > 0,

                    skipped:
                        downloadedCount === 0,

                    message:
                        `Downloaded ${downloadedCount} subtitle(s). Skipped ${skippedCount} video(s).`,

                    outputDir,

                    downloadedCount,

                    skippedCount,

                    downloadedFiles,

                    skippedVideos

                };

            }


            const downloadSource =
                async (
                    source
                ) => {

                    const args = [

                        '--js-runtimes',
                        `deno:${DENO_PATH}`,

                        '--extractor-args',
                        'youtube:player_client=web,android',

                        '--user-agent',
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',

                        '--no-cache-dir',

                        '--sleep-requests',
                        '1',

                        '--sleep-subtitles',
                        '2',

                        '--retries',
                        '5',

                        '--retry-sleep',
                        'http:exp=2:15',

                        '--no-check-certificates',

                        '--no-playlist',

                        '--skip-download',

                        source === 'auto'
                            ? '--write-auto-subs'
                            : '--write-subs',

                        '--sub-langs',
                        language,

                        '--sub-format',
                        'vtt',

                        '--windows-filenames',

                        ...(collisionAction === 'overwrite' ? ['--force-overwrites'] : []),

                        '-o',
                        outputTemplate,

                        url

                    ];


                    try {

                        const result =
                            await downloadWithRetry(
                                args,
                                null,
                                3
                            );


                        console.log(
                            "yt-dlp subtitle output:",
                            result
                        );


                        if (
                            typeof result === 'string' &&
                            result.includes(
                                "There are no subtitles for the requested languages"
                            )
                        ) {

                            return false;

                        }


                        return result;

                    } catch (error) {

                        console.log(
                            "Subtitle source failed:",
                            error.message
                        );

                        return false;

                    }

                };


            let success =
                await downloadSource(
                    'manual'
                );


            if (
                !success
            ) {

                console.log(
                    "Trying automatic subtitles..."
                );


                success =
                    await downloadSource(
                        'auto'
                    );

            }


            if (
                !success
            ) {

                throw new Error(
                    `No ${language} subtitle could be downloaded.`
                );

            }


            const files =
                fs.readdirSync(
                    outputDir
                );


            const safeLanguage =
                language
                    .replace(
                        /[.*+?^${}()|[\]\\]/g,
                        '\\$&'
                    );


            const vttRegex =
                new RegExp(
                    `\\.${safeLanguage}(?:[-_].+)?\\.vtt$`,
                    'i'
                );


            const vttCandidates =
                files.filter(
                    file =>
                        vttRegex.test(
                            file
                        )
                );


            if (
                !vttCandidates.length
            ) {

                throw new Error(
                    'Subtitle file was downloaded but could not be found.'
                );

            }


            const vttFile =
                vttCandidates[0];


            const vttPath =
                path.join(
                    outputDir,
                    vttFile
                );


            const srtFile =
                vttFile.replace(
                    /\.vtt$/i,
                    '.srt'
                );


            const srtPath =
                path.join(
                    outputDir,
                    srtFile
                );


            cleanVttToSrt(
                vttPath,
                srtPath
            );


            if (
                fs.existsSync(
                    vttPath
                )
            ) {

                fs.unlinkSync(
                    vttPath
                );

            }


            if (
                !fs.existsSync(
                    srtPath
                )
            ) {

                throw new Error(
                    'Subtitle conversion failed.'
                );

            }


            return {

                success: true,

                skipped: false,

                message:
                    'Subtitle downloaded and cleaned successfully.',

                outputDir,

                file:
                    srtFile

            };


        } catch (error) {

            console.error(
                'Subtitle download error:',
                error
            );


            return {

                success: false,

                message:
                    error.message ||
                    'Failed to download subtitles.'

            };

        }

    }
);


// ============================================================================
// IPC Handler: Media Download Pipeline (Video & Audio)
// ============================================================================

ipcMain.handle('pause-download', () => {
    downloadState.isPaused = true;
    if (activeYtDlpProcess && activeYtDlpProcess.pid) {
        killProcessTree(activeYtDlpProcess.pid);
        activeYtDlpProcess = null;
    }
    return { success: true, isPaused: true };
});

ipcMain.handle('resume-download', () => {
    downloadState.isPaused = false;
    if (typeof downloadState.resumePromiseResolve === 'function') {
        const resolve = downloadState.resumePromiseResolve;
        downloadState.resumePromiseResolve = null;
        resolve();
    }
    return { success: true, isPaused: false };
});

ipcMain.handle('cancel-download', () => {
    downloadState.isCancelled = true;
    downloadState.isPaused = false;
    if (typeof downloadState.resumePromiseResolve === 'function') {
        const resolve = downloadState.resumePromiseResolve;
        downloadState.resumePromiseResolve = null;
        resolve();
    }
    if (activeYtDlpProcess && activeYtDlpProcess.pid) {
        killProcessTree(activeYtDlpProcess.pid);
        activeYtDlpProcess = null;
    }
    return { success: true, isCancelled: true };
});

/**
 * Handles 'check-existing-files' requests from the renderer process.
 */
ipcMain.handle('check-existing-files', async (event, params) => {
    try {
        const { outputDir, items, type, audioFormat, language } = params || {};
        if (!outputDir || !items || !Array.isArray(items) || items.length === 0) {
            return { hasConflict: false, conflicts: [] };
        }

        const conflicts = [];
        for (const item of items) {
            const rawTitle = typeof item === 'string' ? item : (item && item.title ? item.title : '');
            if (!rawTitle) continue;
            const existingFile = findExistingFile(outputDir, rawTitle, type, audioFormat, language);
            if (existingFile) {
                conflicts.push({
                    title: rawTitle,
                    fileName: existingFile
                });
            }
        }

        return {
            hasConflict: conflicts.length > 0,
            conflicts
        };
    } catch (err) {
        console.error('Error in check-existing-files:', err);
        return { hasConflict: false, conflicts: [] };
    }
});

/**
 * Handles 'download-media' requests from the renderer process.
 * 
 * Manages the full downloading and post-processing pipeline for both Video
 * and Audio requests:
 *  - Format resolution: constructs yt-dlp format strings matching requested
 *    resolution (e.g. 1080p, 720p) or audio quality.
 *  - High-res muxing: downloads separate video + audio DASH streams and combines
 *    them into a standard MP4 container using bundled ffmpeg.exe.
 *  - Resilient downloads: applies Deno JavaScript runtime for n-sig signature
 *    deciphering, mobile/web client spoofing, and automatic retry mechanisms.
 *  - Progress reporting: passes progress updates to createUnifiedProgressHandler
 *    for real-time percentage, speed, and ETA feedback in the UI.
 *
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event context.
 * @param {object} options - Options { url, type ('video'|'audio'), quality, outputFolder, isPlaylist, ... }
 * @returns {Promise<{success: boolean, message?: string, outputDir?: string}>} Download outcome.
 */
ipcMain.handle(
    'download-media',
    async (event, options) => {

        try {

            if (
                !options ||
                typeof options !== 'object'
            ) {

                throw new Error(
                    'Invalid download options.'
                );

            }


            const url =
                typeof options.url === 'string'
                    ? options.url.trim()
                    : '';


            const type =
                typeof options.type === 'string'
                    ? options.type.trim()
                    : '';


            const rawQuality =
                typeof options.quality === 'string'
                    ? options.quality.trim()
                    : '';


            const audioFormat =
                typeof options.audioFormat === 'string'
                    ? options.audioFormat.trim()
                    : 'mp3';

            const collisionAction =
                typeof options.collisionAction === 'string'
                    ? options.collisionAction.trim()
                    : 'overwrite';

            const videoTitle =
                typeof options.title === 'string'
                    ? options.title.trim()
                    : '';

            downloadState.isCancelled = false;
            downloadState.isPaused = false;
            downloadState.resumePromiseResolve = null;


            const outputDir =
                typeof options.outputDir === 'string' &&
                options.outputDir.trim()
                    ? options.outputDir.trim()
                    : '';

            if (!outputDir) {
                throw new Error('Please select a download folder.');
            }


            if (
                !url
            ) {

                throw new Error(
                    'YouTube URL is required.'
                );

            }


            if (
                type !== 'video' &&
                type !== 'audio'
            ) {

                throw new Error(
                    'Invalid download type.'
                );

            }


            fs.mkdirSync(
                outputDir,
                {
                    recursive: true
                }
            );


            // ----------------------------------------------------------------
            // Video Download Pipeline: Separate Streams + Remux/Merge to MP4
            // ----------------------------------------------------------------
            if (type === 'video') {

                const cleanQuality =
                    rawQuality.replace(/p$/i, '').trim();

                const height =
                    cleanQuality === 'best' || !cleanQuality
                        ? 'best'
                        : Number(cleanQuality);

                let format;
                let formatSort;

                if (
                    height === 'best' || isNaN(height)
                ) {

                    format =
                        'bestvideo+bestaudio/best';
                    formatSort = 'res,vcodec:h264,fps';

                } else {

                    format =
                        `bestvideo[height<=?${height}]+bestaudio/` +
                        `best[height<=?${height}]/` +
                        'best';
                    formatSort = `res:${height},vcodec:h264,fps`;

                }


                let renameSuffix = '';
                if (collisionAction === 'rename' && videoTitle) {
                    const nextIdx = getNextRenameIndex(outputDir, videoTitle, 'video');
                    if (nextIdx > 0) {
                        renameSuffix = ` (${nextIdx})`;
                    }
                }

                const outputTemplate =
                    path.join(
                        outputDir,
                        `%(title)s${renameSuffix}.%(ext)s`
                    );


                console.log('>>> [MEDIA DOWNLOAD] Target:', url);
                console.log('>>> [MEDIA DOWNLOAD] Requested Quality:', rawQuality, 'Height:', height);
                console.log('>>> [MEDIA DOWNLOAD] Format Selector:', format);
                console.log('>>> [MEDIA DOWNLOAD] Format Sort:', formatSort);

                const args = [

                    '--js-runtimes',
                    `deno:${DENO_PATH}`,

                    '-S',
                    formatSort,

                    '--no-cache-dir',

                    '--sleep-requests',
                    '1',

                    '--retries',
                    '10',

                    '--fragment-retries',
                    '10',

                    '--no-check-certificates',

                    '--no-playlist',

                    ...(collisionAction === 'overwrite' ? ['--force-overwrites'] : ['-c']),

                    '-f',
                    format,

                    '--ffmpeg-location',
                    FFMPEG_PATH,

                    '--merge-output-format',
                    'mp4',

                    '--remux-video',
                    'mp4',

                    '--windows-filenames',

                    '--newline',

                    '--progress',

                    '-o',
                    outputTemplate,

                    url

                ];

                if (collisionAction === 'overwrite' && videoTitle) {
                    try {
                        const existingMatch = findExistingFile(outputDir, videoTitle, 'video');
                        if (existingMatch) {
                            try {
                                fs.unlinkSync(path.join(outputDir, existingMatch));
                                console.log('>>> [OVERWRITE] Removed existing video file:', existingMatch);
                            } catch (uErr) {
                                console.warn('Could not unlink old video file:', uErr);
                            }
                        }
                    } catch (cleanErr) {
                        console.warn('Error cleaning existing file for overwrite:', cleanErr);
                    }
                }


                const unifiedProgress =
                    createUnifiedProgressHandler(
                        (progressText) => {

                            sendProgress(
                                event,
                                progressText
                            );

                        }
                    );


                await downloadWithRetry(
                    args,
                    unifiedProgress,
                    3
                );


                return {

                    success: true,

                    message:
                        'Video downloaded and merged successfully.',

                    outputDir

                };

            }


            // ----------------------------------------------------------------
            // Audio Download Pipeline: Extract High-Quality Audio Stream
            // ----------------------------------------------------------------
            if (
                type === 'audio'
            ) {

                let audioRenameSuffix = '';
                if (collisionAction === 'rename' && videoTitle) {
                    const nextIdx = getNextRenameIndex(outputDir, videoTitle, 'audio', audioFormat);
                    if (nextIdx > 0) {
                        audioRenameSuffix = ` (${nextIdx})`;
                    }
                }

                const outputTemplate =
                    path.join(
                        outputDir,
                        `%(title)s${audioRenameSuffix}.%(ext)s`
                    );

                // Use the explicitly selected formatId (e.g., 251 for Opus or 140 for AAC m4a),
                // falling back to the highest available audio bitrate.
                const formatSpec =
                    (rawQuality && rawQuality !== 'best')
                        ? `${rawQuality}/bestaudio/ba/best`
                        : 'bestaudio/ba/best';

                const args = [

                    '--js-runtimes',
                    `deno:${DENO_PATH}`,

                    '--no-cache-dir',

                    '--sleep-requests',
                    '1',

                    '--retries',
                    '10',

                    '--fragment-retries',
                    '10',

                    '--no-check-certificates',

                    '--no-playlist',

                    ...(collisionAction === 'overwrite' ? ['--force-overwrites'] : ['-c']),

                    '-f',
                    formatSpec,

                    '-x',

                    '--ffmpeg-location',
                    FFMPEG_PATH,

                    '--windows-filenames',

                    '--newline',

                    '--progress',

                    '-o',
                    outputTemplate,

                    url

                ];

                if (collisionAction === 'overwrite' && videoTitle) {
                    try {
                        const existingMatch = findExistingFile(outputDir, videoTitle, 'audio', audioFormat);
                        if (existingMatch) {
                            try {
                                fs.unlinkSync(path.join(outputDir, existingMatch));
                                console.log('>>> [OVERWRITE] Removed existing audio file:', existingMatch);
                            } catch (uErr) {
                                console.warn('Could not unlink old audio file:', uErr);
                            }
                        }
                    } catch (cleanErr) {
                        console.warn('Error cleaning existing audio file for overwrite:', cleanErr);
                    }
                }

                await downloadWithRetry(
                    args,
                    (progressText) => {

                        sendProgress(
                            event,
                            progressText
                        );

                    },
                    3
                );


                return {

                    success: true,

                    message:
                        'Audio downloaded successfully.',

                    outputDir

                };

            }


        } catch (error) {

            if (error.message === 'DOWNLOAD_CANCELLED' || downloadState.isCancelled) {
                return {
                    success: false,
                    cancelled: true,
                    message: 'Download cancelled by user.'
                };
            }

            console.error(
                'Media download error:',
                error
            );


            return {

                success: false,

                message:
                    error.message ||
                    'Download failed.'

            };

        }

    }
);


// ============================================================================
// Subtitle Processing & WebVTT to SubRip (.srt) Conversion
// ============================================================================

/**
 * Parses a downloaded WebVTT (.vtt) file, removes HTML/styling artifacts,
 * eliminates duplicate rolling subtitle cues, adjusts timestamps, and writes
 * a clean, standard SubRip (.srt) subtitle file.
 *
 * @param {string} vttPath - Absolute path to the source .vtt subtitle file.
 * @param {string} srtPath - Destination path for the converted .srt file.
 */
function cleanVttToSrt(
    vttPath,
    srtPath
) {

    const content =
        fs.readFileSync(
            vttPath,
            'utf8'
        );


    const lines =
        content.split(/\r?\n/);


    const subtitles = [];


    let currentCue = null;


    for (
        let i = 0;
        i < lines.length;
        i++
    ) {

        const line =
            lines[i].trim();


        if (
            !line ||
            line === 'WEBVTT' ||
            line.startsWith('NOTE') ||
            line.startsWith('STYLE') ||
            line.startsWith('REGION')
        ) {

            continue;

        }


        if (
            line.includes('-->')
        ) {

            const parts =
                line.split('-->');


            if (
                parts.length < 2
            ) {

                continue;

            }


            const start =
                parts[0].trim();


            const end =
                parts[1]
                    .trim()
                    .split(/\s+/)[0];


            currentCue = {

                start,

                end,

                text: ''

            };


            subtitles.push(
                currentCue
            );


            continue;

        }


        if (
            currentCue
        ) {

            currentCue.text +=
                (
                    currentCue.text
                        ? ' '
                        : ''
                ) +
                line;

        }

    }


    const cleaned = [];


    for (
        const cue of subtitles
    ) {

        let text =
            cue.text;


        text =
            text.replace(
                /<\d{2}:\d{2}:\d{2}\.\d{3}>/g,
                ''
            );


        text =
            text.replace(
                /<\/?c(?:\.[^>]*)?>/g,
                ''
            );


        text =
            text.replace(
                /<[^>]+>/g,
                ''
            );


        text =
            text
                .replace(
                    /&nbsp;/g,
                    ' '
                )
                .replace(
                    /&amp;/g,
                    '&'
                )
                .replace(
                    /&lt;/g,
                    '<'
                )
                .replace(
                    /&gt;/g,
                    '>'
                );


        text =
            text
                .replace(
                    /\s+/g,
                    ' '
                )
                .trim();


        if (
            !text
        ) {

            continue;

        }


        const startMs =
            subtitleTimeToMs(
                cue.start
            );


        const endMs =
            subtitleTimeToMs(
                cue.end
            );


        if (
            endMs - startMs < 100
        ) {

            continue;

        }


        const previous =
            cleaned[
                cleaned.length - 1
            ];


        if (
            previous &&
            previous.text === text
        ) {

            continue;

        }


        cleaned.push({

            start:
                cue.start,

            end:
                cue.end,

            text

        });

    }


    const finalSubtitles = [];


    for (
        const cue of cleaned
    ) {

        const previous =
            finalSubtitles[
                finalSubtitles.length - 1
            ];


        if (
            previous
        ) {

            const previousWords =
                previous.text
                    .split(/\s+/);


            const currentWords =
                cue.text
                    .split(/\s+/);


            let common = 0;


            while (
                common <
                    previousWords.length &&
                common <
                    currentWords.length &&
                previousWords[common]
                    .toLowerCase() ===
                currentWords[common]
                    .toLowerCase()
            ) {

                common++;

            }


            if (
                common ===
                    previousWords.length &&
                currentWords.length >
                    common
            ) {

                const newText =
                    currentWords
                        .slice(common)
                        .join(' ');


                if (
                    newText.trim()
                ) {

                    cue.text =
                        newText.trim();

                }

            }

        }


        finalSubtitles.push(
            cue
        );

    }


    let output = '';


    finalSubtitles.forEach(
        (
            subtitle,
            index
        ) => {

            const start =
                convertVttTimeToSrt(
                    subtitle.start
                );


            const end =
                convertVttTimeToSrt(
                    subtitle.end
                );


            output +=
`${index + 1}
${start} --> ${end}
${subtitle.text}

`;

        }
    );


    fs.writeFileSync(
        srtPath,
        output,
        'utf8'
    );

}


// ============================================================================
// Timestamp Parsing & Duration Formatting Helpers
// ============================================================================

/**
 * Parses a subtitle timestamp string (HH:MM:SS.mmm or HH:MM:SS,mmm) into milliseconds.
 *
 * @param {string} time - Subtitle timestamp string.
 * @returns {number} Time offset in milliseconds.
 */
function subtitleTimeToMs(
    time
) {

    const normalized =
        time.replace(
            ',',
            '.'
        );


    const parts =
        normalized.split(':');


    if (
        parts.length !== 3
    ) {

        return 0;

    }


    const hours =
        Number(parts[0]);


    const minutes =
        Number(parts[1]);


    const seconds =
        Number(parts[2]);


    return (
        hours * 3600000 +
        minutes * 60000 +
        seconds * 1000
    );

}


/**
 * Converts a WebVTT timestamp format (00:00:00.000) to SubRip SRT format (00:00:00,000).
 *
 * @param {string} time - WebVTT time string.
 * @returns {string} SRT time string with comma decimal separator.
 */
function convertVttTimeToSrt(
    time
) {

    return time.replace(
        '.',
        ','
    );

}


/**
 * Formats a duration in total seconds into a readable string (HH:MM:SS or MM:SS).
 *
 * @param {number} seconds - Total duration in seconds.
 * @returns {string} Formatted duration string.
 */
function formatDuration(
    seconds
) {

    if (
        !seconds
    ) {

        return '--';

    }


    seconds =
        Math.floor(
            seconds
        );


    const hours =
        Math.floor(
            seconds / 3600
        );


    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );


    const secs =
        seconds % 60;


    if (
        hours > 0
    ) {

        return (
            `${hours}:` +
            `${String(
                minutes
            ).padStart(2, '0')}:` +
            `${String(
                secs
            ).padStart(2, '0')}`
        );

    }


    return (
        `${minutes}:` +
        `${String(
            secs
        ).padStart(2, '0')}`
    );

}


// ============================================================================
// Electron Application Lifecycle
// ============================================================================

/**
 * Triggered once Electron has fully initialized.
 * Creates the primary browser window and registers macOS activation handlers.
 */
app.whenReady().then(
    () => {

        createWindow();


        app.on(
            'activate',
            () => {

                if (
                    BrowserWindow
                        .getAllWindows()
                        .length === 0
                ) {

                    createWindow();

                }

            }
        );

    }
);


// ============================================================================
// IPC Handler: Directory Picker Dialog
// ============================================================================

/**
 * Opens a native operating system folder selection dialog.
 * Allows the user to choose or create a destination folder for downloads.
 *
 * @returns {Promise<string|null>} Selected folder path or null if canceled.
 */
ipcMain.handle(
    'choose-download-folder',
    async () => {

        const result =
            await dialog.showOpenDialog({

                properties: [
                    'openDirectory',
                    'createDirectory'
                ]

            });


        if (
            result.canceled ||
            !result.filePaths.length
        ) {

            return null;

        }


        return result.filePaths[0];

    }
);


// ============================================================================
// Application Termination
// ============================================================================

/**
 * Quits the application when all windows are closed (except on macOS/Darwin,
 * where applications typically remain open until explicitly quit with Cmd+Q).
 */
app.on('before-quit', () => {
    cleanupDownloadsOnExit();
});

app.on(
    'window-all-closed',
    () => {

        if (
            process.platform !== 'darwin'
        ) {

            app.quit();

        }

    }
);