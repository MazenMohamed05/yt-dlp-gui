const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

/// ==================================================
// SETTINGS
// ==================================================

let downloadBaseDir = null;

const ytDlpPath = fs.existsSync(path.join(__dirname, 'bin', 'yt-dlp.exe'))
    ? path.join(__dirname, 'bin', 'yt-dlp.exe')
    : (fs.existsSync(String.raw`C:\yt-dlp\yt-dlp.exe`) ? String.raw`C:\yt-dlp\yt-dlp.exe` : 'yt-dlp');

const ffmpegPath = fs.existsSync(path.join(__dirname, 'bin', 'ffmpeg.exe'))
    ? path.join(__dirname, 'bin', 'ffmpeg.exe')
    : (fs.existsSync(String.raw`C:\yt-dlp\ffmpeg.exe`) ? String.raw`C:\yt-dlp\ffmpeg.exe` : 'ffmpeg');

// ==================================================
// CREATE DIRECTORIES
// ==================================================

// ==================================================
// READLINE
// ==================================================

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise(resolve => {
        rl.question(question, answer => {
            resolve(answer.trim());
        });
    });
}

// ==================================================
// CHOOSE DOWNLOAD LOCATION
// ==================================================

function openFolderPicker() {

    return new Promise(resolve => {

        const { execFile } = require('child_process');

        const powershellCommand = `
Add-Type -AssemblyName System.Windows.Forms;
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;
$dialog.Description = 'Select Download Folder';
$dialog.ShowNewFolderButton = $true;

if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Out.Write($dialog.SelectedPath);
}
`;

        execFile(
            'powershell.exe',
            [
                '-NoProfile',
                '-STA',
                '-Command',
                powershellCommand
            ],
            {
                windowsHide: false,
                encoding: 'utf8'
            },
            (error, stdout) => {

                if (error) {
                    resolve(null);
                    return;
                }

                const selectedPath =
                    String(stdout || '').trim();

                resolve(
                    selectedPath || null
                );
            }
        );

    });
}

// ==================================================
// DOWNLOAD LOCATION MENU
// ==================================================

async function askDownloadLocation() {

    while (true) {

        console.log(
            '\n================================'
        );

        console.log(
            '        Download Location'
        );

        console.log(
            '================================'
        );

        if (downloadBaseDir) {

            console.log(
                `\nCurrent location:`
            );

            console.log(
                downloadBaseDir
            );

            console.log('');

            console.log(
                '1 - Use this location'
            );

            console.log(
                '2 - Choose another folder'
            );

        } else {

            console.log(
                '1 - Choose folder'
            );
        }

        console.log('');

        console.log(
            '8 - Back'
        );

        const answer =
            await ask(
                '\nChoice: '
            );

        // ==========================================
        // USE CURRENT LOCATION
        // ==========================================

        if (
            answer === '1' &&
            downloadBaseDir
        ) {

            return downloadBaseDir;
        }

        // ==========================================
        // CHOOSE FOLDER
        // ==========================================

        if (
            answer === '1' ||
            answer === '2'
        ) {

            console.log(
                '\nOpening folder picker...'
            );

            const selectedPath =
                await openFolderPicker();

            if (!selectedPath) {

                console.log(
                    '\nNo folder was selected.'
                );

                continue;
            }

            downloadBaseDir =
                selectedPath;

            console.log(
                `\nDownload location set to:`
            );

            console.log(
                downloadBaseDir
            );

            return downloadBaseDir;
        }

        // ==========================================
        // BACK
        // ==========================================

        if (
            answer === '8'
        ) {

            return 'back';
        }

        console.log(
            '\nInvalid choice.'
        );
    }
}

// ==================================================
// HELPERS
// ==================================================

function formatBytes(bytes) {

    if (
        bytes === null ||
        bytes === undefined ||
        !Number.isFinite(bytes) ||
        bytes <= 0
    ) {
        return 'Unknown';
    }

    const units = [
        'B',
        'KB',
        'MB',
        'GB',
        'TB'
    ];

    let value = bytes;
    let unit = 0;

    while (
        value >= 1024 &&
        unit < units.length - 1
    ) {
        value /= 1024;
        unit++;
    }

    return `${value.toFixed(2)} ${units[unit]}`;
}

// ==================================================
// CHECK DEPENDENCIES
// ==================================================

function checkDependencies() {

    console.log(
        '\nChecking dependencies...\n'
    );

    if (!fs.existsSync(ytDlpPath)) {

        console.log(
            'ERROR: yt-dlp.exe was not found:'
        );

        console.log(ytDlpPath);

        return false;
    }

    console.log(
        'yt-dlp found'
    );

    if (!fs.existsSync(ffmpegPath)) {

        console.log(
            'ERROR: ffmpeg.exe was not found:'
        );

        console.log(ffmpegPath);

        return false;
    }

    console.log(
        'ffmpeg found'
    );

    return true;
}

// ==================================================
// URL HELPERS
// ==================================================

function urlHasPlaylist(url) {

    return (
        /[?&]list=/.test(url)
    );
}

// ==================================================
// GET JSON FROM YT-DLP
// ==================================================

function getJsonFromYtDlp(
    url,
    mode
) {

    return new Promise(resolve => {

        const args = [

            '--dump-single-json',

            '--skip-download',

            '--no-warnings',

            mode === 'playlist'
                ? '--yes-playlist'
                : '--no-playlist',

            url
        ];

        const process =
            spawn(
                ytDlpPath,
                args
            );

        let stdout = '';
        let stderr = '';

        process.stdout.on(
            'data',
            data => {
                stdout += data.toString();
            }
        );

        process.stderr.on(
            'data',
            data => {
                stderr += data.toString();
            }
        );

        process.on(
            'error',
            error => {

                console.log(
                    `\nERROR: ${error.message}`
                );

                resolve(null);
            }
        );

        process.on(
            'close',
            code => {

                if (
                    code !== 0 ||
                    !stdout.trim()
                ) {

                    if (stderr.trim()) {

                        console.log(
                            '\n' +
                            stderr.trim()
                        );
                    }

                    resolve(null);
                    return;
                }

                try {

                    const data =
                        JSON.parse(
                            stdout
                        );

                    resolve(data);

                } catch (error) {

                    console.log(
                        '\nCould not parse yt-dlp information.'
                    );

                    resolve(null);
                }
            }
        );
    });
}

// ==================================================
// GET ENTRIES
// ==================================================

function getEntries(
    data,
    mode
) {

    if (!data) {
        return [];
    }

    if (
        mode === 'playlist'
    ) {

        if (
            Array.isArray(
                data.entries
            )
        ) {

            return data.entries
                .filter(Boolean);
        }

        return [];
    }

    return [data];
}

// ==================================================
// FORMAT SIZE
// ==================================================

