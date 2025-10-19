const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    name: "tictactoe",
    version: "2.0.0",
    hasPermssion: 0,
    credits: "Kenne400k && Nnam mod",
    description: "Chơi Cờ Caro/Tic Tac Toe (nâng cấp: multi-player group, stats, cược tiền)",
    commandCategory: "Game",
    usages: "tictactoe [start <đối thủ ID> <cược>] | move <vị trí 1-9> | stats | quit",
    cooldowns: 2
};

const gamePath = path.join(__dirname, "tictactoe_games.json");
const statsPath = path.join(__dirname, "tictactoe_stats.json");

function loadGame(threadID) {
    if (!fs.existsSync(gamePath)) fs.writeFileSync(gamePath, JSON.stringify({}, null, 2));
    const games = JSON.parse(fs.readFileSync(gamePath, 'utf8'));
    return games[threadID] || null;
}

function saveGame(threadID, game) {
    const games = JSON.parse(fs.readFileSync(gamePath, 'utf8'));
    games[threadID] = game;
    fs.writeFileSync(gamePath, JSON.stringify(games, null, 2));
}

function loadStats(userID) {
    if (!fs.existsSync(statsPath)) fs.writeFileSync(statsPath, JSON.stringify({}, null, 2));
    const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    return stats[userID] || { wins: 0, losses: 0, ties: 0, games: 0 };
}

function saveStats(userID, stats) {
    const allStats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    allStats[userID] = stats;
    fs.writeFileSync(statsPath, JSON.stringify(allStats, null, 2));
}

function getBoard(game) {
    const board = game.board.map(row => row.map(cell => cell === 1 ? '❌' : cell === -1 ? '⭕' : '⬜').join(' | ')).join('\n');
    return `📊 Bàn cờ:\n${board}\n\nVị trí (1-9):\n1|2|3\n4|5|6\n7|8|9`;
}

