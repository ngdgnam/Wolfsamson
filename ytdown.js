const ytdl = require("ytdl-core");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "ytdown",
    version: "1.1.0",
    hasPermssion: 0,
    credits: "Nnam mod",
    description: "Tải video/audio từ YouTube (hỗ trợ playlist, limit 5 videos)",
    commandCategory: "Media",
    usages: "ytdown <link YT/playlist> [video/audio] [limit <số>]",
    cooldowns: 5,
    dependencies: {
        "ytdl-core": "",
        "fs-extra": ""
    }
};

module.exports.run = async function({ api, event, args }) {
    const { threadID, messageID } = event;
    const link = args[0];
    const type = args[1]?.toLowerCase() || "video"; // Default video
    const limit = parseInt(args[2]) || 5; // Limit for playlist, max 5

    if (!link) {
        return api.sendMessage("Cú pháp: ytdown <link YT/playlist> [video/audio] [limit <số>]\nVí dụ: ytdown https://youtube.com/playlist?list=... audio 3", threadID, messageID);
    }

    if (!ytdl.validateURL(link)) {
        return api.sendMessage("Link YouTube không hợp lệ! (Dùng watch?v=, playlist?list=, hoặc youtu.be)", threadID, messageID);
    }

    try {
        const info = await ytdl.getInfo(link);
        let isPlaylist = info.videoDetails.media && info.videoDetails.media.playlist; // Check if playlist

        if (isPlaylist) {
            const playlist = info.videoDetails.media.playlist;
            const playlistTitle = playlist.title;
            const videos = playlist.videos.slice(0, limit); // Limit videos

            let downloadMsg = `📂 Playlist: ${playlistTitle} (${videos.length}/${playlist.videos.length} videos)\n⏳ Đang tải...`;

            api.sendMessage(downloadMsg, threadID, messageID);

            let attachments = [];
            for (let i = 0; i < videos.length; i++) {
                const video = videos[i];
                const videoId = video.id;
                const cachePath = path.join(__dirname, "cache", `yt-playlist-${videoId}.mp4`);

                const quality = type === "audio" ? { filter: "audioonly", quality: "highestaudio" } : { quality: "highestvideo[height<=720]" };
                const stream = ytdl(`https://www.youtube.com/watch?v=${videoId}`, quality);

                await new Promise((resolve, reject) => {
                    stream.pipe(fs.createWriteStream(cachePath))
                        .on('finish', () => {
                            const fileSize = fs.statSync(cachePath).size;
                            if (fileSize > 25 * 1024 * 1024) {
                                fs.unlinkSync(cachePath);
                                resolve();
                            } else {
                                attachments.push(fs.createReadStream(cachePath));
                                resolve();
                            }
                })
                .on('error', reject);
                });

                // Cleanup after attach
                attachments.forEach(stream => {
                    if (stream.path) fs.unlinkSync(stream.path);
                });
            }

            return api.sendMessage({
                body: `✅ Tải playlist thành công! (${videos.length} videos)\n${type.toUpperCase()}: ${playlistTitle}`,
                attachment: attachments
            }, threadID);
        } else {
            // Single video (as before)
            const title = info.videoDetails.title;
            const duration = info.videoDetails.lengthSeconds;
            const cachePath = path.join(__dirname, "cache", `yt-${Date.now()}.mp4`);

            let quality = type === "audio" ? { filter: "audioonly", quality: "highestaudio" } : { quality: "highestvideo[height<=720]" };
            const stream = ytdl(link, quality);

            stream.pipe(fs.createWriteStream(cachePath));

            stream.on('end', async () => {
                const fileSize = fs.statSync(cachePath).size;
                if (fileSize > 25 * 1024 * 1024) {
                    fs.unlinkSync(cachePath);
                    return api.sendMessage(`❌ File > 25MB. Thử audio: ytdown ${link} audio`, threadID, messageID);
                }

                const mediaType = type === "audio" ? "🎵 Audio" : "🎥 Video";
                const ext = type === "audio" ? "mp3" : "mp4";

                api.sendMessage({
                    body: `${mediaType}: ${title}\n⏱ ${Math.floor(duration / 60)}:${duration % 60}\n🔗 ${link}`,
                    attachment: fs.createReadStream(cachePath)
                }, threadID, () => fs.unlinkSync(cachePath), messageID);
            });
        }
    } catch (error) {
        console.error("[YTDOWN] Lỗi:", error);
        api.sendMessage(`❌ Lỗi tải YT: ${error.message}`, threadID, messageID);
    }
};
