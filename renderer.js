// ========================================
// In-App Modal Dialog (Prevents Windows Focus Freezes)
// ========================================

function showModalAlert(message) {
    const modal = document.getElementById("customModal");
    const modalMsg = document.getElementById("customModalMessage");
    const modalIcon = document.getElementById("customModalIcon");
    const modalBtn = document.getElementById("customModalButton");

    if (!modal || !modalMsg || !modalBtn) {
        console.log("Modal Alert:", message);
        return;
    }

    modalMsg.textContent = String(message || "");
    const lower = String(message || "").toLowerCase();

    if (modalIcon) {
        if (lower.includes("error") || lower.includes("failed") || lower.includes("fail") || lower.includes("unable")) {
            modalIcon.textContent = "⚠️";
        } else if (lower.includes("success") || lower.includes("downloaded") || lower.includes("completed")) {
            modalIcon.textContent = "✅";
        } else {
            modalIcon.textContent = "ℹ️";
        }
    }

    modal.classList.remove("hidden");
    modalBtn.focus();

    const cleanup = () => {
        modal.classList.add("hidden");
        modalBtn.removeEventListener("click", onBtnClick);
        window.removeEventListener("keydown", onKeyDown);
    };

    const onBtnClick = () => {
        cleanup();
    };

    const onKeyDown = (e) => {
        if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            cleanup();
        }
    };

    modalBtn.addEventListener("click", onBtnClick);
    window.addEventListener("keydown", onKeyDown);
}

// Seamlessly override native alert() to eliminate Windows Alt+Tab freeze
window.alert = (msg) => {
    showModalAlert(msg);
};

let isDownloadPausedLocally = false;
let isDownloadCancelledLocally = false;

const downloadControlsEl = document.getElementById("downloadControls");
const pauseDownloadBtn = document.getElementById("pauseDownloadButton");
const pauseBtnIconEl = document.getElementById("pauseBtnIcon");
const pauseBtnTextEl = document.getElementById("pauseBtnText");
const cancelDownloadBtn = document.getElementById("cancelDownloadButton");

function resetDownloadControlsUI() {
    isDownloadPausedLocally = false;
    if (pauseBtnIconEl) pauseBtnIconEl.textContent = "⏸️";
    if (pauseBtnTextEl) pauseBtnTextEl.textContent = "Pause";
    if (pauseDownloadBtn) pauseDownloadBtn.classList.remove("paused");
    const spinner = document.querySelector(".status-spinner");
    if (spinner) spinner.classList.remove("paused-spinner");
}

if (pauseDownloadBtn) {
    pauseDownloadBtn.addEventListener("click", async () => {
        if (!isDownloadPausedLocally) {
            await window.electronAPI.pauseDownload();
            isDownloadPausedLocally = true;
            if (pauseBtnIconEl) pauseBtnIconEl.textContent = "▶️";
            if (pauseBtnTextEl) pauseBtnTextEl.textContent = "Resume";
            pauseDownloadBtn.classList.add("paused");
            statusText.textContent = "Paused / متوقف مؤقتاً";
            progressSpeed.textContent = "--";
            progressEta.textContent = "--";
            const spinner = document.querySelector(".status-spinner");
            if (spinner) spinner.classList.add("paused-spinner");
        } else {
            await window.electronAPI.resumeDownload();
            isDownloadPausedLocally = false;
            if (pauseBtnIconEl) pauseBtnIconEl.textContent = "⏸️";
            if (pauseBtnTextEl) pauseBtnTextEl.textContent = "Pause";
            pauseDownloadBtn.classList.remove("paused");
            statusText.textContent = "Downloading...";
            const spinner = document.querySelector(".status-spinner");
            if (spinner) spinner.classList.remove("paused-spinner");
        }
    });
}

if (cancelDownloadBtn) {
    cancelDownloadBtn.addEventListener("click", async () => {
        isDownloadCancelledLocally = true;
        await window.electronAPI.cancelDownload();
        if (downloadControlsEl) downloadControlsEl.classList.add("hidden");
        resetDownloadControlsUI();
        status.classList.add("hidden");
        downloadProgress.classList.add("hidden");
        alert("Download cancelled / تم إلغاء التنزيل.");
    });
}

