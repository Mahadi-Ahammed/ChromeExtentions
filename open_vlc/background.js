// Create the context menu
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "play-in-vlc",
        title: "Play in VLC",
        contexts: ["link", "video", "page"]
    });
});

// Handle clicks on the menu
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    let videoUrl = "";

    // If user right-clicked a link
    if (info.linkUrl) {
        videoUrl = info.linkUrl;
    }

    // If user right-clicked directly on a <video>
    else if (info.srcUrl) {
        videoUrl = info.srcUrl;
    }

    // If nothing provided, try finding a <video> on the page
    else {
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const v = document.querySelector("video");
                return v ? v.src : null;
            }
        });

        videoUrl = result[0].result;
    }

    if (!videoUrl) {
        alert("No video URL found.");
        return;
    }

    // Send to VLC
    const password = "1234"; // your VLC Lua HTTP password
    const url = `http://localhost:8080/requests/status.xml?command=in_play&input=${encodeURIComponent(videoUrl)}`;

    try {
        await fetch(url, {
            headers: {
                "Authorization": "Basic " + btoa(`:${password}`)
            }
        });

        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "Play in VLC",
            message: "Video sent to VLC!"
        });

    } catch (e) {
        console.error(e);
        alert("Failed to send to VLC.");
    }
});
