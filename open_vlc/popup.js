const statusEl = document.getElementById("status");
const playBtn  = document.getElementById("play");

async function init() {
    // Guard: get current tab
    let tabs;
    try {
        tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch (e) {
        statusEl.textContent = "Cannot access tab.";
        statusEl.className = "none";
        playBtn.disabled = true;
        return;
    }

    const tab = tabs[0];

    // Guard: disallow special pages
    if (!tab?.id || /^(chrome|chrome-extension|about|edge):/.test(tab.url || "")) {
        statusEl.textContent = "Not available on this page.";
        statusEl.className = "none";
        playBtn.disabled = true;
        return;
    }

    // Ask background for intercepted stream URL
    chrome.runtime.sendMessage({ type: "GET_STREAM_URL", tabId: tab.id }, (response) => {
        const url = response?.url || null;

        if (url) {
            // Show a short preview of the URL
            const preview = url.length > 60 ? url.slice(0, 57) + "…" : url;
            statusEl.textContent = "✓ Stream found: " + preview;
            statusEl.className = "found";
        } else {
            statusEl.textContent = "No stream detected yet. Play the video first.";
            statusEl.className = "none";
        }

        playBtn.onclick = () => handlePlay(tab, url);
    });
}

async function handlePlay(tab, cachedUrl) {
    playBtn.disabled = true;
    playBtn.textContent = "Sending…";

    let videoUrl = cachedUrl;

    // If no intercepted URL, fall back to DOM scan
    if (!videoUrl) {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const v = document.querySelector("video");
                    if (!v) return null;
                    if (v.currentSrc && !v.currentSrc.startsWith("blob:")) return v.currentSrc;
                    const s = v.querySelector("source[src]");
                    return s?.src || null;
                }
            });
            videoUrl = results?.[0]?.result || null;
        } catch (e) {
            // scripting blocked on this page
        }
    }

    if (!videoUrl) {
        statusEl.textContent = "No playable URL found. Play the video then retry.";
        statusEl.className = "none";
        playBtn.disabled = false;
        playBtn.textContent = "▶ Play in VLC";
        return;
    }

    // Delegate the actual fetch to background (avoids CORS issues from popup)
    chrome.runtime.sendMessage({ type: "SEND_TO_VLC", url: videoUrl, tabId: tab.id }, (res) => {
        if (res?.ok) {
            statusEl.textContent = "✓ Sent to VLC!";
            statusEl.className = "found";
            playBtn.textContent = "▶ Play in VLC";
            playBtn.disabled = false;
        } else {
            statusEl.textContent = res?.error || "Failed — check VLC is running.";
            statusEl.className = "none";
            playBtn.textContent = "▶ Play in VLC";
            playBtn.disabled = false;
        }
    });
}

init();