function showConflictPrompt({ isPlaylist, conflicts, totalCount }) {
    return new Promise((resolve) => {
        const modal = document.getElementById("conflictModal");
        const titleEl = document.getElementById("conflictModalTitle");
        const msgEl = document.getElementById("conflictModalMessage");
        const fileEl = document.getElementById("conflictModalFileName");
        const actionsEl = document.getElementById("conflictModalActions");

        if (!modal || !titleEl || !msgEl || !actionsEl) {
            resolve("overwrite");
            return;
        }

        actionsEl.innerHTML = "";

        const close = (action) => {
            modal.classList.add("hidden");
            window.removeEventListener("keydown", onKeyDown);
            resolve(action);
        };

        const onKeyDown = (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                close("cancel");
            }
        };

        if (isPlaylist) {
            titleEl.textContent = "Files Already Exist / ملفات موجودة بالفعل";
            msgEl.textContent = `${conflicts.length} of ${totalCount} files already exist in this folder. What would you like to do?`;

            if (fileEl) {
                fileEl.classList.remove("hidden");
                fileEl.textContent = conflicts.slice(0, 4).map(c => c.fileName).join("\n") + (conflicts.length > 4 ? `\n... (+${conflicts.length - 4} more)` : "");
            }

            const skipBtn = document.createElement("button");
            skipBtn.className = "conflict-btn conflict-btn-skip";
            skipBtn.textContent = "⏭️ Skip Existing / تخطي";
            skipBtn.onclick = () => close("skip");
            actionsEl.appendChild(skipBtn);

            const overwriteBtn = document.createElement("button");
            overwriteBtn.className = "conflict-btn conflict-btn-overwrite";
            overwriteBtn.textContent = "🔄 Replace All / استبدال";
            overwriteBtn.onclick = () => close("overwrite");
            actionsEl.appendChild(overwriteBtn);

            const renameBtn = document.createElement("button");
            renameBtn.className = "conflict-btn conflict-btn-rename";
            renameBtn.textContent = "📑 Keep Both / ترقيم (1)";
            renameBtn.onclick = () => close("rename");
            actionsEl.appendChild(renameBtn);

            const cancelBtn = document.createElement("button");
            cancelBtn.className = "conflict-btn conflict-btn-cancel";
            cancelBtn.textContent = "✖ Cancel / إلغاء";
            cancelBtn.onclick = () => close("cancel");
            actionsEl.appendChild(cancelBtn);
        } else {
            const existingName = (conflicts[0] && conflicts[0].fileName) || "File";
            titleEl.textContent = "File Already Exists / الملف موجود مسبقاً";
            msgEl.textContent = "A file with this name already exists in the selected folder. What would you like to do?";

            if (fileEl) {
                fileEl.classList.remove("hidden");
                fileEl.textContent = existingName;
            }

            const overwriteBtn = document.createElement("button");
            overwriteBtn.className = "conflict-btn conflict-btn-overwrite";
            overwriteBtn.textContent = "🔄 Replace / استبدال";
            overwriteBtn.onclick = () => close("overwrite");
            actionsEl.appendChild(overwriteBtn);

            const renameBtn = document.createElement("button");
            renameBtn.className = "conflict-btn conflict-btn-rename";
            renameBtn.textContent = "📑 Keep Both / ترقيم (1)";
            renameBtn.onclick = () => close("rename");
            actionsEl.appendChild(renameBtn);

            const cancelBtn = document.createElement("button");
            cancelBtn.className = "conflict-btn conflict-btn-cancel";
            cancelBtn.textContent = "✖ Cancel / إلغاء";
            cancelBtn.onclick = () => close("cancel");
            actionsEl.appendChild(cancelBtn);
        }

        window.addEventListener("keydown", onKeyDown);
        modal.classList.remove("hidden");
    });
}

// ========================================
        // Elements
        // ========================================

        const typeCards =
            document.querySelectorAll(
                ".type-card"
            );


        const status =
            document.getElementById(
                "status"
            );


        const statusText =
            document.getElementById(
                "statusText"
            );

        // ========================================
// Download Progress
// ========================================

const downloadProgress =
    document.getElementById(
        "downloadProgress"
    );

const progressPercent =
    document.getElementById(
        "progressPercent"
    );

const progressSpeed =
    document.getElementById(
        "progressSpeed"
    );

const progressEta =
    document.getElementById(
        "progressEta"
    );

const progressBarFill =
    document.getElementById(
        "progressBarFill"
    );

const progressDownloaded =
    document.getElementById(
        "progressDownloaded"
    );

const progressTotal =
    document.getElementById(
        "progressTotal"
    );

// ========================================
// Reset Download Progress
// ========================================

function resetDownloadProgress() {

    downloadProgress.classList.add("hidden");

    progressPercent.textContent = "0%";
    progressSpeed.textContent = "--";
    progressEta.textContent = "--";
    progressDownloaded.textContent = "--";
    progressTotal.textContent = "--";

    progressBarFill.style.width = "0%";
}



// ========================================
// Receive yt-dlp progress
// ========================================

window.electronAPI.onDownloadProgress(
    (text) => {

        if (!text) {
            return;
        }


        const percentMatch =
            text.match(
                /(\d+(?:\.\d+)?)%/
            );


        const speedMatch =
            text.match(
                /at\s+([^\s]+\/s)/i
            );


        const etaMatch =
            text.match(
                /ETA\s+([0-9:]+)/i
            );


        const sizeMatch =
            text.match(
                /of\s+([0-9.]+\s*(?:KiB|MiB|GiB|KB|MB|GB))/i
            );


        const percent =
            percentMatch
                ? parseFloat(
                    percentMatch[1]
                )
                : null;


        const speed =
            speedMatch
                ? speedMatch[1]
                : null;


        const eta =
            etaMatch
                ? etaMatch[1]
                : null;


        const totalSize =
            sizeMatch
                ? sizeMatch[1]
                : null;


        if (
            percent === null &&
            !speed &&
            !eta &&
            !totalSize
        ) {
            return;
        }


        downloadProgress.classList.remove(
            "hidden"
        );


        if (
            percent !== null
        ) {

            progressPercent.textContent =
                `${percent.toFixed(1)}%`;

            progressBarFill.style.width =
                `${Math.min(
                    percent,
                    100
                )}%`;

        }


        if (speed) {

            progressSpeed.textContent =
                speed;

        }


        if (eta) {

            progressEta.textContent =
                `ETA ${eta}`;

        }


        if (totalSize) {

            progressTotal.textContent =
                totalSize;

        }


        const downloadedMatch =
            text.match(
                /(\d+(?:\.\d+)?\s*(?:KiB|MiB|GiB|KB|MB|GB))\s+of/i
            );


        if (downloadedMatch) {

            progressDownloaded.textContent =
                downloadedMatch[1];

        }

    }
);


        const result =
            document.getElementById(
                "result"
            );


        const qualitySelect =
            document.getElementById(
                "qualitySelect"
            );


        const videoSize =
            document.getElementById(
                "videoSize"
            );


        const qualityHeading =
            document.getElementById(
                "qualityHeading"
            );


        // ========================================
        // Current analyzed data
        // ========================================

        let currentData = null;


        // ========================================
        // Current download type
        // ========================================

        let currentType =
            "video";


        // ========================================
        // Download type selection
        // ========================================

        typeCards.forEach(
            (card) => {

                card.addEventListener(
                    "click",
                    () => {


                        typeCards.forEach(
                            (item) => {

                                item.classList.remove(
                                    "active"
                                );

                            }
                        );


                        card.classList.add(
                            "active"
                        );


                        currentType =
                            card.dataset.type;


                        console.log(
                            "Selected type:",
                            currentType
                        );


                        // --------------------------------
                        // If data already exists,
                        // rebuild the correct list
                        // --------------------------------

                        if (currentType === "audio") {

    buildAudioList(
        currentData
    );

} else if (currentType === "subtitle") {

    buildSubtitleList(
        currentData
    );

} else {

    buildQualityList(
        currentData
    );

}

                    }
                );

            }
        );


        // ========================================
