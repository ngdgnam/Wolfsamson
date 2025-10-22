const fs = require("fs-extra");
const path = require("path");
const axios = require("axios"); // Để upload nếu cần

module.exports.config = {
    name: "story",
    version: "1.0.0",
    hasPermssion: 0,
    credits: "Nnam mod (Messenger story video payload)",
    description: "Đăng story video với payload Messenger (simulate upload)",
    commandCategory: "Tiện ích",
    usages: "story <video URL hoặc reply video> [caption]",
    cooldowns: 10
};

module.exports.run = async function({ api, event, args, attachments }) {
    const { threadID, messageID, senderID } = event;
    const caption = args.join(" ");
    const videoAtt = attachments?.find(att => att.type === "video") || (event.messageReply?.attachments?.find(att => att.type === "video"));

    if (!videoAtt && !caption) {
        return api.sendMessage(
            `📹 [ STORY VIDEO - MESSENGER ]\n\n` +
            `Sử dụng: story <caption> (reply video để upload)\n` +
            `• Payload dựa internal FB story post.\n` +
            `• Simulate upload video story với metadata.\n\n` +
            `Ví dụ: Reply video với caption "Chào mọi người!"`,
            threadID, messageID
        );
    }

    const videoUrl = videoAtt ? videoAtt.url : null;
    if (!videoUrl) return api.sendMessage("Cần reply video để đăng story!", threadID, messageID);

    const idempotenceToken = `token-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const clientMutationId = `mut-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const actorId = senderID; // User ID
    const otid = `otid-${Date.now()}`; // Offline threading ID
    const videoId = `vid-${Date.now()}`; // Simulate video ID

    const payload = {
        "dataclass_params": JSON.stringify({
            "logging_metadata": {
                "content_model": null,
                "feature_tags": ["IS_NOT_DIALTONE"]
            },
            "send_instance_metadata": null
        }),
        "mark_thread_read": 0,
        "metadata_dataclass": JSON.stringify({
            "power_up": {
                "power_up_style": "STORY" // Simulate story style, adjust if needed
            }
        }),
        "navigation_chain": ",e2ee_keyboard_popup,tap_composer_list_item," + Date.now() + ",,,,,," + Date.now() + ";MainActivity,thread_open:group,," + Date.now() + ",149807161,,,,," + Date.now() + ";ThreadSettingsActivity,messenger_thread_settings,," + Date.now() + ",52602222,,,,," + Date.now() + ";ThreadSettingsActivity,messenger_thread_settings,from_other_app," + Date.now() + ",116247134,,,," + Date.now(),
        "otid": otid,
        "power_up_style": 0, // Default for story
        "send_type": 1,
        "source": 65537,
        "sync_group": 1,
        "text": caption || "",
        "thread_id": threadID
    };

    const fullPayload = {
        "data_trace_id": `#trace-${Date.now()}`,
        "epoch_id": Date.now(),
        "tasks": [{
            "context": {
                "trace_id": Math.floor(Math.random() * 1000000),
                "trace_type": 0
            },
            "data_trace_id": `#trace-${Date.now()}`,
            "failure_count": "0",
            "label": "46",
            "payload": JSON.stringify({
                ...payload,
                "attachments": [{
                    "video": {
                        "overlays": [],
                        "offline_threading_id": otid,
                        "id": videoId
                    }
                }],
                "is_background": false,
                "variables": JSON.stringify({
                    "input": {
                        "source": "MESSENGER",
                        "idempotence_token": idempotenceToken,
                        "composer_entry_point": "inbox_active_now_tray",
                        "client_mutation_id": clientMutationId,
                        "actor_id": actorId,
                        "audiences_is_complete": true,
                        "audiences": [{
                            "stories": {
                                "self": {
                                    "target_id": actorId
                                }
                            }
                        }],
                        "logging": {
                            "composer_session_id": idempotenceToken
                        },
                        "attachments": [{
                            "video": {
                                "overlays": [],
                                "offline_threading_id": otid,
                                "id": videoId
                            }
                        }]
                    },
                    "scale": "2"
                })
            }),
            "queue_name": threadID,
            "task_id": Date.now(),
            "task_stats": {
                "queue_latency": 0
            }
        }],
        "version_id": Date.now()
    };

    try {
        // Simulate send story (FB API không public, dùng sendMessage với metadata)
        const metadata = {
            "power_up": {
                "power_up_style": "STORY" // Custom for story
            },
            "attachments": [{
                "video": {
                    "id": videoId,
                    "url": videoUrl
                }
            }]
        };

        await api.sendMessage({
            body: caption || "Story video",
            metadata: metadata,
            attachment: fs.createReadStream(videoAtt.path) || [] // Nếu reply video
        }, threadID);

        return api.sendMessage(`✅ Đã đăng story video "${caption}" với payload simulate! (ID: ${videoId})\n🔗 Video URL: ${videoUrl}`, threadID);
    } catch (error) {
        console.error("[STORY] Lỗi:", error);
        return api.sendMessage(`❌ Lỗi đăng story: ${error.message}. Kiểm tra video URL/metadata.`, threadID, messageID);
    }
};
