// Stores the last detected stream URL per tab
const streamUrls = {};

// ── 1. Intercept network requests for HLS/DASH manifests ─────────────────────
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        const url = details.url;

        // Match HLS manifests, DASH manifests, or direct video files
        // Exclude segment chunks (.ts, .m4s) — we only want the manifest/playlist
        const isManifest = url.includes(".m3u8") || url.includes(".mpd");
        const isDirectVideo = /\.(mp4|webm|ogg|mkv|avi|mov)(\?|#|$)/i.test(url);
        const isChunk = /\.(ts|m4s|aac|mp3|vtt|srt)(\?|#|$)/i.test(url);

        if ((isManifest || isDirectVideo) && !isChunk) {
            streamUrls[details.tabId] = url;

            // Show badge so user knows a stream was detected
            chrome.action.setBadgeText({ text: "▶", tabId: details.tabId });
            chrome.action.setBadgeBackgroundColor({ color: "#ff8800", tabId: details.tabId });
        }
    },
    { urls: ["<all_urls>"] }
);

// ── 2. Clear state on tab navigation or close ─────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading") {
        delete streamUrls[tabId];
        chrome.action.setBadgeText({ text: "", tabId }).catch(() => {});
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    delete streamUrls[tabId];
});

// ── 3. Context menu: right-click → "Play in VLC" ─────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "play-in-vlc",
        title: "Play in VLC",
        contexts: ["link", "video", "page"]
    });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // Priority: right-clicked link > right-clicked video src > intercepted stream > DOM scan
    let videoUrl =
        info.linkUrl ||
        info.srcUrl ||
        streamUrls[tab.id] ||
        null;

    // Last resort: scan the DOM for a non-blob video src
    if (!videoUrl) {
        try {
            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const v = document.querySelector("video");
                    if (!v) return null;
                    if (v.currentSrc && !v.currentSrc.startsWith("blob:")) return v.currentSrc;
                    const s = v.querySelector("source[src]");
                    return s?.src || null;
                }
            });
            videoUrl = result?.[0]?.result || null;
        } catch (e) {
            console.error("DOM scan failed:", e);
        }
    }

    if (!videoUrl) {
        // Can't use alert() in background — use notification instead
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon128.png",
            title: "Play in VLC",
            message: "No video URL found. Try playing the video first, then right-click."
        });
        return;
    }

    await sendToVLC(videoUrl, tab.id);
});

// ── 4. Message from popup ─────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "GET_STREAM_URL") {
        sendResponse({ url: streamUrls[msg.tabId] || null });
    }
    if (msg.type === "SEND_TO_VLC") {
        sendToVLC(msg.url, msg.tabId).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
        return true; // async response
    }
});

// ── 5. Shared VLC sender ──────────────────────────────────────────────────────
async function sendToVLC(videoUrl, tabId) {
    const password = "1234"; // ← your VLC web interface password
    const vlcUrl = `http://localhost:8080/requests/status.xml?command=in_play&input=${encodeURIComponent(videoUrl)}`;

    try {
        const res = await fetch(vlcUrl, {
            headers: { "Authorization": "Basic " + btoa(`:${password}`) }
        });

        if (!res.ok) {
            const msg = res.status === 401
                ? "Wrong VLC password. Edit background.js and change the password variable."
                : `VLC returned HTTP ${res.status}`;
            chrome.notifications.create({
                type: "basic", iconUrl: "icon128.png", title: "Play in VLC — Error", message: msg
            });
            return;
        }

        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon128.png",
            title: "Play in VLC",
            message: "Sent to VLC! ▶"
        });

        // Clear badge after sending
        if (tabId) chrome.action.setBadgeText({ text: "", tabId }).catch(() => {});

    } catch (e) {
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon128.png",
            title: "Play in VLC — Error",
            message: "Could not reach VLC. Make sure VLC is open and Web Interface is enabled (View → Add Interface → Web)."
        });
    }
}