// Build Playlist List
// ========================================

function buildPlaylistList(
    data
) {

    const playlistContainer =
        document.getElementById(
            "playlistContainer"
        );

    const playlistList =
        document.getElementById(
            "playlistList"
        );

    const playlistCount =
        document.getElementById(
            "playlistCount"
        );

    const playlistToggleButton =
        document.getElementById(
            "playlistToggleButton"
        );


    if (
        !playlistContainer ||
        !playlistList ||
        !playlistCount ||
        !playlistToggleButton
    ) {

        return;

    }


    const entries =
        data &&
        Array.isArray(
            data.playlistEntries
        )
            ? data.playlistEntries
            : [];


    if (
        entries.length === 0
    ) {

        playlistContainer.classList.add(
            "hidden"
        );


        const selectionBar =
            document.getElementById(
                "playlistSelectionBar"
            );


        if (
            selectionBar
        ) {

            selectionBar.classList.add(
                "hidden"
            );

        }


        playlistList.classList.add(
            "hidden"
        );

        playlistToggleButton.textContent =
            "View Videos";

        const videoInfo =
            playlistContainer.closest(
                ".video-info"
            );

        if (
            videoInfo
        ) {

            videoInfo.classList.remove(
                "playlist-expanded"
            );

        }

        return;

    }


    playlistCount.textContent =
        `${entries.length} videos`;


    const selectAll =
        document.getElementById(
            "playlistSelectAll"
        );

    const selectedCount =
        document.getElementById(
            "playlistSelectedCount"
        );


    if (selectAll) {

        selectAll.checked =
            true;

        selectAll.indeterminate =
            false;

    }


    if (selectedCount) {

        selectedCount.textContent =
            `${entries.length} videos selected`;

    }


    playlistList.innerHTML =
        "";


    entries.forEach(
        (
            entry,
            index
        ) => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "playlist-item";


            const checkbox =
                document.createElement(
                    "input"
                );


            checkbox.type =
                "checkbox";


            checkbox.className =
                "playlist-checkbox";


            checkbox.checked =
                true;


            checkbox.dataset.index =
                index;


            const number =
                document.createElement(
                    "span"
                );


            number.className =
                "playlist-number";


            number.textContent =
                `${index + 1}.`;


            const title =
                document.createElement(
                    "span"
                );


            title.className =
                "playlist-title";


            title.textContent =
                entry.title ||
                "Unknown title";


            const duration =
                document.createElement(
                    "span"
                );


            duration.className =
                "playlist-duration";


            duration.textContent =
                entry.durationFormatted ||
                "--";


            item.appendChild(
                checkbox
            );


            item.appendChild(
                number
            );


            item.appendChild(
                title
            );


            item.appendChild(
                duration
            );


            playlistList.appendChild(
                item
            );

        }
    );


    playlistContainer.classList.remove(
        "hidden"
    );


    const selectionBar =
        document.getElementById(
            "playlistSelectionBar"
        );


    if (
        selectionBar
    ) {

        selectionBar.classList.remove(
            "hidden"
        );

    }


    playlistList.classList.add(
        "hidden"
    );


    playlistToggleButton.textContent =
        "View Videos";


    const videoInfo =
        playlistContainer.closest(
            ".video-info"
        );

    if (
        videoInfo
    ) {

        videoInfo.classList.remove(
            "playlist-expanded"
        );

    }

}
// ========================================
// Build Video Quality List
// ========================================

