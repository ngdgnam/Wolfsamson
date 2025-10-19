const fs = require("fs-extra");
const path = require("path");
const moment = require("moment-timezone");

module.exports.config = {
    name: "todo",
    version: "1.1.0",
    hasPermssion: 0,
    credits: "Kenne400k && Nnam mod",
    description: "Quản lý việc cần làm (nâng cấp: priority, deadline reminder, share list)",
    commandCategory: "Tiện ích",
    usages: "todo [add <task> [high/low] [deadline DD/MM] | list | done <ID> | remove <ID> | share | remind]",
    cooldowns: 3,
    dependencies: {
        "fs-extra": "",
        "moment-timezone": ""
    }
};

const todoPath = path.join(__dirname, "todo_data.json");

if (!fs.existsSync(todoPath)) fs.writeFileSync(todoPath, JSON.stringify({}, null, 2));

function loadTodo(userID) {
    const allTodo = JSON.parse(fs.readFileSync(todoPath, 'utf8'));
    return allTodo[userID] || [];
}

function saveTodo(userID, tasks) {
    const allTodo = JSON.parse(fs.readFileSync(todoPath, 'utf8'));
    allTodo[userID] = tasks;
    fs.writeFileSync(todoPath, JSON.stringify(allTodo, null, 2));
}

function addReminder(taskID, deadline) {
    const remindTime = moment(deadline, 'DD/MM/YYYY').tz('Asia/Ho_Chi_Minh').valueOf();
    setTimeout(() => {
        // Simulate remind (thực tế gửi message đến user/group nếu tích hợp)
        console.log(`Reminder: Task ${taskID} deadline!`);
        // api.sendMessage(`⏰ Nhắc nhở: Task ${taskID} đã đến hạn!`, userThreadID);
    }, remindTime - Date.now());
}

module.exports.run = async function({ api, event, args, Users }) {
    const { threadID, messageID, senderID } = event;
    const cmd = args[0]?.toLowerCase();
    const tasks = loadTodo(senderID);
    const task = args.slice(1, -2).join(" ");
    const priority = args[args.length - 2] || "low"; // high/low
    const deadline = args[args.length - 1]; // DD/MM

    switch (cmd) {
        case "add":
            if (!task) return api.sendMessage("Task không được để trống! Ví dụ: todo add Mua sữa high 20/10", threadID, messageID);
            const taskID = Date.now();
            tasks.unshift({ id: taskID, text: task, priority, deadline: deadline || null, done: false, created: new Date().toISOString() });
            saveTodo(senderID, tasks);
            if (deadline) addReminder(taskID, deadline);
            return api.sendMessage(`✅ Đã thêm task: "${task}"\n🔥 Priority: ${priority.toUpperCase()}\n📅 Deadline: ${deadline || "Không"}`, threadID, messageID);

        case "list":
            if (tasks.length === 0) return api.sendMessage("Chưa có task nào!", threadID, messageID);
            let listMsg = "📝 DANH SÁCH TODO:\n\n";
            tasks.filter(t => !t.done).forEach((t, i) => {
                const priEmoji = t.priority === "high" ? "🔥" : "📌";
                const due = t.deadline ? moment(t.deadline, 'DD/MM').tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY') : "Không";
                listMsg += `${i+1}. ${priEmoji} "${t.text}" (ID: ${t.id})\n📅 Hạn: ${due}\n\n`;
            });
            listMsg += `Tổng: ${tasks.filter(t => !t.done).length} task chưa xong. Reply ID để done/remove.`;
            return api.sendMessage(listMsg, threadID, (err, info) => {
                if (err) return;
                global.client.handleReply.push({
                    name: module.exports.config.name,
                    messageID: info.messageID,
                    author: senderID,
                    tasks: tasks.filter(t => !t.done)
                });
            }, messageID);

        case "done":
            const doneID = parseInt(task);
            const doneTask = tasks.find(t => t.id === doneID && !t.done);
            if (!doneTask) return api.sendMessage("Task không tồn tại hoặc đã done!", threadID, messageID);
            doneTask.done = true;
            saveTodo(senderID, tasks);
            return api.sendMessage(`✅ Đã đánh dấu done: "${doneTask.text}"`, threadID, messageID);

        case "remove":
            const removeID = parseInt(task);
            const removeTask = tasks.find(t => t.id === removeID);
            if (!removeTask) return api.sendMessage("Task không tồn tại!", threadID, messageID);
            tasks.splice(tasks.indexOf(removeTask), 1);
            saveTodo(senderID, tasks);
            return api.sendMessage(`🗑️ Đã xóa task: "${removeTask.text}"`, threadID, messageID);

        case "share":
            if (tasks.filter(t => !t.done).length === 0) return api.sendMessage("Không có task để share!", threadID, messageID);
            let shareMsg = `📋 TODO LIST CỦA ${name}:\n\n`;
            tasks.filter(t => !t.done).forEach(t => {
                const priEmoji = t.priority === "high" ? "🔥" : "📌";
                shareMsg += `${priEmoji} "${t.text}" (Hạn: ${t.deadline || "Không"})\n`;
            });
            return api.sendMessage(shareMsg, threadID, messageID);

        case "remind":
            // Simulate remind all overdue
            const overdue = tasks.filter(t => t.deadline && moment(t.deadline, 'DD/MM').isBefore(moment()) && !t.done);
            if (overdue.length === 0) return api.sendMessage("Không có task quá hạn!", threadID, messageID);
            let remindMsg = "⏰ NHẮC NHỞ TODO QUÁ HẠN:\n\n";
            overdue.forEach(t => remindMsg += `• "${t.text}" (ID: ${t.id})\n`);
            return api.sendMessage(remindMsg, threadID, messageID);

        default:
            return api.sendMessage(
                `📝 [ TODO - QUẢN LÝ VIỆC ]\n\n` +
                `Lệnh:\n• todo add <task> [high/low] [DD/MM] - Thêm task\n• todo list - Xem list\n• todo done/remove <ID> - Done/xóa\n• todo share - Share list group\n• todo remind - Nhắc quá hạn\nVí dụ: todo add Học bài high 25/10`,
                threadID, messageID
            );
    }
};

module.exports.handleReply = async function({ api, event, handleReply }) {
    const { threadID, messageID, senderID, body } = event;
    if (event.senderID !== handleReply.author) return;

    const idMatch = body.match(/(\d+)/);
    if (idMatch) {
        const taskID = parseInt(idMatch[1]);
        const task = handleReply.tasks.find(t => t.id === taskID);
        if (!task) return api.sendMessage("Task không tồn tại!", threadID, messageID);

        // Auto done nếu reply số (tùy chỉnh: done/remove dựa trên context)
        const tasks = loadTodo(senderID);
        const fullTask = tasks.find(t => t.id === taskID);
        if (fullTask) {
            fullTask.done = true;
            saveTodo(senderID, tasks);
            return api.sendMessage(`✅ Đã done task ID ${taskID}: "${fullTask.text}"`, threadID, messageID);
        }
    }
};
