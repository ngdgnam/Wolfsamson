const fs = require("fs-extra");
const path = require("path");
const moment = require("moment-timezone");

module.exports.config = {
	name: "giveaway",
	version: "1.1.0",
	hasPermssion: 0,
	credits: "Mirai Team && Nnam mod",
	description: "Give away dành cho nhóm chat (nâng cấp: auto-roll, hình ảnh reward, tích hợp bank)",
	commandCategory: "Admin",
	usages: "[create <reward> <time phút> <số winner> [reward image URL] | details/join/roll/end <ID>]",
	cooldowns: 5
};

const giveawayDataPath = path.join(__dirname, "giveaway_data.json");
const logPath = path.join(__dirname, "giveaway_logs.json");

if (!fs.existsSync(giveawayDataPath)) fs.writeFileSync(giveawayDataPath, JSON.stringify({}, null, 2));
if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, JSON.stringify({}, null, 2));

function loadGiveawayData() {
    return JSON.parse(fs.readFileSync(giveawayDataPath, 'utf8'));
}

function saveGiveawayData(data) {
    fs.writeFileSync(giveawayDataPath, JSON.stringify(data, null, 2));
}

function addLog(threadID, giveawayID, action, details = "") {
    const logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    logs[threadID] = logs[threadID] || [];
    logs[threadID].unshift({ giveawayID, action, details, time: moment().tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY HH:mm:ss') });
    logs[threadID] = logs[threadID].slice(0, 50);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
}

// Giả sử hàm từ banking module (thay bằng code thực tế)
function transferBank(fromID, toID, amount) {
    // Code chuyển tiền từ bank
    console.log(`Chuyển ${amount} từ ${fromID} sang ${toID}`);
    return true; // Success
}

module.exports.handleReaction = async ({ api, event, Users, handleReaction }) => {
	let data = global.data.GiveAway.get(handleReaction.ID);
	if (!data || data.status === "close" || data.status === "ended") return;
	if (data.joined.includes(event.userID)) return; // Đã join

	if (event.reaction == undefined) {
		const index = data.joined.indexOf(event.userID);
		if (index > -1) data.joined.splice(index, 1);
		global.data.GiveAway.set(handleReaction.ID, data);
		const threadInfo = await api.getThreadInfo(event.threadID);
		const name = threadInfo.nicknames[event.userID] || (await Users.getInfo(event.userID))[event.userID].name;
		addLog(event.threadID, handleReaction.ID, "leave", `${name} rời giveaway`);
		return api.sendMessage(`${name} đã rời giveaway #${handleReaction.ID}`, event.userID);
	}

	data.joined.push(event.userID);
	global.data.GiveAway.set(handleReaction.ID, data);
	const threadInfo = await api.getThreadInfo(event.threadID);
	const name = threadInfo.nicknames[event.userID] || (await Users.getInfo(event.userID))[event.userID].name;
	addLog(event.threadID, handleReaction.ID, "join", `${name} tham gia giveaway`);
	return api.sendMessage(`${name} đã tham gia thành công giveaway #${handleReaction.ID}`, event.userID);
}

module.exports.run = async ({ api, event, args, Users, Threads }) => {
	if (!global.data.GiveAway) global.data.GiveAway = new Map();
	const { threadID, messageID, senderID } = event;
	const cmd = args[0]?.toLowerCase();
	const reward = args[1];
	const timeLimit = parseInt(args[2]) || 60;
	const numWinners = parseInt(args[3]) || 1;
	const rewardImg = args[4]; // URL ảnh reward
	const threadInfo = await Threads.getInfo(threadID);
	const creatorName = threadInfo.nicknames[senderID] || (await Users.getInfo(senderID))[senderID].name;

	if (cmd == "create") {
		if (!reward) return api.sendMessage("Cú pháp: giveaway create <reward> <time phút> <số winner> [reward image URL]", threadID, messageID);
		if (timeLimit < 1 || timeLimit > 1440) return api.sendMessage("Time limit 1-1440 phút!", threadID, messageID);
		if (numWinners < 1 || numWinners > 10) return api.sendMessage("Số winner 1-10!", threadID, messageID);

		let randomNumber = (Math.floor(Math.random() * 100000) + 100000).toString().substring(1);
		const endTime = moment().tz('Asia/Ho_Chi_Minh').add(timeLimit, 'minutes').valueOf();
		const dataGA = {
			"ID": randomNumber,
			"author": creatorName,
			"authorID": senderID,
			"messageID": null,
			"reward": reward,
			"rewardImg": rewardImg || null,
			"joined": [],
			"status": "open",
			"timeLimit": timeLimit,
			"endTime": endTime,
			"numWinners": numWinners
		};
		global.data.GiveAway.set(randomNumber, dataGA);

		let createMsg = "====== Give Away ======\n";
		createMsg += `👤 Tạo bởi: ${creatorName}\n`;
		createMsg += `🎁 Phần thưởng: ${reward}\n`;
		createMsg += `🆔 ID: #${randomNumber}\n`;
		createMsg += `⏰ Thời hạn: ${timeLimit} phút\n`;
		createMsg += `🏆 Số winner: ${numWinners}\n\nREACT để tham gia!`;

		api.sendMessage(createMsg, threadID, (err, info) => {
			if (err) return;
			dataGA.messageID = info.messageID;
			global.data.GiveAway.set(randomNumber, dataGA);
			addLog(threadID, randomNumber, "create", `Tạo bởi ${creatorName}, reward: ${reward}`);
			client.handleReaction.push({
				name: this.config.name,
				messageID: info.messageID,
				author: senderID,
				ID: randomNumber
			});

			// Auto end & roll if time expires
			setTimeout(async () => {
				const timedData = global.data.GiveAway.get(randomNumber);
				if (timedData && timedData.status === "open") {
					timedData.status = "close";
					global.data.GiveAway.set(randomNumber, timedData);
					api.sendMessage(`⏰ Giveaway #${randomNumber} hết hạn! Auto roll...`, threadID);

					// Auto roll
					if (timedData.joined.length >= timedData.numWinners) {
						const winners = [];
						const shuffled = [...timedData.joined].sort(() => 0.5 - Math.random());
						for (let i = 0; i < timedData.numWinners; i++) {
							winners.push(shuffled[i]);
						}

						let autoRollMsg = `🎉 AUTO WINNER #${randomNumber}!\n\n`;
						autoRollMsg += `👤 Creator: ${timedData.author}\n🎁 Reward: ${timedData.reward}\n\n`;
						winners.forEach((winnerID, i) => {
							const winnerName = await Users.getNameUser(winnerID);
							autoRollMsg += `${i+1}. ${winnerName} (${winnerID})\n`;
							// Tích hợp bank: chuyển reward tiền nếu là số
							if (!isNaN(timedData.reward)) {
								transferBank(timedData.authorID, winnerID, parseInt(timedData.reward));
							}
						});
						autoRollMsg += `\n📊 Tham gia: ${timedData.joined.length} người. Chúc mừng!`;

						const mentions = winners.map((id, i) => ({ tag: `@${i+1}`, id }));
						api.sendMessage({
							body: autoRollMsg,
							mentions,
							attachment: timedData.rewardImg ? [fs.createReadStream(timedData.rewardImg)] : undefined
						}, threadID);
						addLog(threadID, randomNumber, "auto_roll", `Winners: ${winners.join(', ')}`);
					} else {
						api.sendMessage(`❌ Không đủ tham gia để auto roll #${randomNumber}!`, threadID);
					}

					timedData.status = "ended";
					global.data.GiveAway.set(randomNumber, timedData);
				}
			}, timeLimit * 60000);
		});
	}
	else if (cmd == "details") {
		let ID = args[1]?.replace("#", "") || "";
		if (!ID) return api.sendMessage("Cú pháp: giveaway details <ID>", threadID, messageID);
		let data = global.data.GiveAway.get(ID);
		if (!data) return api.sendMessage(`❌ Giveaway #${ID} không tồn tại!`, threadID, messageID);
		const remainingTime = data.endTime - Date.now();
		const timeLeft = remainingTime > 0 ? moment.duration(remainingTime).humanize() : "Đã hết hạn";
		return api.sendMessage(
			"====== Give Away Details ======" +
			`\n👤 Tạo bởi: ${data.author} (${data.authorID})` +
			`\n🎁 Phần thưởng: ${data.reward}` +
			`${data.rewardImg ? `\n🖼️ Hình ảnh: ${data.rewardImg}` : ""}` +
			`\n🆔 ID: #${ID}` +
			`\n📊 Tham gia: ${data.joined.length} người` +
			`\n⏰ Thời hạn còn: ${timeLeft}` +
			`\n🏆 Số winner: ${data.numWinners}` +
			`\n📊 Trạng thái: ${data.status.toUpperCase()}`,
			threadID, messageID
		);
	}
	else if (cmd == "join") {
		let ID = args[1]?.replace("#", "") || "";
		if (!ID) return api.sendMessage("Cú pháp: giveaway join <ID>", threadID, messageID);
		let data = global.data.GiveAway.get(ID);
		if (!data) return api.sendMessage(`❌ Giveaway #${ID} không tồn tại!`, threadID, messageID);
		if (data.status !== "open") return api.sendMessage(`❌ Giveaway #${ID} đã đóng!`, threadID, messageID);
		if (data.joined.includes(senderID)) return api.sendMessage(`✅ Bạn đã tham gia #${ID}!`, senderID);
		data.joined.push(senderID);
		global.data.GiveAway.set(ID, data);
		const creatorName = threadInfo.nicknames[senderID] || (await Users.getInfo(senderID))[senderID].name;
		addLog(threadID, ID, "join", `${creatorName} tham gia`);
		return api.sendMessage(`✅ ${creatorName} đã tham gia giveaway #${ID} thành công!`, senderID);
	}
	else if (cmd == "roll") {
		let ID = args[1]?.replace("#", "") || "";
		if (!ID) return api.sendMessage("Cú pháp: giveaway roll <ID>", threadID, messageID);
		let data = global.data.GiveAway.get(ID);
		if (!data) return api.sendMessage(`❌ Giveaway #${ID} không tồn tại!`, threadID, messageID);
		if (data.status !== "close") return api.sendMessage(`❌ Giveaway #${ID} chưa đóng! Dùng end trước.`, threadID, messageID);
		if (data.authorID !== senderID) return api.sendMessage("❌ Chỉ creator mới roll!", threadID, messageID);
		if (data.joined.length < data.numWinners) return api.sendMessage(`❌ Không đủ tham gia để roll ${data.numWinners} winner!`, threadID, messageID);

		const winners = [];
		const shuffled = [...data.joined].sort(() => 0.5 - Math.random());
		for (let i = 0; i < data.numWinners; i++) {
			winners.push(shuffled[i]);
		}

		let winnerMsg = `🎉 WINNER GIVEAWAY #${ID}!\n\n`;
		winnerMsg += `👤 Creator: ${data.author}\n🎁 Reward: ${data.reward}\n\n`;
		winners.forEach((winnerID, i) => {
			const winnerName = threadInfo.nicknames[winnerID] || (await Users.getInfo(winnerID))[winnerID].name;
			winnerMsg += `${i+1}. ${winnerName} (${winnerID})\n`;
			// Tích hợp bank nếu reward là số
			if (!isNaN(data.reward)) {
				transferBank(data.authorID, winnerID, parseInt(data.reward) / data.numWinners);
			}
		});
		winnerMsg += `\n📊 Tham gia: ${data.joined.length} người. Chúc mừng!`;

		data.status = "ended";
		global.data.GiveAway.set(ID, data);
		addLog(threadID, ID, "roll", `Winners: ${winners.map(w => w.toString()).join(', ')}`);

		const mentions = winners.map((id, i) => ({ tag: `@${i+1}`, id }));
		const attachment = data.rewardImg ? [await downloadImage(data.rewardImg)] : undefined;
		return api.sendMessage({
			body: winnerMsg,
			mentions,
			attachment
		}, threadID, messageID);
	}
	else if (cmd