function getFormatSize(
    format
) {

    if (!format) {
        return 0;
    }

    if (
        Number.isFinite(
            Number(format.filesize)
        )
    ) {

        return Number(
            format.filesize
        );
    }

    if (
        Number.isFinite(
            Number(format.filesize_approx)
        )
    ) {

        return Number(
            format.filesize_approx
        );
    }

    return 0;
}

// ==================================================
// ESTIMATE SIZE FROM BITRATE
// ==================================================

function estimateFromBitrate(
    format,
    duration
) {

    if (!format) {
        return 0;
    }

    const bitrate =
        Number(format.tbr) ||
        Number(format.vbr) ||
        Number(format.abr) ||
        0;

    if (
        bitrate <= 0 ||
        duration <= 0
    ) {
        return 0;
    }

    return (
        bitrate *
        1000 /
        8 *
        duration
    );
}

// ==================================================
// GET REAL FORMAT SIZE
// ==================================================

function getRealFormatSize(
    format,
    duration
) {

    const direct =
        getFormatSize(
            format
        );

    if (direct > 0) {
        return direct;
    }

    return estimateFromBitrate(
        format,
        duration
    );
}

// ==================================================
// VIDEO FORMAT
// ==================================================

function isVideoFormat(
    format
) {

    return (
        format &&
        format.vcodec &&
        format.vcodec !== 'none'
    );
}

// ==================================================
// AUDIO ONLY FORMAT
// ==================================================

function isAudioOnlyFormat(
    format
) {

    return (
        format &&
        format.acodec &&
        format.acodec !== 'none' &&
        (
            !format.vcodec ||
            format.vcodec === 'none'
        )
    );
}

// ==================================================
// AVAILABLE HEIGHTS
// ==================================================

function getAvailableHeights(
    entries
) {

    const heights =
        new Set();

    for (
        const entry of entries
    ) {

        for (
            const format of
            (
                entry.formats ||
                []
            )
        ) {

            if (
                isVideoFormat(
                    format
                ) &&
                Number(format.height) > 0
            ) {

                heights.add(
                    Number(format.height)
                );
            }
        }
    }

    return [
        ...heights
    ].sort(
        (a, b) => a - b
    );
}

// ==================================================
// FIND VIDEO FORMAT
// ==================================================

function findVideoFormat(
    entry,
    height
) {

    const formats =
        (
            entry.formats ||
            []
        )
        .filter(format => {

            return (
                isVideoFormat(format) &&
                Number(format.height) === height
            );
        });

    formats.sort(
        (a, b) => {

            const aRate =
                Number(a.vbr) ||
                Number(a.tbr) ||
                0;

            const bRate =
                Number(b.vbr) ||
                Number(b.tbr) ||
                0;

            return bRate - aRate;
        }
    );

    return (
        formats[0] ||
        null
    );
}

// ==================================================
// FIND BEST AUDIO
// ==================================================

function findBestAudio(
    entry
) {

    const formats =
        (
            entry.formats ||
            []
        )
        .filter(
            isAudioOnlyFormat
        );

    formats.sort(
        (a, b) => {

            const aRate =
                Number(a.abr) ||
                Number(a.tbr) ||
                0;

            const bRate =
                Number(b.abr) ||
                Number(b.tbr) ||
                0;

            return bRate - aRate;
        }
    );

    return (
        formats[0] ||
        null
    );
}

// ==================================================
// CALCULATE VIDEO SIZE
// ==================================================

function calculateVideoSize(
    entry,
    height
) {

    const duration =
        Number(
            entry.duration
        ) || 0;

    const video =
        findVideoFormat(
            entry,
            height
        );

    if (!video) {
        return 0;
    }

    let total =
        getRealFormatSize(
            video,
            duration
        );

    const needsAudio =
        (
            !video.acodec ||
            video.acodec === 'none'
        );

    if (needsAudio) {

        const audio =
            findBestAudio(
                entry
            );

        if (audio) {

            total +=
                getRealFormatSize(
                    audio,
                    duration
                );
        }
    }

    return total;
}

// ==================================================
// CALCULATE QUALITY SIZES
// ==================================================

function calculateQualitySizes(
    entries
) {

    const heights =
        getAvailableHeights(
            entries
        );

    return heights.map(
        height => {

            const size =
                entries.reduce(
                    (
                        total,
                        entry
                    ) => {

                        return (
                            total +
                            calculateVideoSize(
                                entry,
                                height
                            )
                        );
                    },
                    0
                );

            return {
                height,
                size
            };
        }
    );
}
// ==================================================
// DOWNLOAD URL
// ==================================================

async function askDownloadUrl() {

    console.log(
        '\n================================'
    );

    console.log(
        '          Download URL'
    );

    console.log(
        '================================'
    );

    console.log(
        '8 - Exit'
    );

    const url =
        await ask(
            '\nEnter URL: '
        );

    if (
        url === '8'
    ) {

        return 'exit';
    }

    if (!url) {

        console.log(
            '\nURL cannot be empty.'
        );

        return null;
    }

    return url;
}

// ==================================================
// DOWNLOAD TYPE
// ==================================================

async function askDownloadType() {

    while (true) {

        console.log(
            '\n================================'
        );

        console.log(
            '         Download Type'
        );

        console.log(
            '================================'
        );

        console.log(
            '1 - Video'
        );

        console.log(
            '2 - Audio'
        );

        console.log(
            '3 - Subtitles'
        );

        console.log('');

        console.log(
            '8 - Back'
        );

        const answer =
            await ask(
                '\nChoice: '
            );

        if (
            answer === '1'
        ) {

            return 'video';
        }

        if (
            answer === '2'
        ) {

            return 'audio';
        }

        if (
            answer === '3'
        ) {

            return 'subtitles';
        }

        if (
            answer === '8'
        ) {

            return 'back';
        }

        console.log(
            '\nInvalid choice.'
        );
    }
}

// ==================================================
// DOWNLOAD MODE
// ==================================================

async function askDownloadMode() {

    while (true) {

        console.log(
            '\n================================'
        );

        console.log(
            '         Download Mode'
        );

        console.log(
            '================================'
        );

        console.log(
            '1 - Single video'
        );

        console.log(
            '2 - Full playlist'
        );

        console.log('');

        console.log(
            '8 - Back'
        );

        const answer =
            await ask(
                '\nChoice: '
            );

        if (
            answer === '1'
        ) {

            return 'single';
        }

        if (
            answer === '2'
        ) {

            return 'playlist';
        }

        if (
            answer === '8'
        ) {

            return 'back';
        }

        console.log(
            '\nInvalid choice.'
        );
    }
}

// ==================================================
// PLAYLIST URL CHECK
// ==================================================

async function checkPlaylistUrl(
    url
) {

    if (
        urlHasPlaylist(url)
    ) {

        return true;
    }

    console.log(
        '\nThis URL does not contain a playlist ID.'
    );

    console.log(
        'A playlist URL must contain: list=...'
    );

    return false;
}

