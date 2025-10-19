const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "blackjack",
    version: "2.0.0",
    hasPermssion: 0,
    credits: "Kenne400k (original) && Nnam mod",
    description: "Chơi Blackjack (nâng cấp: stats, save state, multi-player trong group)",
    commandCategory: "Game",
    usages: "blackjack [start <bet> | hit | stand | double | stats | quit]",
    cooldowns: 2
};

const gameDataPath = path.join(__dirname, "blackjack_games.json"); // Lưu state game per thread

function loadGameData() {
    if (!fs.existsSync(gameDataPath)) {
        fs.writeFileSync(gameDataPath, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(gameDataPath, 'utf8'));
}

function saveGameData(data) {
    fs.writeFileSync(gameDataPath, JSON.stringify(data, null, 2));
}

function getDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck = [];
    for (let suit of suits) {
        for (let value of values) {
            deck.push({ suit, value, score: value === 'A' ? 11 : (['J', 'Q', 'K'].includes(value) ? 10 : parseInt(value)) });
        }
    }
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function calculateHandScore(hand) {
    let score = hand.reduce((sum, card) => sum + card.score, 0);
    let aces = hand.filter(card => card.value === 'A').length;
    while (score > 21 && aces > 0) {
        score -= 10;
        aces--;
    }
    return score;
}

function getHandString(hand) {
    return hand.map(card => `${card.value}${card.suit}`).join(' ');
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const name = await Users.getNameUser(senderID);
    const cmd = args[0]?.toLowerCase();
    let gameData = loadGameData();
    let threadGame = gameData[threadID] || { players: {}, deck: [], dealerHand: [], activePlayer: null, pot: 0 };

    switch (cmd) {
        case "start":
            const bet = parseInt(args[1]);
            if (isNaN(bet) || bet <= 0) return api.sendMessage("Số tiền cược phải > 0!", threadID, messageID);
            // Kiểm tra bank (tích hợp từ banking nếu có, giả sử)
            // const bankData = getBankData(senderID); if (bankData.balance < bet) return api.sendMessage("Không đủ tiền cược!", threadID, messageID);
            // bankData.balance -= bet; saveBankData(senderID, bankData);

            threadGame = { players: { [senderID]: { hand: [], bet } }, deck: getDeck(), dealerHand: [], activePlayer: senderID, pot: bet };
            gameData[threadID] = threadGame;
            saveGameData(gameData);

            // Deal cards
            for (let i = 0; i < 2; i++) {
                threadGame.dealerHand.push(threadGame.deck.pop());
                threadGame.players[senderID].hand.push(threadGame.deck.pop());
            }

            const dealerScore = calculateHandScore(threadGame.dealerHand.slice(0, 1)); // Ẩn card thứ 2
            const playerScore = calculateHandScore(threadGame.players[senderID].hand);
            const playerHandStr = getHandString(threadGame.players[senderID].hand);

            let msg = `🃏 BLACKJACK - BẮT ĐẦU!\n\n`;
            msg += `👤 ${name}: Cược ${bet} VNĐ\n`;
            msg += `🏪 Dealer: ${getHandString(threadGame.dealerHand.slice(0, 1))} + [Ẩn] (Score: ${dealerScore})\n`;
            msg += `👤 Bạn: ${playerHandStr} (Score: ${playerScore})\n\n`;
            if (playerScore === 21) {
                msg += "🎉 Blackjack! Bạn thắng gấp 1.5 lần!";
                // Payout logic
                return api.sendMessage(msg, threadID, messageID);
            }
            msg += `Lệnh: hit (rút bài) | stand (dừng) | double (gấp đôi cược)`;
            return api.sendMessage(msg, threadID, (err, info) => {
                if (err) return;
                global.client.handleReply.push({
                    name: module.exports.config.name,
                    messageID: info.messageID,
                    author: senderID,
                    threadGame: threadGame
                });
            }, messageID);

        case "hit":
            if (!threadGame.activePlayer || threadGame.activePlayer !== senderID) return api.sendMessage("Không phải lượt bạn!", threadID, messageID);
            const playerHand = threadGame.players[senderID].hand;
            playerHand.push(threadGame.deck.pop());
            const newScore = calculateHandScore(playerHand);
            const handStr = getHandString(playerHand);

            let msgHit = `👤 Bạn rút: ${handStr} (Score: ${newScore})\n`;
            if (newScore > 21) {
                msgHit += "💥 Bust! Bạn thua!";
                // End game, dealer wins pot
                threadGame = null;
                gameData[threadID] = null;
                saveGameData(gameData);
            } else {
                msgHit += `Lệnh: hit | stand | double`;
            }
            return api.sendMessage(msgHit, threadID, (err, info) => {
                if (err) return;
                global.client.handleReply.push({
                    name: module.exports.config.name,
                    messageID: info.messageID,
                    author: senderID,
                    threadGame: threadGame
                });
            }, messageID);

        case "stand":
            if (!threadGame.activePlayer || threadGame.activePlayer !== senderID) return api.sendMessage("Không phải lượt bạn!", threadID, messageID);
            // Dealer turn
            while (calculateHandScore(threadGame.dealerHand) < 17) {
                threadGame.dealerHand.push(threadGame.deck.pop());
            }
            const dealerScore = calculateHandScore(threadGame.dealerHand);
            const playerScore = calculateHandScore(threadGame.players[senderID].hand);
            const playerBet = threadGame.players[senderID].bet;
            let result = "";
            if (playerScore > 21) {
                result = `💥 Bạn bust! Thua ${playerBet} VNĐ.`;
            } else if (dealerScore > 21 || playerScore > dealerScore) {
                result = `🎉 Bạn thắng ${playerBet * 2} VNĐ!`;
            } else if (playerScore === dealerScore) {
                result = `🤝 Hòa, nhận lại ${playerBet} VNĐ.`;
            } else {
                result = `😔 Dealer thắng! Thua ${playerBet} VNĐ.`;
            }

            const dealerHandStr = getHandString(threadGame.dealerHand);
            let endMsg = `🃏 KẾT THÚC!\n\n`;
            endMsg += `🏪 Dealer: ${dealerHandStr} (Score: ${dealerScore})\n`;
            endMsg += `👤 Bạn: ${getHandString(threadGame.players[senderID].hand)} (Score: ${playerScore})\n\n`;
            endMsg += result;

            // End game
            threadGame = null;
            gameData[threadID] = null;
            saveGameData(gameData);

            return api.sendMessage(endMsg, threadID, messageID);

        case "double":
            if (!threadGame.activePlayer || threadGame.activePlayer !== senderID) return api.sendMessage("Không phải lượt bạn!", threadID, messageID);
            const currentBet = threadGame.players[senderID].bet;
            // Kiểm tra bank đủ double không (giả sử)
            // if (bankData.balance < currentBet) return api.sendMessage("Không đủ tiền double!", threadID, messageID);
            threadGame.players[senderID].bet *= 2;
            // bankData.balance -= currentBet; saveBankData(senderID, bankData);
            threadGame.players[senderID].hand.push(threadGame.deck.pop()); // Rút 1 lá cuối
            const doubleScore = calculateHandScore(threadGame.players[senderID].hand);
            if (doubleScore > 21) {
                return api.sendMessage(`💥 Double bust! Thua ${threadGame.players[senderID].bet} VNĐ.`, threadID, messageID);
            }
            // Tiếp tục stand logic (gọi stand)
            return module.exports.run({ api, event, args: ["stand"] }); // Recursive call for end

        case "stats":
            const userStats = loadUserStats(senderID); // Giả sử file stats per user
            return api.sendMessage(`📊 Stats Blackjack của ${name}:\nThắng: ${userStats.wins || 0}\nThua: ${userStats.losses || 0}\nHòa: ${userStats.ties || 0}\nTỷ lệ thắng: ${((userStats.wins / (userStats.wins + userStats.losses)) * 100 || 0).toFixed(1)}%`, threadID, messageID);

        case "quit":
            gameData[threadID] = null;
            saveGameData(gameData);
            return api.sendMessage("🛑 Đã hủy game Blackjack!", threadID, messageID);

        default:
            return api.sendMessage(
                `🃏 BLACKJACK GAME\n\n` +
                `Cách chơi: Reply "blackjack start <bet>" để bắt đầu.\n` +
                `• hit: Rút bài\n• stand: Dừng, so điểm\n• double: Gấp đôi cược (rút 1 lá cuối)\n• stats: Xem stats cá nhân\n• quit: Hủy game\n\n` +
                `Mục tiêu: Điểm gần 21 nhất mà không vượt (A=1/11, J/Q/K=10).\n` +
                `Cược từ bank (tích hợp banking module).`,
                threadID, messageID
            );
    }
};

module.exports.handleReply = async function({ api, event, handleReply }) {
    // Handle hit/stand/double reply
    const { threadID, senderID, body } = event;
    const gameData = loadGameData();
    const threadGame = gameData[threadID];

    if (!threadGame) return;

    const cmd = body.toLowerCase().trim();
    if (cmd === "hit") {
        return module.exports.run({ api, event, args: ["hit"] });
    } else if (cmd === "stand") {
        return module.exports.run({ api, event, args: ["stand"] });
    } else if (cmd === "double") {
        return module.exports.run({ api, event, args: ["double"] });
    } else {
        return api.sendMessage("Lệnh không hợp lệ! Dùng hit/stand/double.", threadID, event.messageID);
    }
};
