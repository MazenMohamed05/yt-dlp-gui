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

function parseSizeToMB(sizeStr) {
    if (!sizeStr) return 0;
    const m = String(sizeStr).trim().match(/^([\d.]+)\s*(B|KiB|MiB|GiB|TiB|KB|MB|GB|TB)$/i);
    if (!m) return 0;
    const num = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    const mults = {
        'b': 1 / (1024 * 1024),
        'kib': 1 / 1024,
        'kb': 1000 / (1024 * 1024),
        'mib': 1,
        'mb': (1000 * 1000) / (1024 * 1024),
        'gib': 1024,
        'gb': (1000 * 1000 * 1000) / (1024 * 1024),
        'tib': 1024 * 1024,
        'tb': (1000 * 1000 * 1000) / (1024 * 1024)
    };
    return num * (mults[unit] || 1);
}

function formatMB(mb) {
    if (!mb || mb <= 0) return '0 MB';
    if (mb >= 1024) {
        return (mb / 1024).toFixed(2) + ' GB';
    }
    return mb.toFixed(1) + ' MB';
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
            titleEl.textContent = "ملفات موجودة بالفعل / Files Already Exist";
            msgEl.textContent = `يوجد ${conflicts.length} من أصل ${totalCount} ملف موجودة بالفعل في مجلد الحفظ. ماذا تريد أن تفعل؟`;

            if (fileEl) {
                fileEl.classList.remove("hidden");
                fileEl.textContent = conflicts.slice(0, 4).map(c => c.fileName).join("\n") + (conflicts.length > 4 ? `\n... (+${conflicts.length - 4} ملف إضافي)` : "");
            }

            const skipBtn = document.createElement("button");
            skipBtn.className = "conflict-btn conflict-btn-skip";
            skipBtn.textContent = "⏭️ تخطي الموجود (Skip)";
            skipBtn.onclick = () => close("skip");
            actionsEl.appendChild(skipBtn);

            const overwriteBtn = document.createElement("button");
            overwriteBtn.className = "conflict-btn conflict-btn-overwrite";
            overwriteBtn.textContent = "🔄 استبدال الكل (Replace)";
            overwriteBtn.onclick = () => close("overwrite");
            actionsEl.appendChild(overwriteBtn);

            const renameBtn = document.createElement("button");
            renameBtn.className = "conflict-btn conflict-btn-rename";
            renameBtn.textContent = "📑 ترقيم (1) وحفظ الاثنين (Keep Both)";
            renameBtn.onclick = () => close("rename");
            actionsEl.appendChild(renameBtn);

            const cancelBtn = document.createElement("button");
            cancelBtn.className = "conflict-btn conflict-btn-cancel";
            cancelBtn.textContent = "✖ إلغاء (Cancel)";
            cancelBtn.onclick = () => close("cancel");
            actionsEl.appendChild(cancelBtn);
        } else {
            const existingName = (conflicts[0] && conflicts[0].fileName) || "الملف";
            titleEl.textContent = "الملف موجود بالفعل / File Already Exists";
            msgEl.textContent = `الملف "${existingName}" موجود بالفعل في هذا المجلد. ماذا تريد أن تفعل؟`;

            if (fileEl) {
                fileEl.classList.remove("hidden");
                fileEl.textContent = existingName;
            }

            const overwriteBtn = document.createElement("button");
            overwriteBtn.className = "conflict-btn conflict-btn-overwrite";
            overwriteBtn.textContent = "🔄 استبدال (Replace)";
            overwriteBtn.onclick = () => close("overwrite");
            actionsEl.appendChild(overwriteBtn);

            const renameBtn = document.createElement("button");
            renameBtn.className = "conflict-btn conflict-btn-rename";
            renameBtn.textContent = "📑 ترقيم (1) وحفظ الاثنين (Keep Both)";
            renameBtn.onclick = () => close("rename");
            actionsEl.appendChild(renameBtn);

            const cancelBtn = document.createElement("button");
            cancelBtn.className = "conflict-btn conflict-btn-cancel";
            cancelBtn.textContent = "✖ إلغاء (Cancel)";
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
    (payload) => {

        let taskId = null;
        let text = '';
        if (payload && typeof payload === 'object') {
            taskId = payload.taskId;
            text = payload.text;
        } else {
            text = String(payload || '');
        }

        if (!text) {
            return;
        }

        const percentMatch = text.match(/(\d+(?:\.\d+)?)%/);
        const speedMatch = text.match(/at\s+([^\s]+\/s)/i);
        const etaMatch = text.match(/ETA\s+([0-9:]+)/i);

        const percent = percentMatch ? parseFloat(percentMatch[1]) : null;
        const speed = speedMatch ? speedMatch[1] : null;
        const eta = etaMatch ? etaMatch[1] : null;

        // Rich size matching e.g. "of 50.0MiB (12.5MiB / 50.0MiB, 37.5MiB left)"
        const richSizeMatch = text.match(/\(([\d.]+\s*[A-Za-z]+)\s*\/\s*([\d.]+\s*[A-Za-z]+)(?:,\s*([\d.]+\s*[A-Za-z]+)\s+left)?\)/i);
        const totalMatch = text.match(/of\s+~?\s*([\d.]+\s*(?:KiB|MiB|GiB|TiB|KB|MB|GB|TB|B))/i);

        let downloadedSize = null;
        let totalSize = null;
        let remainingSize = null;

        if (richSizeMatch) {
            downloadedSize = richSizeMatch[1];
            totalSize = richSizeMatch[2];
            remainingSize = richSizeMatch[3] || null;
        } else if (totalMatch) {
            totalSize = totalMatch[1];
            if (percent !== null) {
                const totalMB = parseSizeToMB(totalSize);
                if (totalMB > 0) {
                    const dlMB = (totalMB * percent) / 100;
                    const remMB = Math.max(0, totalMB - dlMB);
                    downloadedSize = formatMB(dlMB);
                    totalSize = formatMB(totalMB);
                    remainingSize = formatMB(remMB);
                }
            }
        }

        if (window.queueManager) {
            window.queueManager.onProgress(taskId, {
                text,
                percent,
                speed,
                eta,
                totalSize,
                downloadedSize,
                remainingSize
            });
        }

        if (
            percent === null &&
            !speed &&
            !eta &&
            !totalSize
        ) {
            return;
        }

        downloadProgress.classList.remove("hidden");

        if (percent !== null) {
            progressPercent.textContent = `${percent.toFixed(1)}%`;
            progressBarFill.style.width = `${Math.min(percent, 100)}%`;
        }

        if (speed) {
            progressSpeed.textContent = speed;
        }

        if (eta) {
            progressEta.textContent = `ETA ${eta}`;
        }

        if (downloadedSize && totalSize) {
            progressDownloaded.textContent = `${downloadedSize} / ${totalSize}`;
            progressTotal.textContent = remainingSize ? `باقي ${remainingSize}` : totalSize;
        } else if (totalSize) {
            progressTotal.textContent = totalSize;
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
        // Advanced Media Options Helpers
        // ========================================

        function initAdvancedOptions() {
            const toggle = document.getElementById("advancedOptionsToggle");
            const content = document.getElementById("advancedOptionsContent");

            if (toggle && content) {
                toggle.addEventListener("click", () => {
                    const isHidden = content.classList.toggle("hidden");
                    toggle.classList.toggle("collapsed", isHidden);
                    localStorage.setItem("optSectionCollapsed", isHidden ? "true" : "false");
                });

                const savedCollapsed = localStorage.getItem("optSectionCollapsed");
                if (savedCollapsed === "true") {
                    content.classList.add("hidden");
                    toggle.classList.add("collapsed");
                }
            }

            const optIds = ["optEmbedThumbnail", "optEmbedMetadata", "optSponsorBlock", "optEmbedSubs"];
            optIds.forEach((id) => {
                const el = document.getElementById(id);
                if (el) {
                    const saved = localStorage.getItem(id);
                    if (saved !== null) {
                        el.checked = (saved === "true");
                    }
                    el.addEventListener("change", () => {
                        localStorage.setItem(id, el.checked ? "true" : "false");
                    });
                }
            });
        }

        function updateAdvancedOptionsVisibility() {
            const section = document.querySelector(".advanced-options-section");
            const subsContainer = document.getElementById("optEmbedSubsContainer");
            if (!section) return;

            if (currentType === "subtitle") {
                section.classList.add("hidden");
            } else {
                section.classList.remove("hidden");
                if (subsContainer) {
                    subsContainer.style.display = (currentType === "audio") ? "none" : "flex";
                }
            }
        }

        initAdvancedOptions();
        updateAdvancedOptionsVisibility();


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

                        updateAdvancedOptionsVisibility();

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

            if (format.isOriginal) {
                text += " (Original)";
            } else if (format.formatNote) {
                const noteClean = String(format.formatNote).split(",")[0].trim();
                if (noteClean && !/original|default/i.test(noteClean)) {
                    text += ` [${noteClean}]`;
                }
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
        // ====================================================================
        // Download Queue Integration: Build Tasks & Listeners
        // ====================================================================

        function buildTasksFromCurrentForm() {
            if (!currentData) {
                showModalAlert("Please analyze a YouTube URL first.");
                return null;
            }

            const selectedQuality = qualitySelect.value;
            if (!selectedQuality) {
                showModalAlert(
                    currentType === "subtitle"
                        ? "Please select a subtitle language."
                        : currentType === "audio"
                        ? "Please select an audio quality."
                        : "Please select a video quality."
                );
                return null;
            }

            const outputDir = document.getElementById("locationInput").value.trim();
            if (!outputDir) {
                showModalAlert("Please select a download folder first.");
                return null;
            }

            const playlistEntries = Array.isArray(currentData.playlistEntries) ? currentData.playlistEntries : [];
            let entries = [];

            if (playlistEntries.length > 0) {
                const checkedBoxes = Array.from(document.querySelectorAll(".playlist-checkbox:checked"));
                if (checkedBoxes.length === 0) {
                showModalAlert("Please select at least one video from the playlist.");
                return null;
            }
                entries = checkedBoxes.map(cb => playlistEntries[Number(cb.dataset.index)]).filter(Boolean);
            } else {
                entries = [{
                    title: currentData.title || "Video",
                    webpageUrl: currentData.webpageUrl || currentData.url,
                    thumbnail: currentData.thumbnail || '',
                    duration: currentData.duration || ''
                }];
            }

            const embedThumbnail = document.getElementById("optEmbedThumbnail")?.checked ?? true;
            const embedMetadata = document.getElementById("optEmbedMetadata")?.checked ?? true;
            const sponsorBlock = document.getElementById("optSponsorBlock")?.checked ?? false;
            const embedSubs = document.getElementById("optEmbedSubs")?.checked ?? false;

            let qualityLabel = selectedQuality;
            if (currentType === 'video') {
                qualityLabel = `${selectedQuality}p MP4`;
            } else if (currentType === 'audio') {
                qualityLabel = `${selectedQuality.toUpperCase()}`;
            } else if (currentType === 'subtitle') {
                qualityLabel = `Sub: ${selectedQuality.toUpperCase()}`;
            }

            return entries.map((entry, idx) => ({
                id: 'task_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 6),
                title: entry.title || `Item ${idx + 1}`,
                url: entry.webpageUrl || entry.url || currentData.webpageUrl,
                type: currentType,
                quality: selectedQuality,
                qualityLabel,
                outputDir,
                thumbnail: entry.thumbnail || currentData.thumbnail || '',
                duration: entry.duration || currentData.duration || '',
                options: {
                    collisionAction: 'overwrite',
                    embedThumbnail,
                    embedMetadata,
                    sponsorBlock,
                    embedSubs
                },
                status: 'pending',
                progressPercent: 0,
                speed: '',
                eta: '',
                totalSize: '',
                filePath: null,
                error: null,
                createdAt: Date.now()
            }));
        }

        async function handleDownloadOrQueue(autoStart = true) {
            const rawTasks = buildTasksFromCurrentForm();
            if (!rawTasks || rawTasks.length === 0) return;

            let finalCollisionAction = 'overwrite';
            const outputDir = rawTasks[0].outputDir;
            const type = rawTasks[0].type;
            const audioFormat = rawTasks[0].quality;

            try {
                if (window.electronAPI && window.electronAPI.checkExistingFiles) {
                    const checkRes = await window.electronAPI.checkExistingFiles({
                        outputDir,
                        items: rawTasks.map(t => ({ title: t.title })),
                        type,
                        audioFormat,
                        language: rawTasks[0].quality
                    });

                    if (checkRes && checkRes.hasConflict) {
                        const action = await showConflictPrompt({
                            isPlaylist: rawTasks.length > 1,
                            conflicts: checkRes.conflicts,
                            totalCount: rawTasks.length
                        });

                        if (action === 'cancel') {
                            return;
                        }

                        if (action === 'skip') {
                            const conflictTitles = new Set(checkRes.conflicts.map(c => c.title));
                            const nonConflictingTasks = rawTasks.filter(t => !conflictTitles.has(t.title));
                            if (nonConflictingTasks.length === 0) {
                                showToast('تم تخطي جميع الملفات الموجودة بالفعل / All existing items skipped.', 'ℹ️');
                                return;
                            }
                            rawTasks.length = 0;
                            rawTasks.push(...nonConflictingTasks);
                            finalCollisionAction = 'overwrite';
                        } else {
                            finalCollisionAction = action; // 'rename' or 'overwrite'
                        }
                    }
                }
            } catch (err) {
                console.warn('Conflict check error:', err);
            }

            const finalTasks = rawTasks.map(t => ({
                ...t,
                options: {
                    ...t.options,
                    collisionAction: finalCollisionAction
                }
            }));

            if (window.queueManager) {
                window.queueManager.addTasks(finalTasks, autoStart);
            }

            if (autoStart) {
                const navQueue = document.getElementById("navQueue");
                if (navQueue) navQueue.click();
                showToast(
                    finalTasks.length > 1
                        ? `Started downloading ${finalTasks.length} items`
                        : `Started downloading: ${finalTasks[0].title}`,
                    '🚀'
                );
            } else {
                showToast(
                    finalTasks.length > 1
                        ? `Added ${finalTasks.length} items to Queue`
                        : `Added to Queue: ${finalTasks[0].title}`,
                    '➕'
                );
            }
        }

        const downloadButtonEl = document.getElementById("downloadButton");
        if (downloadButtonEl) {
            downloadButtonEl.addEventListener("click", () => handleDownloadOrQueue(true));
        }

        const addToQueueButtonEl = document.getElementById("addToQueueButton");
        if (addToQueueButtonEl) {
            addToQueueButtonEl.addEventListener("click", () => handleDownloadOrQueue(false));
        }


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


// ============================================================================
// Toast Notification System
// ============================================================================
function showToast(message, icon = '✅', duration = 3200) {
    const toast = document.getElementById('toastNotification');
    const toastMsg = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');
    if (!toast || !toastMsg) return;
    toastMsg.textContent = message;
    if (toastIcon) toastIcon.textContent = icon;
    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.add('hidden');
    }, duration);
}

// ============================================================================
// Navigation Tabs (New Download vs Download Queue)
// ============================================================================
function setupNavigation() {
    const navNew = document.getElementById('navNewDownload');
    const navQueue = document.getElementById('navQueue');
    const viewNew = document.getElementById('newDownloadView');
    const viewQueue = document.getElementById('queueView');

    if (!navNew || !navQueue || !viewNew || !viewQueue) return;

    navNew.addEventListener('click', () => {
        navNew.classList.add('active');
        navQueue.classList.remove('active');
        viewNew.classList.remove('hidden');
        viewQueue.classList.add('hidden');
    });

    navQueue.addEventListener('click', () => {
        navQueue.classList.add('active');
        navNew.classList.remove('active');
        viewQueue.classList.remove('hidden');
        viewNew.classList.add('hidden');
        if (window.queueManager) {
            window.queueManager.render();
        }
    });
}

// ============================================================================
// Download Queue Manager
// ============================================================================
class QueueManager {
    constructor() {
        this.tasks = [];
        this.maxConcurrent = 1;
        this.activeFilter = 'all';
        this.isProcessing = false;
        this.init();
    }

    init() {
        this.loadQueue();
        this.setupControls();
        this.setupFilters();
        this.setupQueueDelegation();
        this.render();
        this.updateBadge();
        this.updateStats();
    }

    saveQueue() {
        try {
            const serialized = this.tasks.map(t => ({
                id: t.id,
                title: t.title,
                url: t.url,
                type: t.type,
                quality: t.quality,
                qualityLabel: t.qualityLabel,
                outputDir: t.outputDir,
                thumbnail: t.thumbnail,
                duration: t.duration,
                options: t.options,
                status: t.status === 'downloading' ? 'pending' : t.status,
                progressPercent: t.status === 'completed' ? 100 : (t.progressPercent || 0),
                speed: '',
                eta: '',
                totalSize: t.totalSize || '',
                filePath: t.filePath || null,
                error: t.error || null,
                createdAt: t.createdAt || Date.now()
            }));
            localStorage.setItem('yt_download_queue', JSON.stringify(serialized));
        } catch (e) {
            console.error('Failed to save queue', e);
        }
    }

    loadQueue() {
        try {
            const raw = localStorage.getItem('yt_download_queue');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    this.tasks = parsed;
                }
            }
        } catch (e) {
            console.error('Failed to load queue', e);
        }
    }

    setupControls() {
        const select = document.getElementById('maxConcurrentSelect');
        if (select) {
            const saved = localStorage.getItem('yt_queue_concurrent');
            if (saved) {
                this.maxConcurrent = parseInt(saved, 10) || 1;
                select.value = String(this.maxConcurrent);
            }
            select.addEventListener('change', (e) => {
                this.maxConcurrent = parseInt(e.target.value, 10) || 1;
                localStorage.setItem('yt_queue_concurrent', String(this.maxConcurrent));
                this.processQueue();
            });
        }

        const btnStartAll = document.getElementById('queueStartAllBtn');
        if (btnStartAll) {
            btnStartAll.addEventListener('click', () => this.startAll());
        }

        const btnPauseAll = document.getElementById('queuePauseAllBtn');
        if (btnPauseAll) {
            btnPauseAll.addEventListener('click', () => this.pauseAll());
        }

        const btnClear = document.getElementById('queueClearCompletedBtn');
        if (btnClear) {
            btnClear.addEventListener('click', () => this.clearFinished());
        }
    }

    setupFilters() {
        const tabs = document.querySelectorAll('.queue-filter-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.activeFilter = tab.dataset.filter || 'all';
                this.render();
            });
        });
    }

    setupQueueDelegation() {
        const list = document.getElementById('queueList');
        if (!list) return;

        list.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const taskId = btn.dataset.id;
            const filePath = btn.dataset.path;

            if (action === 'pause') {
                this.pauseTask(taskId);
            } else if (action === 'resume') {
                this.resumeTask(taskId);
            } else if (action === 'cancel') {
                this.cancelTask(taskId);
            } else if (action === 'retry') {
                this.retryTask(taskId);
            } else if (action === 'remove') {
                this.removeTask(taskId);
            } else if (action === 'start') {
                this.startTask(taskId);
            } else if (action === 'open-file') {
                if (filePath) {
                    window.electronAPI.openFile(filePath).then(res => {
                        if (!res || !res.success) {
                            showToast('Could not open file (file might have been moved)', '⚠️');
                        }
                    });
                }
            } else if (action === 'show-folder') {
                const target = filePath || (taskId && this.tasks.find(t => t.id === taskId)?.outputDir);
                if (target) {
                    window.electronAPI.showInFolder(target);
                }
            }
        });
    }

    addTasks(newTasks, autoStart = true) {
        for (const t of newTasks) {
            this.tasks.push(t);
        }
        this.saveQueue();
        this.updateBadge();
        this.updateStats();
        this.render();

        if (autoStart) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const downloading = this.tasks.filter(t => t.status === 'downloading');
            const availableSlots = this.maxConcurrent - downloading.length;

            if (availableSlots > 0) {
                const pending = this.tasks.filter(t => t.status === 'pending');
                const toRun = pending.slice(0, availableSlots);
                for (const task of toRun) {
                    this.executeTask(task);
                }
            }
        } finally {
            this.isProcessing = false;
            this.updateBadge();
            this.updateStats();
        }
    }

    async executeTask(task) {
        task.status = 'downloading';
        task.error = null;
        this.updateTaskUI(task);
        this.updateStats();
        this.saveQueue();

        try {
            if (task.type === 'subtitle') {
                const res = await window.electronAPI.downloadSubtitles({
                    url: task.url,
                    language: task.quality,
                    outputDir: task.outputDir,
                    taskId: task.id
                });
                if (res && res.success) {
                    task.status = 'completed';
                    task.progressPercent = 100;
                    task.filePath = res.file ? `${task.outputDir}/${res.file}` : null;
                    showToast(`Subtitles saved: ${task.title}`, '✅');
                } else if (res && res.cancelled) {
                    task.status = 'cancelled';
                } else {
                    task.status = 'failed';
                    task.error = res ? res.message : 'Subtitle download failed.';
                }
            } else {
                const res = await window.electronAPI.downloadMedia({
                    url: task.url,
                    type: task.type,
                    quality: task.quality,
                    outputDir: task.outputDir,
                    title: task.title,
                    collisionAction: task.options?.collisionAction || 'overwrite',
                    embedThumbnail: task.options?.embedThumbnail ?? true,
                    embedMetadata: task.options?.embedMetadata ?? true,
                    sponsorBlock: task.options?.sponsorBlock ?? false,
                    embedSubs: task.options?.embedSubs ?? false,
                    taskId: task.id
                });

                if (res && res.success) {
                    task.status = 'completed';
                    task.progressPercent = 100;
                    task.filePath = res.filePath || null;
                    showToast(`Downloaded: ${task.title}`, '🎉');
                } else if (res && res.cancelled) {
                    task.status = 'cancelled';
                } else if (res && res.paused) {
                    task.status = 'paused';
                } else if (task.status === 'paused') {
                    // remaining paused
                } else {
                    task.status = 'failed';
                    task.error = res ? res.message : 'Download failed.';
                }
            }
        } catch (err) {
            if (task.status === 'paused' || err.message === 'DOWNLOAD_PAUSED') {
                task.status = 'paused';
            } else if (err.message === 'DOWNLOAD_CANCELLED') {
                task.status = 'cancelled';
            } else {
                task.status = 'failed';
                task.error = err.message || 'Error occurred';
            }
        } finally {
            this.updateTaskUI(task);
            this.saveQueue();
            this.processQueue();
        }
    }

    onProgress(taskId, metrics) {
        if (!taskId) return;
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        if (metrics.percent !== null) {
            task.progressPercent = Math.max(task.progressPercent || 0, metrics.percent);
        }
        if (metrics.speed) task.speed = metrics.speed;
        if (metrics.eta) task.eta = metrics.eta;
        if (metrics.totalSize) task.totalSize = metrics.totalSize;
        if (metrics.downloadedSize) task.downloadedSize = metrics.downloadedSize;
        if (metrics.remainingSize) task.remainingSize = metrics.remainingSize;

        this.updateTaskProgressUI(task);
    }

    startTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        task.status = 'pending';
        task.error = null;
        this.updateTaskUI(task);
        this.saveQueue();
        this.processQueue();
    }

    pauseTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        task.status = 'paused';
        window.electronAPI.pauseDownload(taskId);
        this.updateTaskUI(task);
        this.saveQueue();
    }

    resumeTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        task.status = 'pending';
        task.error = null;
        this.updateTaskUI(task);
        this.saveQueue();
        this.processQueue();
    }

    cancelTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        window.electronAPI.cancelDownload(taskId);
        task.status = 'cancelled';
        this.updateTaskUI(task);
        this.saveQueue();
        this.processQueue();
    }

    retryTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        task.status = 'pending';
        task.error = null;
        task.progressPercent = 0;
        task.speed = '';
        task.eta = '';
        this.updateTaskUI(task);
        this.saveQueue();
        this.processQueue();
    }

    removeTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task && (task.status === 'downloading' || task.status === 'paused')) {
            window.electronAPI.cancelDownload(taskId);
        }
        this.tasks = this.tasks.filter(t => t.id !== taskId);
        this.saveQueue();
        this.render();
        this.updateBadge();
        this.updateStats();
        this.processQueue();
    }

    startAll() {
        let count = 0;
        for (const task of this.tasks) {
            if (['pending', 'paused', 'failed', 'cancelled'].includes(task.status)) {
                task.status = 'pending';
                task.error = null;
                count++;
            }
        }
        if (count > 0) showToast(`Started ${count} downloads`, '▶');
        this.render();
        this.saveQueue();
        this.processQueue();
    }

    pauseAll() {
        window.electronAPI.pauseDownload('all');
        let count = 0;
        for (const task of this.tasks) {
            if (task.status === 'downloading') {
                task.status = 'paused';
                count++;
            }
        }
        if (count > 0) showToast(`Paused ${count} downloads`, '⏸');
        this.render();
        this.saveQueue();
    }

    clearFinished() {
        const before = this.tasks.length;
        this.tasks = this.tasks.filter(t => t.status === 'downloading' || t.status === 'pending' || t.status === 'paused');
        const removed = before - this.tasks.length;
        if (removed > 0) showToast(`Cleared ${removed} finished tasks`, '🗑');
        this.saveQueue();
        this.render();
        this.updateBadge();
        this.updateStats();
    }

    updateBadge() {
        const badge = document.getElementById('queueBadge');
        if (!badge) return;
        const activeOrPending = this.tasks.filter(t => t.status === 'downloading' || t.status === 'pending');
        if (activeOrPending.length > 0) {
            badge.textContent = String(activeOrPending.length);
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    updateStats() {
        const stats = document.getElementById('queueStats');
        if (stats) {
            const active = this.tasks.filter(t => t.status === 'downloading').length;
            const pending = this.tasks.filter(t => t.status === 'pending').length;
            stats.textContent = `${this.tasks.length} total • ${active} active • ${pending} pending`;
        }

        const countAll = document.getElementById('filterCountAll');
        const countActive = document.getElementById('filterCountActive');
        const countPending = document.getElementById('filterCountPending');
        const countCompleted = document.getElementById('filterCountCompleted');
        const countFailed = document.getElementById('filterCountFailed');

        if (countAll) countAll.textContent = this.tasks.length;
        if (countActive) countActive.textContent = this.tasks.filter(t => t.status === 'downloading').length;
        if (countPending) countPending.textContent = this.tasks.filter(t => t.status === 'pending').length;
        if (countCompleted) countCompleted.textContent = this.tasks.filter(t => t.status === 'completed').length;
        if (countFailed) countFailed.textContent = this.tasks.filter(t => t.status === 'failed' || t.status === 'cancelled').length;
    }

    getFilteredTasks() {
        if (this.activeFilter === 'active') {
            return this.tasks.filter(t => t.status === 'downloading' || t.status === 'paused');
        } else if (this.activeFilter === 'pending') {
            return this.tasks.filter(t => t.status === 'pending');
        } else if (this.activeFilter === 'completed') {
            return this.tasks.filter(t => t.status === 'completed');
        } else if (this.activeFilter === 'failed') {
            return this.tasks.filter(t => t.status === 'failed' || t.status === 'cancelled');
        }
        return this.tasks;
    }

    render() {
        const list = document.getElementById('queueList');
        if (!list) return;

        const filtered = this.getFilteredTasks();

        if (filtered.length === 0) {
            list.innerHTML = `
                <div class="queue-empty-state">
                    <div class="queue-empty-icon">📥</div>
                    <h3>No downloads in this view</h3>
                    <p>Add YouTube videos or playlists to your queue to download them here.</p>
                </div>
            `;
            this.updateStats();
            return;
        }

        list.innerHTML = filtered.map(task => this.renderTaskCard(task)).join('');
        this.updateStats();
    }

    renderTaskCard(task) {
        const pct = task.progressPercent || 0;
        const statusMap = {
            'pending': { text: '⏳ Pending', class: 'status-chip-pending' },
            'downloading': { text: '⚡ Downloading', class: 'status-chip-downloading' },
            'paused': { text: '⏸ Paused', class: 'status-chip-paused' },
            'completed': { text: '✅ Completed', class: 'status-chip-completed' },
            'failed': { text: '❌ Failed', class: 'status-chip-failed' },
            'cancelled': { text: '⏹ Cancelled', class: 'status-chip-cancelled' }
        };

        const statusInfo = statusMap[task.status] || { text: task.status, class: 'status-chip-pending' };

        let actionBtns = '';
        if (task.status === 'downloading') {
            actionBtns = `
                <button class="queue-btn-icon" data-action="pause" data-id="${task.id}" title="Pause download">⏸</button>
                <button class="queue-btn-icon danger" data-action="cancel" data-id="${task.id}" title="Cancel download">⏹</button>
            `;
        } else if (task.status === 'paused') {
            actionBtns = `
                <button class="queue-btn-icon success" data-action="resume" data-id="${task.id}" title="Resume download">▶</button>
                <button class="queue-btn-icon danger" data-action="cancel" data-id="${task.id}" title="Cancel download">⏹</button>
            `;
        } else if (task.status === 'pending') {
            actionBtns = `
                <button class="queue-btn-icon success" data-action="start" data-id="${task.id}" title="Start now">▶</button>
                <button class="queue-btn-icon danger" data-action="remove" data-id="${task.id}" title="Remove from queue">🗑</button>
            `;
        } else if (task.status === 'completed') {
            actionBtns = `
                ${task.filePath ? `<button class="queue-btn-icon success" data-action="open-file" data-path="${task.filePath.replace(/"/g, '&quot;')}" title="Play / Open file">▶</button>` : ''}
                <button class="queue-btn-icon" data-action="show-folder" data-path="${(task.filePath || task.outputDir || '').replace(/"/g, '&quot;')}" data-id="${task.id}" title="Show in folder">📁</button>
                <button class="queue-btn-icon danger" data-action="remove" data-id="${task.id}" title="Remove from queue">🗑</button>
            `;
        } else {
            actionBtns = `
                <button class="queue-btn-icon success" data-action="retry" data-id="${task.id}" title="Retry download">🔄</button>
                <button class="queue-btn-icon danger" data-action="remove" data-id="${task.id}" title="Remove from queue">🗑</button>
            `;
        }

        const thumbHtml = task.thumbnail
            ? `<img class="queue-item-thumb" src="${task.thumbnail}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"><div class="queue-item-thumb-placeholder" style="display:none;">🎬</div>`
            : `<div class="queue-item-thumb-placeholder">${task.type === 'audio' ? '🎵' : task.type === 'subtitle' ? '💬' : '🎬'}</div>`;

        return `
            <div id="card_${task.id}" class="queue-item status-${task.status}">
                <div class="queue-item-thumb-box">
                    ${thumbHtml}
                </div>
                <div class="queue-item-info">
                    <div class="queue-item-top">
                        <div class="queue-item-title-wrapper">
                            <span class="queue-item-title" title="${task.title}">${task.title}</span>
                            <span class="queue-item-badge ${task.type}">${task.qualityLabel || task.quality}</span>
                        </div>
                        <span class="queue-status-chip ${statusInfo.class}">${statusInfo.text}</span>
                    </div>

                    <div class="queue-item-progress-track">
                        <div id="progress_${task.id}" class="queue-item-progress-fill" style="width: ${pct}%;"></div>
                    </div>

                    <div class="queue-item-meta">
                        <div class="queue-item-meta-left">
                            <span id="percent_${task.id}" class="queue-item-percent">${task.error ? `<span style="color:#f87171;">${task.error}</span>` : (pct > 0 ? pct.toFixed(1) + '%' : (task.status === 'downloading' ? 'Connecting...' : 'Ready'))}</span>
                            <span id="size_${task.id}" class="queue-item-size-info">${task.downloadedSize && task.totalSize ? `${task.downloadedSize} / ${task.totalSize} • باقي ${task.remainingSize || '--'}` : (task.totalSize ? task.totalSize : '')}</span>
                        </div>
                        <div class="queue-item-speed-eta">
                            <span id="speed_${task.id}" class="queue-item-speed">${task.speed || ''}</span>
                            <span id="eta_${task.id}" class="queue-item-eta">${task.eta ? 'ETA ' + task.eta : ''}</span>
                        </div>
                    </div>
                </div>
                <div class="queue-item-actions">
                    ${actionBtns}
                </div>
            </div>
        `;
    }

    updateTaskUI(task) {
        const card = document.getElementById('card_' + task.id);
        if (card) {
            const temp = document.createElement('div');
            temp.innerHTML = this.renderTaskCard(task);
            if (temp.firstElementChild) {
                card.replaceWith(temp.firstElementChild);
            }
        } else {
            this.render();
        }
        this.updateStats();
        this.updateBadge();
    }

    updateTaskProgressUI(task) {
        const bar = document.getElementById('progress_' + task.id);
        const pctEl = document.getElementById('percent_' + task.id);
        const sizeEl = document.getElementById('size_' + task.id);
        const speedEl = document.getElementById('speed_' + task.id);
        const etaEl = document.getElementById('eta_' + task.id);

        if (bar && task.progressPercent !== undefined) {
            bar.style.width = Math.min(task.progressPercent, 100) + '%';
        }
        if (pctEl && task.progressPercent !== undefined) {
            pctEl.textContent = task.progressPercent.toFixed(1) + '%';
        }
        if (sizeEl) {
            if (task.downloadedSize && task.totalSize) {
                sizeEl.textContent = `${task.downloadedSize} / ${task.totalSize} • باقي ${task.remainingSize || '--'}`;
            } else if (task.totalSize) {
                sizeEl.textContent = task.totalSize;
            }
        }
        if (speedEl && task.speed) {
            speedEl.textContent = task.speed;
        }
        if (etaEl && task.eta) {
            etaEl.textContent = 'ETA ' + task.eta;
        }
    }
}

// ============================================================================
// What's New / Changelog Dialog
// ============================================================================
const APP_CURRENT_VERSION = '1.2.0';

function setupWhatsNewModal() {
    const modal = document.getElementById('whatsNewModal');
    const closeBtn = document.getElementById('whatsNewCloseBtn');
    const versionBtn = document.getElementById('versionBadgeBtn');

    if (!modal) return;

    function openWhatsNew() {
        modal.classList.remove('hidden');
    }

    function closeWhatsNew() {
        modal.classList.add('hidden');
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeWhatsNew);
    }

    if (versionBtn) {
        versionBtn.addEventListener('click', openWhatsNew);
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeWhatsNew();
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeWhatsNew();
        }
    });

    // Check if user just updated to this version
    const lastVersion = localStorage.getItem('app_last_seen_version');
    if (lastVersion && lastVersion !== APP_CURRENT_VERSION) {
        openWhatsNew();
    }
    localStorage.setItem('app_last_seen_version', APP_CURRENT_VERSION);
}

// ============================================================================
// Automatic App Update Checker
// ============================================================================
function setupAutoUpdateChecker() {
    const modal = document.getElementById('appUpdateModal');
    const curVerEl = document.getElementById('updateCurrentVersion');
    const newVerEl = document.getElementById('updateNewVersion');
    const notesEl = document.getElementById('updateReleaseNotes');
    const downloadBtn = document.getElementById('updateDownloadBtn');
    const laterBtn = document.getElementById('updateLaterBtn');

    if (!modal) return;

    let targetDownloadUrl = 'https://github.com/MazenMohamed05/yt-dlp-gui/releases';

    function closeUpdateModal() {
        modal.classList.add('hidden');
    }

    if (laterBtn) {
        laterBtn.addEventListener('click', closeUpdateModal);
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeUpdateModal();
    });

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (window.electronAPI && window.electronAPI.openExternalUrl) {
                window.electronAPI.openExternalUrl(targetDownloadUrl);
            }
            closeUpdateModal();
        });
    }

    async function checkUpdates(manual = false) {
        if (!window.electronAPI || !window.electronAPI.checkForUpdates) return;
        try {
            const res = await window.electronAPI.checkForUpdates();
            if (res && res.updateAvailable) {
                targetDownloadUrl = res.downloadUrl || res.releaseUrl || targetDownloadUrl;
                if (curVerEl) curVerEl.textContent = `Current: v${res.currentVersion || APP_CURRENT_VERSION}`;
                if (newVerEl) newVerEl.textContent = `New: v${res.latestVersion}`;
                if (notesEl) {
                    notesEl.textContent = res.releaseNotes || 'Bug fixes and performance improvements.';
                }
                modal.classList.remove('hidden');
            } else if (manual) {
                showToast(`You are on the latest version (v${APP_CURRENT_VERSION})! ✨`, '✅');
            }
        } catch (e) {
            if (manual) {
                showToast('Could not check for updates. Check internet connection.', '⚠️');
            }
        }
    }

    // Automatic check 3 seconds after startup
    setTimeout(() => {
        checkUpdates(false);
    }, 3000);
}

// Initialize on DOM ready
let isInitialized = false;
function initializeApp() {
    if (isInitialized) return;
    isInitialized = true;
    setupNavigation();
    setupWhatsNewModal();
    setupAutoUpdateChecker();
    if (!window.queueManager) {
        window.queueManager = new QueueManager();
    }
}

document.addEventListener("DOMContentLoaded", initializeApp);

if (document.readyState === "complete" || document.readyState === "interactive") {
    initializeApp();
}