// ==================================================
// QUALITY MENU
// ==================================================

function showQualityMenu(
    qualityList
) {

    console.log(
        '\n================================'
    );

    console.log(
        '         Video Quality'
    );

    console.log(
        '================================'
    );

    qualityList.forEach(
        (quality, index) => {

            console.log(
                `${index + 1} - ${quality.height}p          ~${formatBytes(quality.size)}`
            );
        }
    );

    const bestNumber =
        qualityList.length + 1;

    const best =
        qualityList[
            qualityList.length - 1
        ];

    console.log(
        `${bestNumber} - Best available    ~${formatBytes(best?.size || 0)}`
    );

    console.log('');

    console.log(
        '8 - Back'
    );
}

// ==================================================
// QUALITY CHOICE
// ==================================================

async function askQuality(
    qualityList
) {

    while (true) {

        showQualityMenu(
            qualityList
        );

        const bestNumber =
            qualityList.length + 1;

        const answer =
            await ask(
                '\nChoice: '
            );

        if (
            answer === '8'
        ) {

            return 'back';
        }

        if (
            answer ===
            String(bestNumber)
        ) {

            const highest =
                qualityList[
                    qualityList.length - 1
                ];

            return {

                label: 'Best available',

                height: 'best',

                size:
                    highest
                        ? highest.size
                        : 0
            };
        }

        const number =
            parseInt(
                answer,
                10
            );

        if (
            Number.isInteger(number) &&
            number >= 1 &&
            number <= qualityList.length
        ) {

            return qualityList[
                number - 1
            ];
        }

        console.log(
            '\nInvalid choice.'
        );
    }
}

// ==================================================
// VIDEO SUBTITLE MENU
// ==================================================

async function askSubtitleLanguage() {

    while (true) {

        console.log(
            '\n================================'
        );

        console.log(
            '          Subtitles'
        );

        console.log(
            '================================'
        );

        console.log(
            '1 - No subtitles'
        );

        console.log(
            '2 - Arabic'
        );

        console.log(
            '3 - English'
        );

        console.log(
            '4 - Arabic + English'
        );

        console.log('');

        console.log(
            '8 - Back'
        );

        const answer =
            await ask(
                '\nChoice: '
            );

        if (
            answer === '1'
        ) {

            return 'none';
        }

        if (
            answer === '2'
        ) {

            return ['ar'];
        }

        if (
            answer === '3'
        ) {

            return ['en'];
        }

        if (
            answer === '4'
        ) {

            return [
                'ar',
                'en'
            ];
        }

        if (
            answer === '8'
        ) {

            return 'back';
        }

        console.log(
            '\nInvalid choice.'
        );
    }
}

// ==================================================
// SUBTITLE-ONLY MENU
// ==================================================

async function askSubtitleOnlyLanguage() {

    while (true) {

        console.log(
            '\n================================'
        );

        console.log(
            '          Subtitles'
        );

        console.log(
            '================================'
        );

        console.log(
            '1 - Arabic'
        );

        console.log(
            '2 - English'
        );

        console.log(
            '3 - Arabic + English'
        );

        console.log('');

        console.log(
            '8 - Back'
        );

        const answer =
            await ask(
                '\nChoice: '
            );

        if (
            answer === '1'
        ) {

            return ['ar'];
        }

        if (
            answer === '2'
        ) {

            return ['en'];
        }

        if (
            answer === '3'
        ) {

            return [
                'ar',
                'en'
            ];
        }

        if (
            answer === '8'
        ) {

            return 'back';
        }

        console.log(
            '\nInvalid choice.'
        );
    }
}

// ==================================================
// AUDIO FORMAT
// ==================================================

async function askAudioFormat() {

    while (true) {

        console.log(
            '\n================================'
        );

        console.log(
            '         Audio Format'
        );

        console.log(
            '================================'
        );

        console.log(
            '1 - MP3'
        );

        console.log(
            '2 - M4A'
        );

        console.log(
            '3 - WAV'
        );

        console.log('');

        console.log(
            '8 - Back'
        );

        const answer =
            await ask(
                '\nChoice: '
            );

        if (
            answer === '1'
        ) {

            return 'mp3';
        }

        if (
            answer === '2'
        ) {

            return 'm4a';
        }

        if (
            answer === '3'
        ) {

            return 'wav';
        }

        if (
            answer === '8'
        ) {

            return 'back';
        }

        console.log(
            '\nInvalid choice.'
        );
    }
}

// ==================================================
// SUBTITLE HELPERS
// ==================================================

function safeSubtitleName(
    name
) {

    return String(
        name ||
        'Unknown'
    )
        .replace(
            /[<>:"/\\|?*\x00-\x1F]/g,
            '_'
        )
        .replace(
            /[. ]+$/g,
            ''
        )
        .trim() ||
        'Unknown';
}

// ==================================================
// GET ENTRY URL
// ==================================================

function getEntryUrl(
    entry
) {

    if (!entry) {
        return null;
    }

    return (
        entry.webpage_url ||
        entry.original_url ||
        (
            entry.id
                ? `https://www.youtube.com/watch?v=${entry.id}`
                : null
        )
    );
}

// ==================================================
// CHECK LANGUAGE TRACK
// ==================================================

function hasLanguageTrack(
    entry,
    language,
    auto
) {

    if (!entry) {
        return false;
    }

    const tracks = auto
        ? entry.automatic_captions
        : entry.subtitles;

    if (!tracks || typeof tracks !== 'object') {
        return false;
    }

    const keys = Object.keys(tracks);

    /*
     * Accept:
     *
     * ar
     * ar-*
     * ar-orig
     *
     * en
     * en-*
     * en-orig
     */

    return keys.some(key => {

        if (key === language) {
            return true;
        }

        return (
            key.startsWith(`${language}-`) ||
            key.startsWith(`${language}_`)
        );
    });
}


// ==================================================
// BUILD SUBTITLE ARGS
// ==================================================

function buildSubtitleArgs(
    language,
    url,
    useAuto,
    outputDir,
    videoTitle
) {

    const safeTitle =
        safeSubtitleName(videoTitle);

    /*
     * IMPORTANT:
     *
     * Do NOT put %(language)s here.
     *
     * yt-dlp automatically adds the language code.
     *
     * Example:
     *
     * Video Name.en.srt
     * Video Name.ar.srt
     */

    const outputTemplate =
        path.join(
            outputDir,
            `${safeTitle}.%(ext)s`
        );

    const args = [

        /*
         * NEVER download video/audio.
         */
        '--skip-download',
        /*
 * Give YouTube a little time before requesting
 * the subtitle file and retry temporary 429 errors.
 */
'--sleep-subtitles',
'3',

'--retries',
'5',

'--retry-sleep',
'http:exp=2:20',

        /*
         * Original subtitle OR
         * Auto-generated subtitle.
         */
        useAuto
            ? '--write-auto-subs'
            : '--write-subs',

        /*
         * Allow:
         *
         * en
         * en-orig
         * en-US
         *
         * and the same for Arabic.
         */
        '--sub-langs',
        language,

        /*
         * Convert whatever subtitle format
         * YouTube provides into SRT.
         */
        '--sub-format',
        'vtt',

        '--ffmpeg-location',
        ffmpegPath,

        '--windows-filenames',

        /*
         * Subtitle mode is always for
         * the current video only.
         */
        '--no-playlist',


        '--progress',

        '-o',
        outputTemplate,

        url
    ];

    return args;
}


// ==================================================
// ESCAPE REGEXP
// ==================================================

function escapeRegExp(value) {

    return String(value).replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
    );
}