function checkWinner(board) {
    const lines = [
        [0,1,2], [3,4,5], [6,7,8], // Rows
        [0,3,6], [1,4,7], [2,5,8], // Columns
        [0,4,8], [2,4,6] // Diagonals
    ];
    for (let line of lines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    if (!board.includes(0)) return 0; // Tie
    return null; // Ongoing
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const name = await Users.getNameUser(senderID);
    const cmd = args[0]?.toLowerCase();
    const game = loadGame(threadID);

    switch (cmd) {
        case "start":
            const opponentID = args[1];
            const bet = parseInt(args[2]) || 0;
            if (!opponentID) return api.sendMessage("Cú pháp: tictactoe start <ID đối thủ> <cược (tùy chọn)>", threadID, messageID);
            if (bet > 0 && getBankBalance(senderID) < bet) return api.sendMessage("Không đủ tiền cược!", threadID, messageID); // Từ banking

            const opponentName = await Users.getNameUser(opponentID);
            const newGame = {
                board: Array(9).fill(0),
                players: { [senderID]: 1, [opponentID]: -1 }, // X=1, O=-1
                currentPlayer: senderID,
                bet,
                startedAt: Date.now()
            };
            saveGame(threadID, newGame);

            let startMsg = `🎮 CỜ CARO - BẮT ĐẦU!\n\n`;
            startMsg += `👤 ${name} (X) vs ${opponentName} (O)\n💰 Cược: ${bet} VNĐ\n`;
            startMsg += getBoard(newGame.board);
            startMsg += `\nLượt ${name}: Reply vị trí 1-9 để đánh.`;

            api.sendMessage(startMsg, threadID, (err, info) => {
                if (err) return;
                global.client.handleReply.push({
                    name: module.exports.config.name,
                    messageID: info.messageID,
                    author: senderID,
                    gameThread: threadID
                });
            }, messageID);
            break;

        case "move":
            if (!game) return api.sendMessage("Chưa có game! Dùng start để bắt đầu.", threadID, messageID);
            const pos = parseInt(args[1]) - 1;
            if (isNaN(pos) || pos < 0 || pos > 8 || game.board[pos] !== 0) return api.sendMessage("Vị trí không hợp lệ (1-9, trống)!", threadID, messageID);
            if (game.currentPlayer !== senderID) return api.sendMessage("Không phải lượt bạn!", threadID, messageID);

            game.board[pos] = game.players[senderID];
            const winner = checkWinner(game.board);
            let currentName = name;
            let opponentID = Object.keys(game.players).find(id => id !== senderID);
            let opponentName = await Users.getNameUser(opponentID);

            if (winner !== null) {
                const winPlayer = Object.keys(game.players).find(id => game.players[id] === winner);
                const winName = await Users.getNameUser(winPlayer);
                const statsWin = loadStats(winPlayer);
                const statsLose = loadStats(opponentID);
                statsWin.wins++; statsLose.losses++; statsWin.games++; statsLose.games++;
                saveStats(winPlayer, statsWin);
                saveStats(opponentID, statsLose);

                let endMsg = `🎉 KẾT THÚC!\n\n`;
                endMsg += `${winName} thắng!\n`;
                if (game.bet > 0) {
                    updateBank(winPlayer, game.bet * 2); // Payout
                    endMsg += `💰 ${winName} nhận ${game.bet * 2} VNĐ.`;
                }
                endMsg += `\n${getBoard(game.board)}`;

                saveGame(threadID, null); // End game
                return api.sendMessage(endMsg, threadID, messageID);
            } else if (winner === 0) {
                // Tie
                const statsTie1 = loadStats(game.players[0]);
                const statsTie2 = loadStats(game.players[1]);
                statsTie1.ties++; statsTie2.ties++; statsTie1.games++; statsTie2.games++;
                saveStats(statsTie1[0], statsTie1);
                saveStats(statsTie2[0], statsTie2);

                let tieMsg = `🤝 HÒA!\n\n`;
                if (game.bet > 0) tieMsg += `💰 Hoàn tiền cược ${game.bet} VNĐ mỗi người.`;
                tieMsg += `\n${getBoard(game.board)}`;

                saveGame(threadID, null);
                return api.sendMessage(tieMsg, threadID, messageID);
            }

            // Switch turn
            game.currentPlayer = opponentID;
            const nextMsg = getBoard(game.board) + `\nLượt ${opponentName}: Reply vị trí 1-9.`;
            return api.sendMessage(nextMsg, threadID, (err, info) => {
                if (err) return;
                global.client.handleReply.push({
                    name: module.exports.config.name,
                    messageID: info.messageID,
                    author: opponentID,
                    gameThread: threadID
                });
            }, messageID);

        case "stats":
            const stats = loadStats(senderID);
            const winRate = stats.games > 0 ? ((stats.wins / stats.games) * 100).toFixed(1) : 0;
            return api.sendMessage(
                `📊 STATS CỜ CARO - ${name}:\n` +
                `🏆 Thắng: ${stats.wins}\n` +
                `😔 Thua: ${stats.losses}\n` +
                `🤝 Hòa: ${stats.ties}\n` +
                `🎯 Tổng game: ${stats.games}\n` +
                `📈 Tỷ lệ thắng: ${winRate}%`,
                threadID, messageID
            );

        case "quit":
            saveGame(threadID, null);
            return api.sendMessage("🛑 Đã hủy game Cờ Caro!", threadID, messageID);

        default:
            return api.sendMessage(
                `🎮 CỜ CARO / TIC TAC TOE\n\n` +
                `Cách chơi: tictactoe start <ID đối thủ> <cược (tùy chọn)>\n` +
                `• move <1-9>: Đánh vị trí (lượt bạn)\n• stats: Xem stats cá nhân\n• quit: Hủy game\n\n` +
                `Bàn cờ:\n1|2|3\n4|5|6\n7|8|9\n\nX (1) vs O (-1), 3 hàng ngang/dọc/chéo thắng.\nCược từ bank (nếu có).`,
                threadID, messageID
            );
    }
};

module.exports.handleReply = async function({ api, event, handleReply }) {
    const { threadID, senderID, body } = event;
    if (handleReply.gameThread !== threadID) return;
    if (senderID !== handleReply.author) return api.sendMessage("Không phải lượt bạn!", threadID, event.messageID);

    // Parse move from reply body
    const args = body.split(" ");
    return module.exports.run({ api, event, args: ["move", args[0]] });
};