function buildQualityList(
    data
) {

    currentData =
        data;

    currentType =
        "video";


    qualityHeading.textContent =
        "Quality";


    qualitySelect.innerHTML = `
        <option value="">
            Select quality
        </option>
    `;


    videoSize.textContent =
        "--";


    if (
        !data ||
        !Array.isArray(
            data.formats
        ) ||
        data.formats.length === 0
    ) {

        return;

    }


    // ========================================
    // Group formats by quality
    // ========================================

    const qualityMap =
        new Map();


    data.formats.forEach(
        (
            format
        ) => {

            const quality =
                Number(
                    format.standardQuality
                ) || 0;


            if (
                quality <= 0
            ) {

                return;

            }


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

                return;

            }


            // Prefer direct streams over m3u8 for accurate estimated size
            const isFormatM3u8 = (format.protocol || '').includes('m3u8');
            const isExistingM3u8 = (existing.protocol || '').includes('m3u8');
            if (!isFormatM3u8 && isExistingM3u8) {
                qualityMap.set(quality, format);
                return;
            }
            if (isFormatM3u8 && !isExistingM3u8) {
                return;
            }

            // Prefer MP4
            if (
                format.ext === "mp4" &&
                existing.ext !== "mp4"
            ) {

                qualityMap.set(
                    quality,
                    format
                );

                return;

            }


            // Prefer format with audio

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
    );


    // ========================================
    // Sort highest quality first
    // ========================================

    const formats =
        Array.from(
            qualityMap.values()
        ).sort(
            (
                a,
                b
            ) => {

                return (
                    Number(
                        b.standardQuality
                    ) -
                    Number(
                        a.standardQuality
                    )
                );

            }
        );


    // ========================================
    // Add video qualities
    // ========================================

    formats.forEach(
        (
            format
        ) => {

            const option =
                document.createElement(
                    "option"
                );


            const quality =
                Number(
                    format.standardQuality
                ) || 0;


            option.value =
                quality;


            option.textContent =
                `${quality}p`;


            qualitySelect.appendChild(
                option
            );

        }
    );


    // ========================================
    // Best available
    // ========================================

    const bestOption =
        document.createElement(
            "option"
        );


    bestOption.value =
        "best";


    bestOption.textContent =
        "Best available";


    qualitySelect.appendChild(
        bestOption
    );


    if (qualitySelect.options.length > 1) {

        qualitySelect.selectedIndex = 1;

        qualitySelect.dispatchEvent(new Event("change"));

    } else {

        qualitySelect.value = "";

        videoSize.textContent = "--";

    }

}


// ========================================
// Build Audio Quality List
// ========================================

function buildAudioList(data) {

    currentData =
        data;

    currentType =
        "audio";


    qualityHeading.textContent =
        "Audio Quality";


    qualitySelect.innerHTML = `
        <option value="">
            Select audio quality
        </option>
    `;


    videoSize.textContent =
        "--";


    if (
        !data ||
        !Array.isArray(
            data.audioFormats
        ) ||
        data.audioFormats.length === 0
    ) {

        const option =
            document.createElement(
                "option"
            );


        option.value =
            "";


        option.textContent =
            "No audio formats found";


        qualitySelect.appendChild(
            option
        );


        return;

    }


    data.audioFormats.forEach(
        (format) => {

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                format.formatId;


            const abr =
                Number(
                    format.abr
                ) || 0;


            let text =
                format.ext
                    ? format.ext.toUpperCase()
                    : "Audio";


            if (abr > 0) {

                text +=
                    ` ${Math.round(abr)} kbps`;

            }


            option.textContent =
                text;


            qualitySelect.appendChild(
                option
            );

        }
    );


    const bestOption =
        document.createElement(
            "option"
        );


    bestOption.value =
        "best";


    bestOption.textContent =
        "Best available";


    qualitySelect.appendChild(
        bestOption
    );


    if (qualitySelect.options.length > 1) {

        qualitySelect.selectedIndex = 1;

        qualitySelect.dispatchEvent(new Event("change"));

    } else {

        qualitySelect.value = "";

        videoSize.textContent = "--";

    }

}


// ========================================
// Build Subtitle List
// ========================================

function buildSubtitleList(
    data
) {

    currentData =
        data;

    currentType =
        "subtitle";


    qualityHeading.textContent =
        "Subtitle Language";


    qualitySelect.innerHTML = `
        <option value="">
            Select subtitle language
        </option>
    `;


    videoSize.textContent =
        "--";


    const languages =
        new Set();


    if (
        data &&
        Array.isArray(
            data.subtitles
        )
    ) {

        for (
            const subtitle
            of data.subtitles
        ) {

            const language =
                String(
                    subtitle.language ||
                    ""
                )
                    .toLowerCase()
                    .trim();


            if (
                language === "ar" ||
                language.startsWith("ar-")
            ) {

                languages.add(
                    "ar"
                );

            }


            if (
                language === "en" ||
                language.startsWith("en-")
            ) {

                languages.add(
                    "en"
                );

            }

        }

    }


    if (
        data &&
        Array.isArray(
            data.playlistSubtitleLanguages
        )
    ) {

        for (
            const language
            of data.playlistSubtitleLanguages
        ) {

            const normalized =
                String(
                    language ||
                    ""
                )
                    .toLowerCase()
                    .trim();


            if (
                normalized === "ar" ||
                normalized.startsWith("ar-")
            ) {

                languages.add(
                    "ar"
                );

            }


            if (
                normalized === "en" ||
                normalized.startsWith("en-")
            ) {

                languages.add(
                    "en"
                );

            }

        }

    }


    if (
        languages.size === 0
    ) {

        const option =
            document.createElement(
                "option"
            );


        option.value =
            "";


        option.textContent =
            "No subtitles available";


        qualitySelect.appendChild(
            option
        );


        return;

    }


    if (
        languages.has(
            "ar"
        )
    ) {

        const option =
            document.createElement(
                "option"
            );


        option.value =
            "ar";


        option.textContent =
            "Arabic";


        qualitySelect.appendChild(
            option
        );

    }


    if (
        languages.has(
            "en"
        )
    ) {

        const option =
            document.createElement(
                "option"
            );


        option.value =
            "en";


        option.textContent =
            "English";


        qualitySelect.appendChild(
            option
        );

    }


    qualitySelect.value =
        "";

}


// ========================================
// Quality Select Listener
// ========================================