// ==================================================
// NORMALIZE DOWNLOADED SUBTITLE
// ==================================================

function normalizeSubtitleFile(
    outputDir,
    videoTitle,
    language
) {

    const safeTitle =
        safeSubtitleName(videoTitle);

    if (!fs.existsSync(outputDir)) {
        return false;
    }

    const files =
        fs.readdirSync(outputDir);

    /*
     * yt-dlp can create:
     *
     * Video.en.srt
     * Video.en-orig.srt
     * Video.en-US.srt
     *
     * We normalize all of them to:
     *
     * Video.en.srt
     *
     * or:
     *
     * Video.ar.srt
     */

    const languageRegex =
        new RegExp(
            `^${escapeRegExp(safeTitle)}\\.${escapeRegExp(language)}(?:[-_].+)?\\.srt$`,
            'i'
        );

    const candidates =
        files.filter(
            file =>
                languageRegex.test(file)
        );

    if (!candidates.length) {
        return false;
    }

    const target =
        path.join(
            outputDir,
            `${safeTitle}.${language}.srt`
        );

    /*
     * Prefer exact:
     *
     * Video.en.srt
     *
     * over:
     *
     * Video.en-orig.srt
     */

    const exact =
        candidates.find(
            file =>
                file.toLowerCase() ===
                `${safeTitle}.${language}.srt`
                    .toLowerCase()
        );

    const sourceFile =
        exact ||
        candidates[0];

    const sourcePath =
        path.join(
            outputDir,
            sourceFile
        );

    if (
        path.resolve(sourcePath) !==
        path.resolve(target)
    ) {

        if (fs.existsSync(target)) {
            fs.unlinkSync(target);
        }

        fs.renameSync(
            sourcePath,
            target
        );
    }

    /*
     * Remove duplicate variants such as:
     *
     * Video.en-orig.srt
     */

    for (const file of candidates) {

        const filePath =
            path.join(
                outputDir,
                file
            );

        if (
            path.resolve(filePath) !==
            path.resolve(target)
        ) {

            try {

                fs.unlinkSync(
                    filePath
                );

            } catch (_) {

                // Ignore cleanup failure.

            }
        }
    }

    return fs.existsSync(target);
}


// ==================================================
// RUN SUBTITLE DOWNLOAD
// ==================================================

function cleanVttToSrt(
    vttPath,
    srtPath
) {

    const fs = require('fs');

    const content =
        fs.readFileSync(
            vttPath,
            'utf8'
        );


    const lines =
        content.split(/\r?\n/);


    const subtitles = [];

    let currentCue = null;


    // ==========================================
    // Parse VTT
    // ==========================================

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


        // ==========================================
        // Timestamp line
        // ==========================================

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
                parts[0]
                    .trim();


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


        // ==========================================
        // Subtitle text
        // ==========================================

        if (
            currentCue
        ) {

            currentCue.text +=
                (currentCue.text
                    ? ' '
                    : '') +
                line;

        }

    }



    // ==========================================
    // Clean / Normalize cues
    // ==========================================

    const cleaned = [];


    for (
        const cue of subtitles
    ) {

        let text =
            cue.text;


        // ------------------------------------------
        // Remove word-level timestamps
        // ------------------------------------------

        text =
            text.replace(
                /<\d{2}:\d{2}:\d{2}\.\d{3}>/g,
                ''
            );


        // ------------------------------------------
        // Remove VTT <c> tags
        // ------------------------------------------

        text =
            text.replace(
                /<\/?c(?:\.[^>]*)?>/g,
                ''
            );


        // ------------------------------------------
        // Remove other VTT tags
        // ------------------------------------------

        text =
            text.replace(
                /<[^>]+>/g,
                ''
            );


        // ------------------------------------------
        // Decode common HTML entities
        // ------------------------------------------

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


        // ------------------------------------------
        // Normalize whitespace
        // ------------------------------------------

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



        // ==========================================
        // Remove extremely short cues
        // ==========================================

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



        // ==========================================
        // Remove exact duplicate cues
        // ==========================================

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



    // ==========================================
    // Remove repeated beginning
    // of updated YouTube cues
    // ==========================================

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


            let common =
                0;


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


            /*
             * If the current cue starts with
             * the complete previous subtitle,
             * keep only the new words.
             */

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



    // ==========================================
    // Build SRT
    // ==========================================

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



    // ==========================================
    // Write SRT
    // ==========================================

    fs.writeFileSync(
        srtPath,
        output,
        'utf8'
    );

}

