document.getElementById("play").addEventListener("click", async () => {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            // Try to find the first video element in the page
            let video = document.querySelector("video");
            if (!video || !video.src){
                video = document.querySelector("source");
            }
            console.log(video)
            return video ? video.src : null;
        }
    }, async (results) => {
        const videoUrl = results[0].result;

        if (!videoUrl) {
            alert("No video found on this page!");
            return;
        }

        // VLC web interface URL
        const vlcPassword = "1234"; // set this to your VLC password
        const url = `http://localhost:8080/requests/status.xml?command=in_play&input=${encodeURIComponent(videoUrl)}`;
        console.log(url)

        await fetch(url, {
            headers: {
                "Authorization": "Basic " + btoa(`:${vlcPassword}`)
            }
        });

        alert("Sent to VLC!");
    });
});