qualitySelect.addEventListener(
    "change",
    () => {


        const selectedId =
            qualitySelect.value;


        if (
            !selectedId
        ) {

            videoSize.textContent =
                "--";

            return;

        }


        if (
            currentType ===
            "audio"
        ) {


            if (
                !currentData ||
                !Array.isArray(
                    currentData.audioFormats
                )
            ) {

                videoSize.textContent =
                    "--";

                return;

            }


            let selectedAudio =
                null;


            if (
                selectedId ===
                "best"
            ) {

                selectedAudio =
                    currentData
                        .audioFormats
                        .slice()
                        .sort(
                            (a, b) => {

                                return (
                                    Number(
                                        b.abr
                                    ) -
                                    Number(
                                        a.abr
                                    )
                                );

                            }
                        )[0];

            }

            else {

                selectedAudio =
                    currentData
                        .audioFormats
                        .find(
                            (format) => {

                                return (
                                    String(
                                        format.formatId
                                    ) ===
                                    String(
                                        selectedId
                                    )
                                );

                            }
                        );

            }

            let audioSizeInMB =
                selectedAudio
                    ? (Number(selectedAudio.filesizeMB) || (Number(selectedAudio.filesize) / (1024 * 1024)) || 0)
                    : 0;

            // Calculate for Playlist
            if (
                audioSizeInMB > 0 &&
                currentData &&
                Array.isArray(currentData.playlistEntries) &&
                currentData.playlistEntries.length > 0
            ) {

                const firstVideoDuration = Number(currentData.duration) || 0;

                const checkedBoxes = document.querySelectorAll(".playlist-checkbox:checked");

                let totalDuration = 0;


                if (checkedBoxes.length > 0) {

                    checkedBoxes.forEach((cb) => {

                        const entry = currentData.playlistEntries[Number(cb.dataset.index)];

                        if (entry) totalDuration += Number(entry.duration) || 0;

                    });

                } else {

                    totalDuration = currentData.playlistEntries.reduce((sum, e) => sum + (Number(e.duration) || 0), 0);

                }


                if (firstVideoDuration > 0 && totalDuration > 0) {

                    audioSizeInMB *= (totalDuration / firstVideoDuration);

                }

            }


            if (
                audioSizeInMB > 0
            ) {

                videoSize.textContent =
                    audioSizeInMB >= 1024
                        ? `~${(audioSizeInMB / 1024).toFixed(2)} GB`
                        : `~${audioSizeInMB.toFixed(2)} MB`;

            }
            else {

                videoSize.textContent =
                    "--";

            }


            return;

        }


        if (
            currentType ===
            "subtitle"
        ) {

            videoSize.textContent =
                "--";

            return;

        }


        if (
            !currentData ||
            !Array.isArray(
                currentData.formats
            )
        ) {

            videoSize.textContent =
                "--";

            return;

        }


        let selected =
            null;


        if (
            selectedId ===
            "best"
        ) {

            selected =
                currentData
                    .formats
                    .slice()
                    .sort(
                        (a, b) => {

                            return (
                                Number(
                                    b.standardQuality
                                ) -
                                Number(
                                    a.standardQuality
                                )
                            );

                        }
                    )[0];

        }

        else {

            selected =
                currentData
                    .formats
                    .find(
                        (format) => {

                            return (
                                Number(
                                    format.standardQuality
                                ) ===
                                Number(
                                    selectedId
                                )
                            );

                        }
                    );

        }


        let videoSizeInMB =
            selected
                ? (Number(selected.estimatedSize) || Number(selected.filesizeMB) || (Number(selected.filesize) / (1024 * 1024)) || 0)
                : 0;

        // Calculate for Playlist
        if (
            videoSizeInMB > 0 &&
            currentData &&
            Array.isArray(currentData.playlistEntries) &&
            currentData.playlistEntries.length > 0
        ) {

            const firstVideoDuration = Number(currentData.duration) || 0;

            const checkedBoxes = document.querySelectorAll(".playlist-checkbox:checked");

            let totalDuration = 0;


            if (checkedBoxes.length > 0) {

                checkedBoxes.forEach((cb) => {

                    const entry = currentData.playlistEntries[Number(cb.dataset.index)];

                    if (entry) totalDuration += Number(entry.duration) || 0;

                });

            } else {

                totalDuration = currentData.playlistEntries.reduce((sum, e) => sum + (Number(e.duration) || 0), 0);

            }


            if (firstVideoDuration > 0 && totalDuration > 0) {

                videoSizeInMB *= (totalDuration / firstVideoDuration);

            }

        }


        if (
            videoSizeInMB > 0
        ) {

            videoSize.textContent =
                videoSizeInMB >= 1024
                    ? `~${(videoSizeInMB / 1024).toFixed(2)} GB`
                    : `~${videoSizeInMB.toFixed(2)} MB`;

        }
        else {

            videoSize.textContent =
                "--";

        }

    }
);


// ========================================
// Analyze button
// ========================================

