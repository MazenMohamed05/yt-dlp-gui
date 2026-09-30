/**
 * YouTube Playlist Downloader - Electron Preload Script
 * 
 * Safely exposes specific IPC communication channels to the frontend renderer
 * process via Electron's contextBridge.
 */

const {
    contextBridge,
    ipcRenderer
} = require('electron');


contextBridge.exposeInMainWorld(
    'electronAPI',
    {

        // ====================================================================
        // URL Analysis & Metadata Retrieval
        // ====================================================================

        /**
         * Invokes 'analyze-url' to inspect a YouTube video or playlist link,
         * returning available qualities, streams, duration, and subtitle options.
         *
         * @param {string} url - Target YouTube URL.
         * @returns {Promise<object>} Analysis payload { success, data, message }.
         */
        analyzeURL: (url) => {

            return ipcRenderer.invoke(
                'analyze-url',
                url
            );

        },


        // ====================================================================
        // Subtitle Download & Conversion
        // ====================================================================

        /**
         * Invokes 'download-subtitles' to fetch and convert subtitles to .srt.
         *
         * @param {object} options - Subtitle download configuration.
         * @returns {Promise<object>} Result status { success, message }.
         */
        downloadSubtitles: (
    options
) => {

    return ipcRenderer.invoke(
        'download-subtitles',
        options
    );

},

// ====================================================================
// Media Download Pipeline (Video / Audio)
// ====================================================================

/**
 * Invokes 'download-media' to download and merge video or audio streams.
 *
 * @param {object} options - Media download configuration { url, type, quality, outputFolder, ... }.
 * @returns {Promise<object>} Result status { success, message, outputDir }.
 */
downloadMedia: (
    options
) => {

    return ipcRenderer.invoke(
        'download-media',
        options
    );

},

// ====================================================================
// Real-Time Progress Stream Listener
// ====================================================================

/**
 * Subscribes to real-time download and merge progress updates from the main process.
 *
 * @param {Function} callback - Handler receiving progress string updates.
 */
onDownloadProgress: (
    callback
) => {

    ipcRenderer.on(
        'download-progress',
        (
            event,
            data
        ) => {

            callback(
                data
            );

        }
    );

},

// ====================================================================
// Destination Folder Picker Dialog
// ====================================================================

/**
 * Opens a native directory selection dialog via the main process.
 *
 * @returns {Promise<string|null>} Path of selected folder, or null if canceled.
 */
chooseDownloadFolder: () => {

    return ipcRenderer.invoke(
        'choose-download-folder'
    );

},

        pauseDownload: (taskId = null) => {
            return ipcRenderer.invoke('pause-download', taskId);
        },

        resumeDownload: (taskId = null) => {
            return ipcRenderer.invoke('resume-download', taskId);
        },

        cancelDownload: (taskId = null) => {
            return ipcRenderer.invoke('cancel-download', taskId);
        },

        openFile: (filePath) => {
            return ipcRenderer.invoke('open-file', filePath);
        },

        showInFolder: (filePath) => {
            return ipcRenderer.invoke('show-in-folder', filePath);
        },

        /**
         * Checks whether any media or subtitle files already exist in the target directory.
         *
         * @param {object} params - { outputDir, items, type, audioFormat, language }
         * @returns {Promise<{ hasConflict: boolean, conflicts: Array<{ title: string, fileName: string }> }>}
         */
        checkExistingFiles: (params) => {
            return ipcRenderer.invoke('check-existing-files', params);
        },

        checkForUpdates: () => {
            return ipcRenderer.invoke('check-for-updates');
        },

        openExternalUrl: (url) => {
            return ipcRenderer.invoke('open-external-url', url);
        }

    }
);