function subtitleTimeToMs(
    time
) {

    const normalized =
        time
            .replace(
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

function convertVttTimeToSrt(
    time
) {

    return time
        .replace(
            '.',
            ','
        );

}

function timeToMs(time) {

    let parts =
        time.replace(',', '.')
            .split(':');


    return (
        Number(parts[0]) * 3600000 +
        Number(parts[1]) * 60000 +
        Number(parts[2]) * 1000
    );

}


function downloadSubtitleCommand(
    args,
    outputDir,
    videoTitle,
    language
) {

    return new Promise(
        resolve => {

            const downloader =
                spawn(
                    ytDlpPath,
                    args
                );

            let lastProgress = '';

            let stderr = '';


            // ==========================================
            // STDOUT
            // ==========================================

            downloader.stdout.on(
                'data',
                data => {

                    const text =
                        data.toString();

                    /*
                     * yt-dlp may display:
                     *
                     * Downloading 1 format(s): 401+251
                     *
                     * even though --skip-download is active.
                     *
                     * We don't want this displayed
                     * during subtitle download.
                     */

                    const filtered =
                        text
                            .split(/\r?\n/)
                            .filter(
                                line =>
                                    !/Downloading \d+ format\(s\):/i.test(
                                        line
                                    )
                            )
                            .join('\n');

                    if (
                        !filtered.trim()
                    ) {
                        return;
                    }

                    processOutput(
                        filtered,
                        value => {

                            lastProgress =
                                value;

                        }
                    );
                }
            );


            // ==========================================
            // STDERR
            // ==========================================

            downloader.stderr.on(
                'data',
                data => {

                    const text =
                        data.toString();

                    stderr += text;

                    const filtered =
                        text
                            .split(/\r?\n/)
                            .filter(
                                line =>
                                    !/Downloading \d+ format\(s\):/i.test(
                                        line
                                    )
                            )
                            .join('\n');

                    if (
                        !filtered.trim()
                    ) {
                        return;
                    }

                    processOutput(
                        filtered,
                        value => {

                            lastProgress =
                                value;

                        }
                    );
                }
            );


            // ==========================================
            // ERROR
            // ==========================================

            downloader.on(
                'error',
                error => {

                    function clearLine() {

                    readline.cursorTo(process.stdout, 0);
                    readline.clearLine(process.stdout, 0);
                }

                    resolve(false);
                }
            );


            // ==========================================
            // CLOSE
            // ==========================================

            downloader.on(
    'close',
    code => {

        if (
    code === 0
) {

    try {

        const files =
            fs.readdirSync(
                outputDir
            );


        const vttFile =
            files.find(
                file =>
                    file.endsWith(
                        `.${language}.vtt`
                    )
            );


        if (
            vttFile
        ) {

            const vttPath =
                path.join(
                    outputDir,
                    vttFile
                );


            const srtPath =
                path.join(
                    outputDir,
                    vttFile.replace(
                        '.vtt',
                        '.srt'
                    )
                );


            cleanVttToSrt(
                vttPath,
                srtPath
            );


            fs.unlinkSync(
                vttPath
            );


            console.log(
                `${language.toUpperCase()} subtitle converted successfully.`
            );
        }


    } catch(error) {

        console.log(
            "Subtitle conversion error:",
            error.message
        );

    }


    resolve(true);

} else {

            if (
                stderr.trim()
            ) {

                console.log(
                    '\n' +
                    stderr.trim()
                );
            }

            resolve(false);
        }
    }
);
        }
    );
}


// ==================================================
// DOWNLOAD SUBTITLES
// ==================================================

async function downloadSubtitles(
    subtitleLanguages,
    entries,
    mode,
    playlistTitle
) {

    if (
        !Array.isArray(
            subtitleLanguages
        ) ||
        subtitleLanguages.length === 0
    ) {

        return true;
    }


    console.log(
        '\n================================'
    );

    console.log(
        '        Subtitle Download'
    );

    console.log(
        '================================'
    );


    for (
        let i = 0;
        i < entries.length;
        i++
    ) {

        const entry =
            entries[i];

        const entryUrl =
            getEntryUrl(entry);

        const title =
            entry.title ||
            `Video ${i + 1}`;


        if (!entryUrl) {

            console.log(
                `\nCould not determine URL for: ${title}`
            );

            continue;
        }


        let currentSubtitleDir;


        // ==========================================
        // PLAYLIST
        // ==========================================

        if (
            mode === 'playlist'
        ) {

            const playlistFolder =
                safeSubtitleName(
                    playlistTitle ||
                    'Playlist'
                );


            /*
             * Use the real playlist index.
             */

            const playlistIndex =
                Number(
                    entry.playlist_index
                ) ||
                i + 1;


            const videoFolder =
                `${String(playlistIndex).padStart(3, '0')} - ${safeSubtitleName(title)}`;


            currentSubtitleDir =
                path.join(
                    path.join(downloadBaseDir, 'subtitle'),
                    playlistFolder,
                    videoFolder
                );


        } else {


            // ==========================================
            // SINGLE VIDEO
            // ==========================================

            /*
             * Single video becomes:
             *
             * video\
             *   Video Name\
             *       Video Name.ar.srt
             *       Video Name.en.srt
             *
             * NO "Subtitles" folder.
             */

            currentSubtitleDir =
                path.join(
                path.join(downloadBaseDir, 'subtitle'),
                    safeSubtitleName(title)
                );
        }


        fs.mkdirSync(
            currentSubtitleDir,
            {
                recursive: true
            }
        );


        console.log(
            '\n--------------------------------'
        );

        console.log(
            `[${i + 1}/${entries.length}] ${title}`
        );


        // ==========================================
        // EACH LANGUAGE
        // ==========================================

        for (
            const language of subtitleLanguages
        ) {

            const languageName =
                language === 'ar'
                    ? 'Arabic'
                    : 'English';


            console.log(
                `\nChecking ${languageName} subtitles...`
            );


            const hasOriginal =
                hasLanguageTrack(
                    entry,
                    language,
                    false
                );


            const hasAuto =
                hasLanguageTrack(
                    entry,
                    language,
                    true
                );


            // ==========================================
            // ORIGINAL SUBTITLE
            // ==========================================

            if (hasOriginal) {

                console.log(
                    `${languageName} original subtitle found.`
                );


                const args =
                    buildSubtitleArgs(
                        language,
                        entryUrl,
                        false,
                        currentSubtitleDir,
                        title
                    );


                const success =
                    await downloadSubtitleCommand(
                        args,
                        currentSubtitleDir,
                        title,
                        language
                    );


                if (success) {

                    console.log(
                        `${languageName} original subtitle downloaded successfully.`
                    );

                    continue;
                }


                /*
                 * Original was available but failed.
                 * Try Auto-generated if available.
                 */

                if (hasAuto) {

                    console.log(
                        `${languageName} original subtitle could not be downloaded.`
                    );

                    console.log(
                        `Trying ${languageName} auto-generated subtitles...`
                    );


                    const autoArgs =
                        buildSubtitleArgs(
                            language,
                            entryUrl,
                            true,
                            currentSubtitleDir,
                            title
                        );


                    const autoSuccess =
                        await downloadSubtitleCommand(
                            autoArgs,
                            currentSubtitleDir,
                            title,
                            language
                        );


                    if (autoSuccess) {

                        console.log(
                            `${languageName} auto-generated subtitle downloaded successfully.`
                        );

                        continue;
                    }
                }


                console.log(
                    `${languageName} subtitle could not be downloaded.`
                );

                continue;
            }


            // ==========================================
            // AUTO-GENERATED SUBTITLE
            // ==========================================

            if (hasAuto) {

                console.log(
                    `${languageName} original subtitle not found.`
                );

                console.log(
                    `Using ${languageName} auto-generated subtitles...`
                );


                const args =
                    buildSubtitleArgs(
                        language,
                        entryUrl,
                        true,
                        currentSubtitleDir,
                        title
                    );


                const success =
                    await downloadSubtitleCommand(
                        args,
                        currentSubtitleDir,
                        title,
                        language
                    );


                if (success) {

                    console.log(
                        `${languageName} auto-generated subtitle downloaded successfully.`
                    );

                } else {

                    console.log(
                        `${languageName} subtitles are not available for this video.`
                    );
                }

                continue;
            }


            // ==========================================
            // NOT AVAILABLE
            // ==========================================

            console.log(
                `${languageName} subtitles are not available for this video.`
            );
        }
    }


    console.log(
        '\n================================'
    );

    console.log(
        '      Subtitle Download Done'
    );

    console.log(
        '================================'
    );


    return true;
}

// ==================================================
// BUILD VIDEO COMMAND
// ==================================================

function buildVideoArgs(
    height,
    url,
    mode
) {

    const format =
        height === 'best'

            ? 'bestvideo+bestaudio/best'

            : `bestvideo[height=${height}]+bestaudio/best[height=${height}]`;

        let outputTemplate;

        const videoDir = path.join(
            downloadBaseDir,
            'video'
        );

        if (
            mode === 'playlist'
        ) {

            outputTemplate =
                path.join(
                    videoDir,
                    '%(playlist_title)s',
                    '%(playlist_index)03d - %(title)s',
                    '%(playlist_index)03d - %(title)s.%(ext)s'
                );

        } else {

            outputTemplate =
                path.join(
                    videoDir,
                    '%(title)s',
                    '%(title)s.%(ext)s'
                );
        }

    const args = [

        '-f',
        format,

        '-o',
        outputTemplate,

        '--ffmpeg-location',
        ffmpegPath,

        '--merge-output-format',
        'mp4',

        '--windows-filenames',


        '--progress'
    ];

    if (
        mode === 'playlist'
    ) {

        args.push(
            '--yes-playlist'
        );

    } else {

        args.push(
            '--no-playlist'
        );
    }

    args.push(
        url
    );

    return args;
}

// ==================================================
// BUILD AUDIO COMMAND
// ==================================================

function buildAudioArgs(
    format,
    url,
    mode
) {

    let outputTemplate;

    const audioDir = path.join(
        downloadBaseDir,
        'audio'
    );

    if (
        mode === 'playlist'
    ) {

        outputTemplate =
            path.join(
                audioDir,
                '%(playlist_title)s',
                '%(playlist_index)03d - %(title)s.%(ext)s'
            );

    } else {

        outputTemplate =
            path.join(
                audioDir,
                '%(title)s.%(ext)s'
            );
    }

    const args = [

        '-f',
        'bestaudio/best',

        '-x',

        '--audio-format',
        format,

        '--audio-quality',
        '0',

        '-o',
        outputTemplate,

        '--ffmpeg-location',
        ffmpegPath,

        '--windows-filenames',


        '--progress'
    ];

    if (
        mode === 'playlist'
    ) {

        args.push(
            '--yes-playlist'
        );

    } else {

        args.push(
            '--no-playlist'
        );
    }

    args.push(
        url
    );

    return args;
}

// ==================================================
// DOWNLOAD PROCESS
// ==================================================

function download(
    args
) {

    return new Promise(
        resolve => {

            const downloader =
                spawn(
                    ytDlpPath,
                    args
                );

            let lastProgress =
                '';

            let stderr =
                '';

            let stdoutBuffer =
                '';

            let stderrBuffer =
                '';

            // ==========================================
            // PROCESS COMPLETE OUTPUT LINES
            // ==========================================

            function handleOutput(
                data,
                isError
            ) {

                const text =
                    data.toString();

                if (isError) {

                    stderr +=
                        text;

                    stderrBuffer +=
                        text;

                    const parts =
                        stderrBuffer.split(
                            /\r\n|\n|\r/
                        );

                    stderrBuffer =
                        parts.pop() || '';

                    for (
                        const part of parts
                    ) {

                        if (
                            part.trim()
                        ) {

                            processOutput(
                                part,
                                value => {
                                    lastProgress =
                                        value;
                                }
                            );
                        }
                    }

                } else {

                    stdoutBuffer +=
                        text;

                    const parts =
                        stdoutBuffer.split(
                            /\r\n|\n|\r/
                        );

                    stdoutBuffer =
                        parts.pop() || '';

                    for (
                        const part of parts
                    ) {

                        if (
                            part.trim()
                        ) {

                            processOutput(
                                part,
                                value => {
                                    lastProgress =
                                        value;
                                }
                            );
                        }
                    }
                }
            }

            // ==========================================
            // STDOUT
            // ==========================================

            downloader.stdout.on(
                'data',
                data => {

                    handleOutput(
                        data,
                        false
                    );
                }
            );

            // ==========================================
            // STDERR
            // ==========================================

            downloader.stderr.on(
                'data',
                data => {

                    handleOutput(
                        data,
                        true
                    );
                }
            );

            // ==========================================
            // ERROR
            // ==========================================

            downloader.on(
                'error',
                error => {

                    console.log(
                        `\nDownload error: ${error.message}`
                    );

                    resolve(false);
                }
            );

            // ==========================================
            // CLOSE
            // ==========================================

            downloader.on(
                'close',
                code => {

                    // Process remaining buffered output
                    if (
                        stdoutBuffer.trim()
                    ) {

                        processOutput(
                            stdoutBuffer,
                            value => {
                                lastProgress =
                                    value;
                            }
                        );
                    }

                    if (
                        stderrBuffer.trim()
                    ) {

                        processOutput(
                            stderrBuffer,
                            value => {
                                lastProgress =
                                    value;
                            }
                        );
                    }

                    // Move to a new line ONLY after
                    // the download process has actually ended.
                    if (
    lastProgress
) {

    process.stdout.write(
        '\r' +
        ' '.repeat(
            process.stdout.columns || 120
        ) +
        '\r'
    );

    process.stdout.write(
        lastProgress
    );

    process.stdout.write(
        '\n'
    );
}

                    if (
                        code === 0
                    ) {

                        resolve(true);

                    } else {

                        if (
                            stderr.trim()
                        ) {

                            console.log(
                                '\n' +
                                stderr.trim()
                            );
                        }

                        resolve(false);
                    }
                }
            );
        }
    );
}

// ==================================================
// CLEAR LINE
// ==================================================

function clearLine() {
    process.stdout.write(
        '\r' + ' '.repeat(process.stdout.columns || 120) + '\r'
    );
}

    // ==================================================
    // PROCESS OUTPUT
    // ==================================================

    // ==================================================
// PROCESS OUTPUT
// ==================================================

function processOutput(
    text,
    saveProgress
) {

    if (!text) {
        return;
    }

    const lines =
        String(text)
            .split(/\r|\n/)
            .filter(line => line.trim());

    for (const line of lines) {

        const clean =
            line.trim();

        if (!clean) {
            continue;
        }

        // ==========================================
        // DOWNLOAD PROGRESS
        // ==========================================

        if (
            clean.includes('[download]')
        ) {

            const percentMatch =
                clean.match(
                    /\[download\]\s+([0-9.]+)%/
                );

            if (!percentMatch) {
                continue;
            }

            const sizeMatch =
                clean.match(
                    /of\s+([0-9.]+)\s*([KMGTPE]?i?B)/
                );

            const speedMatch =
                clean.match(
                    /at\s+([0-9.]+)\s*([KMGTPE]?i?B\/s)/
                );

            const etaMatch =
                clean.match(
                    /ETA\s+([0-9:]+)/
                );

            const percent =
                parseFloat(
                    percentMatch[1]
                );

            // ======================================
            // TOTAL SIZE
            // ======================================

            let totalBytes = null;
            let totalText = '?';

            if (sizeMatch) {

                totalText =
                    `${sizeMatch[1]} ${sizeMatch[2]}`;

                totalBytes =
                    parseSizeToBytes(
                        parseFloat(
                            sizeMatch[1]
                        ),
                        sizeMatch[2]
                    );
            }

            // ======================================
            // DOWNLOADED SIZE
            // ======================================

            let downloadedText = '?';

            if (totalBytes !== null) {

                const downloadedBytes =
                    totalBytes *
                    (
                        percent /
                        100
                    );

                downloadedText =
                    formatBytes(
                        downloadedBytes
                    );
            }

            // ======================================
            // SPEED
            // ======================================

            let speed = '--';

            if (speedMatch) {

                speed =
                    `${speedMatch[1]} ${speedMatch[2]}`;
            }

            // ======================================
            // ETA
            // ======================================

            let eta = '--';

            if (etaMatch) {

                eta =
                    etaMatch[1];
            }

            // ======================================
            // PROGRESS BAR
            // ======================================

            const barWidth = 22;

            const filled =
                Math.min(
                    barWidth,
                    Math.round(
                        (
                            percent /
                            100
                        ) *
                        barWidth
                    )
                );

            const empty =
                Math.max(
                    0,
                    barWidth -
                    filled
                );

            const progressBar =
                '█'.repeat(
                    filled
                ) +
                '░'.repeat(
                    empty
                );

            // ======================================
            // STATUS
            // ======================================

            const status =
                percent >= 100
                    ? 'Done'
                    : `ETA ${eta}`;

            // ======================================
            // OUTPUT
            // ======================================

            const output =
                `[${progressBar}] ` +
                `${percent.toFixed(1)}% | ` +
                `${downloadedText} / ${totalText} | ` +
                `${speed} | ` +
                status;

            // ======================================
            // SAME LINE
            // ======================================

            process.stdout.write(
                '\r' +
                ' '.repeat(
                    process.stdout.columns || 120
                ) +
                '\r'
            );

            process.stdout.write(
                output
            );

            if (
                typeof saveProgress ===
                'function'
            ) {

                saveProgress(
                    output
                );
            }

            continue;
        }

        // ==========================================
        // IGNORE YT-DLP INFORMATION
        // ==========================================

        if (
            clean.startsWith('[youtube]') ||
            clean.startsWith('[youtube:tab]') ||
            clean.startsWith('[info]') ||
            clean.startsWith('[ExtractAudio]') ||
            clean.startsWith('Deleting original file')
        ) {
            continue;
        }

        // ==========================================
        // IGNORE WARNINGS
        // ==========================================

        if (
            clean.startsWith('WARNING:')
        ) {
            continue;
        }

        // ==========================================
        // ONLY NOW CLEAR THE PROGRESS LINE
        // ==========================================

        process.stdout.write(
            '\r' +
            ' '.repeat(
                process.stdout.columns || 120
            ) +
            '\r'
        );

        // ==========================================
        // IMPORTANT OUTPUT
        // ==========================================

        console.log(
            clean
        );
    }
}   


// ==================================================
// CONVERT SIZE TO BYTES
// ==================================================

function parseSizeToBytes(
    value,
    unit
) {

    const units = {

        'B': 1,

        'KB':
            1000,

        'MB':
            1000 ** 2,

        'GB':
            1000 ** 3,

        'TB':
            1000 ** 4,

        'KiB':
            1024,

        'MiB':
            1024 ** 2,

        'GiB':
            1024 ** 3,

        'TiB':
            1024 ** 4
    };


    return (
        value *
        (
            units[unit] ||
            1
        )
    );
}

    async function confirmDownload(
        type,
        mode,
        selected,
        size
    ) {

        console.log(
            '\n================================'
        );

        console.log(
            '        Download Summary'
        );

        console.log(
            '================================'
        );

        console.log(
            `Type       : ${
                type === 'video'
                    ? 'Video'
                    : type === 'audio'
                        ? 'Audio'
                        : 'Subtitles'
            }`
        );

        console.log(
            `Mode       : ${
                mode === 'playlist'
                    ? 'Full playlist'
                    : 'Single video'
            }`
        );

        if (
            type === 'video'
        ) {

            console.log(
                `Quality    : ${
                    selected.label ||
                    `${selected.height}p`
                }`
            );
        }

        console.log(
            `Estimated  : ~${formatBytes(size)}`
        );

        console.log('');

        console.log(
            '1 - Start download'
        );

        console.log(
            '2 - Cancel'
        );

        console.log(
            '8 - Back'
        );

        const answer =
            await ask(
                '\nChoice: '
            );

        if (
            answer === '1'
        ) {

            return 'start';
        }

        if (
            answer === '2'
        ) {

            return 'cancel';
        }

        if (
            answer === '8'
        ) {

            return 'back';
        }

        console.log(
            '\nInvalid choice.'
        );

        return confirmDownload(
            type,
            mode,
            selected,
            size
        );
    }
    // ==================================================
    // DOWNLOAD FLOW
    // ==================================================

    async function downloadFlow(
        url,
        mode,
        type,
        data,
        entries
    ) {

        const playlistTitle =
            data.playlist_title ||
            data.title ||
            'Playlist';

        // ======================================
        // VIDEO
        // ======================================

        if (
            type === 'video'
        ) {

            console.log(
                '\nCalculating actual format sizes...'
            );

            const qualityList =
                calculateQualitySizes(
                    entries
                );

            while (true) {

                const selected =
                    await askQuality(
                        qualityList
                    );

                // Quality -> Download Mode
                if (
                    selected === 'back'
                ) {

                    return 'back-mode';
                }

                const subtitleLanguage =
                    await askSubtitleLanguage();

                // Subtitles -> Quality
                if (
                    subtitleLanguage === 'back'
                ) {

                    continue;
                }

                const confirmation =
                    await confirmDownload(
                        'video',
                        mode,
                        selected,
                        selected.size
                    );

                if (
                    confirmation === 'back'
                ) {

                    continue;
                }

                if (
                    confirmation === 'cancel'
                ) {

                    console.log(
                        '\nDownload cancelled.'
                    );

                    return 'finished';
                }

                const args =
                    buildVideoArgs(
                        selected.height,
                        url,
                        mode
                    );

                console.log(
                    '\n================================'
                );

                console.log(
                    '        Starting download'
                );

                console.log(
                    '================================'
                );

                const videoDownloadResult =
                    await download(
                        args
                    );

                if (
                    videoDownloadResult
                ) {

                    console.log(
                        '\nDownload completed successfully!'
                    );

                    if (
                        subtitleLanguage !==
                        'none'
                    ) {

                        await downloadSubtitles(
                            subtitleLanguage,
                            entries,
                            mode,
                            playlistTitle
                        );
                    }

                    console.log(
                        '\nAll requested downloads completed.'
                    );

                } else {

                    console.log(
                        '\nVideo download failed.'
                    );
                }

                return 'finished';
            }
        }

        // ======================================
        // AUDIO
        // ======================================

        if (
            type === 'audio'
        ) {

            while (true) {

            const audioFormat =
                await askAudioFormat();

            // Audio Format -> Download Mode
            if (
                audioFormat === 'back'
            ) {

                return 'back-mode';
            }

            const args =
                buildAudioArgs(
                    audioFormat,
                    url,
                    mode
                );

            console.log(
                '\n================================'
            );

            console.log(
                '        Starting download'
            );

            console.log(
                '================================'
            );

            const result =
                await download(
                    args
                );

            if (result) {

                console.log(
                    '\nDownload completed successfully!'
                );

            } else {

                console.log(
                    '\nDownload failed.'
                );
            }

            return 'finished';
        }
    }

    // ======================================
    // SUBTITLES ONLY
    // ======================================

    if (
        type === 'subtitles'
    ) {

        while (true) {

            const subtitleLanguages =
                await askSubtitleOnlyLanguage();

            // Subtitle Language -> Download Mode
            if (
                subtitleLanguages === 'back'
            ) {

                return 'back-mode';
            }

            console.log(
                '\n================================'
            );

            console.log(
                '      Starting subtitle download'
            );

            console.log(
                '================================'
            );

            await downloadSubtitles(
                subtitleLanguages,
                entries,
                mode,
                playlistTitle
            );

            console.log(
                '\nSubtitle download completed.'
            );

            return 'finished';
        }
    }

    return 'finished';
}

// ==================================================
// PROCESS SELECTED DOWNLOAD
// ==================================================

async function processSelectedDownload(
    url,
    type,
    mode
) {

    if (
        mode === 'playlist'
    ) {

        const valid =
            await checkPlaylistUrl(
                url
            );

        if (!valid) {

            return 'back-mode';
        }
    }

    console.log(
        '\n================================'
    );

    console.log(
        '         Analyzing URL'
    );

    console.log(
        '================================'
    );

    console.log(
        '\nPlease wait...'
    );

    let currentMode =
        mode;

    let data =
        await getJsonFromYtDlp(
            url,
            currentMode
        );

    let entries =
        getEntries(
            data,
            currentMode
        );

    // ==================================
    // PLAYLIST PROBLEM
    // ==================================

    if (
        currentMode === 'playlist' &&
        entries.length <= 1
    ) {

        console.log(
            '\n================================'
        );

        console.log(
            '       Playlist Problem'
        );

        console.log(
            '================================'
        );

        console.log(
            '\nThe Playlist could not be read.'
        );

        console.log(
            'Make sure the URL contains a valid list= ID.'
        );

        console.log(
            '\n1 - Enter another Playlist URL'
        );

        console.log(
            '2 - Download this video only'
        );

        console.log('');

        console.log(
            '8 - Back'
        );

        const answer =
            await ask(
                '\nChoice: '
            );

        if (
            answer === '1'
        ) {

            const newUrl =
                await ask(
                    '\nEnter Playlist URL: '
                );

            if (!newUrl) {

                return;
            }

            data =
                await getJsonFromYtDlp(
                    newUrl,
                    'playlist'
                );

            entries =
                getEntries(
                    data,
                    'playlist'
                );

            if (
                entries.length <= 1
            ) {

                console.log(
                    '\nPlaylist could not be loaded.'
                );

                return;
            }

            currentMode =
                'playlist';

            url =
                newUrl;

        } else if (
            answer === '2'
        ) {

            currentMode =
                'single';

            data =
                await getJsonFromYtDlp(
                    url,
                    'single'
                );

            entries =
                getEntries(
                    data,
                    'single'
                );

        } else if (
            answer === '8'
        ) {

            return 'back-mode';

        } else {

            console.log(
                '\nInvalid choice.'
            );

            return 'back-mode';
        }
    }

    if (
        !data ||
        !entries.length
    ) {

        console.log(
            '\nNo downloadable videos were found.'
        );

        return 'finished';
    }

    return await downloadFlow(
        url,
        currentMode,
        type,
        data,
        entries
    );
}

// ==================================================
// MAIN
// ==================================================

async function main() {

    console.clear();

    console.log(
        '================================'
    );

    console.log(
        '       YouTube Downloader'
    );

    console.log(
        '================================'
    );

    if (
        !checkDependencies()
    ) {

        rl.close();

        return;
    }

    // ==================================================
    // URL IS NOW THE FIRST STEP
    // ==================================================

    while (true) {

        const url =
            await askDownloadUrl();

        // 8 from URL -> Exit
        if (
            url === 'exit'
        ) {

            break;
        }

        if (!url) {

            continue;
        }

        // ==================================================
        // DOWNLOAD TYPE
        // ==================================================

        while (true) {

            const type =
                await askDownloadType();

            // Back from Type -> URL
            if (
                type === 'back'
            ) {

                break;
            }

            // ==================================================
            // DOWNLOAD MODE
            // ==================================================

            while (true) {

                const mode =
                await askDownloadMode();

                // Back from Mode -> Type
                if (
                    mode === 'back'
                ) {

                    break;
                }

                // ==================================================
                // DOWNLOAD LOCATION
                // ==================================================

                const downloadLocation =
                    await askDownloadLocation();

                // Back from Download Location -> Download Mode
                if (
                    downloadLocation === 'back'
                ) {

                    continue;
                }

                // ==================================================
                // START DOWNLOAD PROCESS
                // ==================================================

                const result =
                    await processSelectedDownload(
                        url,
                        type,
                        mode
                    );

                // Back from Quality / Audio / Subtitle-only
                // -> Download Mode
                if (
                    result === 'back-mode'
                ) {

                    continue;
                }

                // Download finished.
                // Go back to URL.
                break;
            }

            // If mode returned "back",
            // this breaks to Download Type.
            if (
                type === 'back'
            ) {

                break;
            }

            // After a completed download,
            // go directly to a new URL.
            break;
        }
    }

    rl.close();
}

// ==================================================
// START
// ==================================================

main().catch(
    error => {

        console.error(
            '\nUnexpected error:'
        );

        console.error(
            error
        );

        rl.close();
    }
);