document
    .getElementById(
        "analyzeButton"
    )
    .addEventListener(
        "click",
        async () => {


            const url =
                document
                    .getElementById(
                        "urlInput"
                    )
                    .value
                    .trim();


            if (
                !url
            ) {

                alert(
                    "Please enter a YouTube URL."
                );

                return;

            }


            status.classList.remove(
                "hidden"
            );


            statusText.textContent =
                "Analyzing URL...";


            try {


                const response =
                    await window
                        .electronAPI
                        .analyzeURL(
                            url
                        );


                console.log(
                    "Response from Electron:",
                    response
                );


                if (
                    response.success
                ) {


                    const data =
                        response.data;


                    let selectorData = {

                        ...data,

                        playlistSubtitleLanguages:
                            Array.isArray(
                                data.playlistSubtitleLanguages
                            )
                                ? data.playlistSubtitleLanguages
                                : []

                    };


                    if (
                        Array.isArray(
                            data.playlistEntries
                        ) &&
                        data.playlistEntries.length > 0
                    ) {

                        const firstEntry =
                            data.playlistEntries[0];


                        if (
                            firstEntry &&
                            typeof firstEntry.webpageUrl ===
                                "string" &&
                            firstEntry.webpageUrl.trim()
                        ) {

                            try {

                                const firstVideoResponse =
                                    await window
                                        .electronAPI
                                        .analyzeURL(
                                            firstEntry.webpageUrl
                                        );


                                if (
                                    firstVideoResponse &&
                                    firstVideoResponse.success &&
                                    firstVideoResponse.data
                                ) {

                                    selectorData = {

                                        ...firstVideoResponse.data,

                                        playlistEntries:
                                            data.playlistEntries,

                                        playlistSubtitleLanguages:
                                            Array.isArray(
                                                data.playlistSubtitleLanguages
                                            )
                                                ? data.playlistSubtitleLanguages
                                                : []

                                    };

                                }

                            }
                            catch (
                                firstVideoError
                            ) {

                                console.warn(
                                    "Could not analyze first playlist video for quality selectors:",
                                    firstVideoError
                                );

                            }

                        }

                    }


                    currentData =
                        selectorData;


                    document
                        .getElementById(
                            "videoTitle"
                        )
                        .textContent =
                        data.title ||
                        "Unknown title";


                    document
                        .getElementById(
                            "videoType"
                        )
                        .textContent =
                        currentType ===
                            "audio"
                            ? "Audio"
                            : "YouTube";


                    document
                        .getElementById(
                            "videoDuration"
                        )
                        .textContent =
                        selectorData.durationFormatted ||
                        data.durationFormatted ||
                        "--";


                    buildPlaylistList(
                        data
                    );

                    if (currentType === "audio") {

                        buildAudioList(
                            selectorData
                        );

                    } else if (currentType === "subtitle") {

                        buildSubtitleList(
                            selectorData
                        );

                    } else {

                        buildQualityList(
                            selectorData
                        );

                    }


                    status.classList.add(
                        "hidden"
                    );


                    result.classList.remove(
                        "hidden"
                    );

                }

                else {


                    status.classList.add(
                        "hidden"
                    );


                    alert(
                        "Error: " +
                        (
                            response.message ||
                            "Analysis failed."
                        )
                    );

                }


            }
            catch (
                error
            ) {


                status.classList.add(
                    "hidden"
                );


                alert(
                    "Error: " +
                    error.message
                );


                console.error(
                    error
                );

            }

        }
    );
        // ========================================
        // Paste button
        // ========================================

        document
            .getElementById(
                "pasteButton"
            )
            .addEventListener(
                "click",
                async () => {

                    try {

                        const text =
                            await navigator
                                .clipboard
                                .readText();


                        document
                            .getElementById(
                                "urlInput"
                            )
                            .value =
                            text;

                    }
                    catch (
                        error
                    ) {

                        alert(
                            "Unable to access clipboard."
                        );

                    }

                }
            );


        // ========================================
// Browse button
// ========================================

document
    .getElementById(
        "browseButton"
    )
    .addEventListener(
        "click",
        async () => {

            const selectedFolder =
                await electronAPI.chooseDownloadFolder();

            if (!selectedFolder) {
                return;
            }

            document
                .getElementById(
                    "locationInput"
                )
                .value =
                    selectedFolder;

        }
    );

