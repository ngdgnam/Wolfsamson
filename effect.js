const fs = require("fs-extra");
const crypto = require("crypto");
const moment = require("moment-timezone");

module.exports.config = {
    name: "effect",
    version: "1.1.0",
    hasPermssion: 0,
    credits: "Nnam mod (Full Messenger power_up payloads)",
    description: "Gửi tin nhắn với hiệu ứng Messenger từ payload JSON (Lửa, Trái tim, Quà, Lấp lánh)",
    commandCategory: "Tiện ích",
    usages: "effect [fire|heart|gift|sparkle] <text>",
    cooldowns: 5
};

const effects = {
    fire: {
        power_up_style: "FIRE",
        payloadTemplate: {
            "dataclass_params": "{\"logging_metadata\":{\"content_model\":null,\"feature_tags\":[\"IS_NOT_DIALTONE\"]}}",
            "mark_thread_read": 0,
            "metadata_dataclass": "{\"power_up\":{\"power_up_style\":\"FIRE\"}}",
            "power_up_style": 4
        }
    },
    heart: {
        power_up_style: "LOVE",
        payloadTemplate: {
            "dataclass_params": "{\"logging_metadata\":{\"content_model\":null,\"feature_tags\":[\"IS_NOT_DIALTONE\"]}}",
            "mark_thread_read": 0,
            "metadata_dataclass": "{\"power_up\":{\"power_up_style\":\"LOVE\"}}",
            "power_up_style": 1
        }
    },
    gift: {
        power_up_style: "GIFTWRAP",
        payloadTemplate: {
            "dataclass_params": "{\"logging_metadata\":{\"content_model\":null,\"feature_tags\":[\"IS_NOT_DIALTONE\"]}}",
            "mark_thread_read": 0,
            "metadata_dataclass": "{\"power_up\":{\"power_up_style\":\"GIFTWRAP\"}}",
            "power_up_style": 2
        }
    },
    sparkle: {
        power_up_style: "CELEBRATION",
        payloadTemplate: {
            "dataclass_params": "{\"logging_metadata\":{\"content_model\":null,\"feature_tags\":[\"IS_NOT_DIALTONE\"]}}",
            "mark_thread_read": 0,
            "metadata_dataclass": "{\"power_up\":{\"power_up_style\":\"CELEBRATION\"}}",
            "power_up_style": 3
        }
    }
};

function generatePayload(effectType, text, threadID, timestamp) {
    const template = effects[effectType].payloadTemplate;
    const otid = crypto.randomBytes(8).toString('hex');
    const dataTraceId = `#trace-${Date.now()}`;
    const epochId = Date.now();
    const taskId = Date.now();
    const versionId = Date.now();
    const navigationChain = `,e2ee_keyboard_popup,tap_composer_list_item,${timestamp},,,,,,${timestamp};MainActivity,thread_open:group,${timestamp},149807161,,,,,${timestamp};ThreadSettingsActivity,messenger_thread_settings,${timestamp},52602222,,,,,${timestamp};ThreadSettingsActivity,messenger_thread_settings,from_other_app,${timestamp},116247134,,,,${timestamp}`;

    const fullPayload = {
        "data_trace_id": dataTraceId,
        "epoch_id": epochId,
        "tasks": [{
            "context": {
                "trace_id": Math.floor(Math.random() * 1000000000),
                "trace_type": 0
            },
            "data_trace_id": dataTraceId,
            "failure_count": "5",
            "label": "46",
            "payload": JSON.stringify({
                "dataclass_params": template.dataclass_params,
                "mark_thread_read": template.mark_thread_read,
                "metadata_dataclass": template.metadata_dataclass,
                "navigation_chain": navigationChain,
                "otid": otid,
                "power_up_style": template.power_up_style,
                "send_type": 1,
                "source": 65537,
                "sync_group": 1,
                "text": text,
                "thread_id": threadID
            }),
            "queue_name": threadID,
            "task_id": taskId,
            "task_stats": {
                "queue_latency": Math.floor(Math.random() * 60000)
            }
        }],
        "version_id": versionId
    };

    return fullPayload;
}

module.exports.run = async function({ api, event, args }) {
    const { threadID, messageID } = event;
    const effectType = args[0]?.toLowerCase();
    const text = args.slice(1).join(" ");
    const timestamp = Date.now();

    if (!effectType || !effects[effectType] || !text) {
        let helpMsg = `✨ [ HIỆU ỨNG TIN NHẮN MESSENGER ]\n\n`;
        helpMsg += `Sử dụng: effect [fire|heart|gift|sparkle] <text>\n\n`;
        Object.entries(effects).forEach(([key, val]) => {
            helpMsg += `• ${key}: ${val.power_up_style} ${val.name}\n`;
        });
        helpMsg += `\nVí dụ: effect fire Chúc mừng!\n\nFull payload generated internally.`;
        return api.sendMessage(helpMsg, threadID, messageID);
    }

    const fullPayload = generatePayload(effectType, text, threadID, timestamp);
    const { power_up_style, name } = effects[effectType];

    try {
        // Send with simplified metadata (api.sendMessage support)
        const metadata = {
            power_up: {
                power_up_style: power_up_style
            }
        };

        await api.sendMessage({
            body: text,
            metadata: metadata
        }, threadID);

        // Log full payload for debug
        console.log(`[EFFECT] Full payload for ${effectType}:`, JSON.stringify(fullPayload, null, 2));

        return api.sendMessage(`✅ Đã gửi "${text}" với hiệu ứng ${name}!\n📊 Payload ID: ${fullPayload.data_trace_id}`, threadID);
    } catch (error) {
        console.error("[EFFECT] Lỗi gửi full payload:", error);
        // Fallback: Send plain text
        await api.sendMessage(text, threadID);
        return api.sendMessage(`⚠️ Payload fail: ${error.message}. Fallback sent. Full payload logged.`, threadID);
    }
};