document
    .getElementById(
        "locationInput"
    )
    .addEventListener(
        "click",
        () => {
            document.getElementById("browseButton").click();
        }
    );
        // ========================================
        // Download button
        // ========================================

        document
    .getElementById(
        "downloadButton"
    )
    .addEventListener(
        "click",
        async () => {

            // ========================================
            // Subtitle download
            // ========================================

            if (currentType === "subtitle") {

                const language =
                    qualitySelect.value;

                // No subtitle language selected
                if (!language) {

                    alert(
                        "Please select a subtitle language."
                    );

                    return;

                }

                if (!currentData) {

                    alert(
                        "Please analyze a YouTube URL first."
                    );

                    return;

                }

                const outputDir =
                    document
                        .getElementById(
                            "locationInput"
                        )
                        .value
                        .trim();

                if (!outputDir) {
                    alert(
                        "Please select a download folder first."
                    );
                    return;
                }

                try {

                    status.classList.remove(
                        "hidden"
                    );

                    statusText.textContent =
                        "Downloading subtitles...";


                    let playlistEntries =
                        Array.isArray(
                            currentData.playlistEntries
                        )
                            ? currentData.playlistEntries
                            : [];

                    let selectedEntries = [];

                    if (
                        playlistEntries.length > 0
                    ) {

                        const selectedCheckboxes =
                            Array.from(
                                document.querySelectorAll(
                                    ".playlist-checkbox:checked"
                                )
                            );

                        selectedEntries =
                            selectedCheckboxes
                                .map(
                                    (checkbox) => {

                                        const index =
                                            Number(
                                                checkbox.dataset.index
                                            );

                                        return (
                                            playlistEntries[index] ||
                                            null
                                        );

                                    }
                                )
                                .filter(
                                    (entry) => {

                                        return (
                                            entry &&
                                            typeof entry.webpageUrl ===
                                                "string" &&
                                            entry.webpageUrl.trim()
                                        );

                                    }
                                );

                        if (
                            selectedEntries.length === 0
                        ) {

                            status.classList.add(
                                "hidden"
                            );

                            alert(
                                "Please select at least one video from the playlist."
                            );

                            return;

                        }

                    }


                    // Check existing subtitle files
                    let subCollisionAction = 'overwrite';
                    try {
                        const checkResult = await window.electronAPI.checkExistingFiles({
                            outputDir,
                            items: [{ title: currentData.title }],
                            type: 'subtitle',
                            language
                        });

                        if (checkResult && checkResult.hasConflict) {
                            subCollisionAction = await showConflictPrompt({
                                isPlaylist: false,
                                conflicts: checkResult.conflicts,
                                totalCount: 1
                            });

                            if (subCollisionAction === 'cancel') {
                                status.classList.add("hidden");
                                return;
                            }
                        }
                    } catch (checkErr) {
                        console.warn('Conflict check error (subtitles):', checkErr);
                    }

                    const response =
    await window
        .electronAPI
        .downloadSubtitles({

            url:
                currentData.webpageUrl,

            language,

            outputDir,

            collisionAction: subCollisionAction,

            playlistEntries:
                selectedEntries,

            playlistTitle:
                currentData.title ||
                "Playlist"

        });


                    status.classList.add(
                        "hidden"
                    );


                    if (response.success) {

                        alert(
                            "Subtitle downloaded successfully."
                        );

                    } else {

                        alert(
                            "Error: " +
                            (
                                response.message ||
                                "Subtitle download failed."
                            )
                        );

                    }

                }
                catch (error) {

                    status.classList.add(
                        "hidden"
                    );

                    console.error(
                        "Subtitle download error:",
                        error
                    );

                    alert(
                        "Error: " +
                        error.message
                    );

                }

                return;
            }


            // ========================================
            // Video / Audio
            // ========================================
        if (!currentData) {

            alert(
                "Please analyze a YouTube URL first."
            );

            return;

        }


        const selectedQuality =
            qualitySelect.value;


        if (!selectedQuality) {

            alert(
                currentType === "audio"
                    ? "Please select an audio quality."
                    : "Please select a video quality."
            );

            return;

        }

        const outputDir =
            document
                .getElementById(
                    "locationInput"
                )
                .value
                .trim();

        if (!outputDir) {
            alert(
                "Please select a download folder first."
            );
            return;
        }

        try {

            status.classList.remove(
                "hidden"
            );


            resetDownloadProgress();

            downloadProgress.classList.remove(
                "hidden"
            );

            isDownloadCancelledLocally = false;
            resetDownloadControlsUI();
            if (downloadControlsEl) downloadControlsEl.classList.remove("hidden");


            // ========================================
            // Get selected Playlist entries
            // ========================================

            const playlistEntries =
                Array.isArray(
                    currentData.playlistEntries
                )
                    ? currentData.playlistEntries
                    : [];


            let downloadEntries =
                [];


            if (
                playlistEntries.length > 0
            ) {

                const selectedCheckboxes =
                    Array.from(
                        document.querySelectorAll(
                            ".playlist-checkbox:checked"
                        )
                    );


                downloadEntries =
                    selectedCheckboxes
                        .map(
                            (checkbox) => {

                                const index =
                                    Number(
                                        checkbox.dataset.index
                                    );


                                return (
                                    playlistEntries[index] ||
                                    null
                                );

                            }
                        )
                        .filter(
                            (entry) => {

                                return (
                                    entry &&
                                    typeof entry.webpageUrl ===
                                        "string" &&
                                    entry.webpageUrl.trim()
                                );

                            }
                        );

            }


            // ========================================
            // Single video / audio
            // ========================================

            if (
                playlistEntries.length === 0
            ) {

                downloadEntries = [

                    {

                        title:
                            currentData.title ||
                            "Video",

                        webpageUrl:
                            currentData.webpageUrl

                    }

                ];

            }


            if (
                downloadEntries.length === 0
            ) {

                throw new Error(
                    "Please select at least one video from the playlist."
                );

            }


            // ========================================
            // Check for existing files
            // ========================================
            let mediaCollisionAction = 'overwrite';
            const conflictTitlesSet = new Set();

            try {
                const conflictCheck = await window.electronAPI.checkExistingFiles({
                    outputDir,
                    items: downloadEntries.map(e => ({ title: e.title })),
                    type: currentType,
                    audioFormat: selectedQuality
                });

                if (conflictCheck && conflictCheck.hasConflict && conflictCheck.conflicts.length > 0) {
                    conflictCheck.conflicts.forEach(c => conflictTitlesSet.add(c.title));

                    mediaCollisionAction = await showConflictPrompt({
                        isPlaylist: downloadEntries.length > 1,
                        conflicts: conflictCheck.conflicts,
                        totalCount: downloadEntries.length
                    });

                    if (mediaCollisionAction === 'cancel') {
                        status.classList.add("hidden");
                        downloadProgress.classList.add("hidden");
                        return;
                    }
                }
            } catch (conflictErr) {
                console.warn('Conflict check error:', conflictErr);
            }

            const totalDownloads =
                downloadEntries.length;


            const failedDownloads =
                [];

            let skippedCount = 0;

            // ========================================
            // Download selected entries one by one
            // ========================================

            for (
                let i = 0;
                i < totalDownloads;
                i++
            ) {

                if (isDownloadCancelledLocally) {
                    break;
                }

                const entry =
                    downloadEntries[i];


                const title =
                    entry.title ||
                    `Video ${i + 1}`;

                // Skip if user chose skip and entry already exists
                if (mediaCollisionAction === 'skip' && conflictTitlesSet.has(entry.title)) {
                    skippedCount++;
                    continue;
                }

                statusText.textContent =
                    totalDownloads > 1
                        ? `Downloading ${i + 1} of ${totalDownloads}...`
                        : (
                            currentType === "audio"
                                ? "Downloading audio..."
                                : "Downloading video..."
                        );


                resetDownloadProgress();


                try {

                    const response =
                        await window
                            .electronAPI
                            .downloadMedia({

                                url:
                                    entry.webpageUrl,

                                type:
                                    currentType,

                                quality:
                                    selectedQuality,

                                outputDir,

                                collisionAction:
                                    mediaCollisionAction,

                                title:
                                    entry.title

                            });


                    if (response && response.cancelled) {
                        isDownloadCancelledLocally = true;
                        break;
                    }

                    if (
                        !response ||
                        !response.success
                    ) {

                        failedDownloads.push(
                            title
                        );

                    }

                }
                catch (
                    error
                ) {

                    console.error(
                        `Download failed: ${title}`,
                        error
                    );


                    failedDownloads.push(
                        title
                    );

                }

            }


            // ========================================
            // Download finished
            // ========================================

            resetDownloadProgress();

            if (downloadControlsEl) downloadControlsEl.classList.add("hidden");
            resetDownloadControlsUI();

            status.classList.add(
                "hidden"
            );

            if (isDownloadCancelledLocally) {
                return;
            }


            if (
                failedDownloads.length === 0
            ) {
                const downloadedCount = totalDownloads - skippedCount;
                let successMsg = "";
                if (skippedCount > 0) {
                    successMsg = `${downloadedCount} downloaded, ${skippedCount} skipped (already existed).`;
                } else {
                    successMsg = totalDownloads > 1
                        ? `All ${totalDownloads} selected videos downloaded successfully.`
                        : (
                            currentType === "audio"
                                ? "Audio downloaded successfully."
                                : "Video downloaded successfully."
                        );
                }
                alert(successMsg);

            } else {

                const successCount =
                    totalDownloads -
                    failedDownloads.length;


                alert(
                    `${successCount} of ${totalDownloads} downloads completed.\n\n` +
                    `Failed:\n` +
                    failedDownloads.join(
                        "\n"
                    )
                );

            }

        }
        catch (
            error
        ) {

            status.classList.add(
                "hidden"
            );


            resetDownloadProgress();


            console.error(
                "Download error:",
                error
            );


            alert(
                "Error: " +
                error.message
            );

        }

        }

    );


        // ========================================
        // Playlist View Toggle
        // ========================================

        const playlistToggleButton =
            document.getElementById(
                "playlistToggleButton"
            );

        const playlistContainer =
            document.getElementById(
                "playlistContainer"
            );

        const playlistList =
            document.getElementById(
                "playlistList"
            );

        const playlistSummaryInfo =
            document.querySelector(
                ".playlist-summary-info"
            );

        const videoInfo =
            document.querySelector(
                ".video-info"
            );


        if (
            playlistToggleButton &&
            playlistContainer &&
            playlistList &&
            playlistSummaryInfo &&
            videoInfo
        ) {

            playlistToggleButton.addEventListener(
                "click",
                () => {

                    const expanded =
                        videoInfo.classList.toggle(
                            "playlist-expanded"
                        );


                    if (
                        expanded
                    ) {

                        playlistList.classList.remove(
                            "hidden"
                        );


                        const selectionBar =
                            document.getElementById(
                                "playlistSelectionBar"
                            );


                        if (
                            selectionBar
                        ) {

                            selectionBar.classList.remove(
                                "hidden"
                            );

                        }


                        playlistSummaryInfo.classList.add(
                            "hidden"
                        );

                        playlistToggleButton.textContent =
                            "Hide Videos";

                    } else {

                        playlistList.classList.add(
                            "hidden"
                        );


                        const selectionBar =
                            document.getElementById(
                                "playlistSelectionBar"
                            );


                        if (
                            selectionBar
                        ) {

                            selectionBar.classList.add(
                                "hidden"
                            );

                        }


                        playlistSummaryInfo.classList.remove(
                            "hidden"
                        );

                        playlistToggleButton.textContent =
                            "View Videos";

                    }

                }
            );

        }


        // ========================================
        // Playlist Selection
        // ========================================

        function updatePlaylistSelection() {

            const checkboxes =
                document.querySelectorAll(
                    ".playlist-checkbox"
                );

            const selected =
                document.querySelectorAll(
                    ".playlist-checkbox:checked"
                );

            const total =
                checkboxes.length;

            const selectedCount =
                selected.length;

            const selectAll =
                document.getElementById(
                    "playlistSelectAll"
                );

            const count =
                document.getElementById(
                    "playlistSelectedCount"
                );

            if (count) {

                count.textContent =
                    `${selectedCount} videos selected`;

            }

            if (selectAll) {

                selectAll.checked =
                    total > 0 &&
                    selectedCount === total;

                selectAll.indeterminate =
                    selectedCount > 0 &&
                    selectedCount < total;

            }

        }


        document.addEventListener(
            "change",
            (event) => {

                if (
                    event.target &&
                    event.target.id ===
                    "playlistSelectAll"
                ) {

                    const checkboxes =
                        document.querySelectorAll(
                            ".playlist-checkbox"
                        );

                    checkboxes.forEach(
                        (checkbox) => {

                            checkbox.checked =
                                event.target.checked;

                        }
                    );

                    updatePlaylistSelection();

                    return;

                }


                if (
                    event.target &&
                    event.target.classList &&
                    event.target.classList.contains(
                        "playlist-checkbox"
                    )
                ) {

                    updatePlaylistSelection();

                }

            }
        );


        document.addEventListener(
            "click",
            (event) => {

                if (
                    event.target &&
                    event.target.id ===
                    "playlistToggleButton"
                ) {

                    setTimeout(
                        updatePlaylistSelection,
                        0
                    );

                }

            }
        );
