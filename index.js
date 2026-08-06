const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// 1. Telegram Bot Token
const TELEGRAM_TOKEN = '8417783415:AAF5d1xXD_2rrA3Knec_OSwtnXD5iEgl9GU';

// 2. Sightengine API ma'lumotlari
const API_USER = '1436050434';
const API_SECRET = 'NRmfxmKyEyJoQrJsLpesncpboDTquxxf';

// 3. Admin ID va Guruh (Tarix) ID-si
const ADMIN_ID = 8419615333; 
// Terminalda chiqqan minusli ID-ni quyidagi satrga qo'yasiz (masalan: -1002345678910):
const LOG_CHANNEL_ID = -1004312367012; 

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Foydalanuvchilarni fayldan o'qish
const USERS_FILE = './users.json';
function getUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
  }
  try {
    const data = fs.readFileSync(USERS_FILE);
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

// Yangi foydalanuvchini saqlash
function saveUser(user) {
  if (!user) return;
  const users = getUsers();
  const exists = users.find(u => u.id === user.id);
  if (!exists) {
    users.push({
      id: user.id,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      username: user.username ? `@${user.username}` : 'Mavjud emas',
      date: new Date().toISOString().split('T')[0]
    });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  }
}

// Admin/Guruhga log yuborish funksiyasi
async function logToAdmin(msg, fileType, aiScore, resultMessage) {
  try {
    const targetId = (LOG_CHANNEL_ID && LOG_CHANNEL_ID !== -1002345678910) ? LOG_CHANNEL_ID : ADMIN_ID;
    const user = msg.from;
    const userInfo = `👤 <b>Foydalanuvchi:</b> ${user.first_name || ''} ${user.last_name || ''} (${user.username ? '@' + user.username : 'Username yo\'q'})\n🆔 <b>ID:</b> <code>${user.id}</code>\n📂 <b>Tur:</b> ${fileType}\n📊 <b>AI Natijasi:</b> ${aiScore}%`;

    if (fileType === 'Rasm') {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      await bot.sendPhoto(targetId, fileId, { caption: userInfo, parse_mode: 'HTML' });
    } else if (fileType === 'Video') {
      const fileId = msg.video.file_id;
      await bot.sendVideo(targetId, fileId, { caption: userInfo, parse_mode: 'HTML' });
    }
  } catch (err) {
    console.error('Log yuborishda xatolik:', err.message);
  }
}

// /start buyrug'i
bot.onText(/\/start/, (msg) => {
  saveUser(msg.from);
  const chatId = msg.chat.id;
  const welcomeText = `👋 Salom! Men **FactLens AI** botiman.\n\n` +
    `Menga har qanday **rasm** yoki **video** yuboring, men uning **AI (Sun'iy intellekt)** orqali yaratilganini yoki haqiqiy ekanligini tahlil qilib beraman!`;
  
  bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' }).catch(console.error);
});

// Admin uchun: Foydalanuvchilar ro'yxati (/users)
bot.onText(/\/users/, (msg) => {
  saveUser(msg.from);
  const chatId = msg.chat.id;

  if (chatId !== ADMIN_ID) {
    return bot.sendMessage(chatId, "⚠️ Bu buyruq faqat bot admini uchun!").catch(console.error);
  }

  const users = getUsers();
  if (users.length === 0) {
    return bot.sendMessage(chatId, "Hali hech kim botdan foydalanmadi.").catch(console.error);
  }

  let text = `👥 <b>Bot foydalanuvchilari soni:</b> ${users.length} ta\n\n`;
  users.forEach((u, index) => {
    const safeFirstName = (u.first_name || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeLastName = (u.last_name || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeUsername = (u.username || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");

    text += `${index + 1}. ${safeFirstName} ${safeLastName} (${safeUsername}) - ID: <code>${u.id}</code>\n`;
  });

  bot.sendMessage(chatId, text, { parse_mode: 'HTML' }).catch(console.error);
});

// Oddiy xabarlar kelganda Chat ID-ni konsolga chiqarish
bot.on('message', (msg) => {
  saveUser(msg.from);
  const chatId = msg.chat.id;

  // Terminalda guruh ID-sini ko'rish uchun:
  console.log("➡️ Kelgan xabar Chat ID-si:", chatId);

  if (!msg.photo && !msg.video && msg.text && !msg.text.startsWith('/')) {
    // Shaxsiy chatda xabar yuborilsagina ogohlantirish
    if (msg.chat.type === 'private') {
      bot.sendMessage(chatId, '⚠️ Iltimos, tahlil qilish uchun **rasm** yoki **video** yuboring!', { parse_mode: 'Markdown' }).catch(console.error);
    }
  }
});

// RASM tahlili va loglash
bot.on('photo', async (msg) => {
  saveUser(msg.from);
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '🔍 Rasm tahlil qilinmoqda, kuting...').catch(console.error);

  try {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const fileUrl = await bot.getFileLink(fileId);

    const response = await axios.get('https://api.sightengine.com/1.0/check.json', {
      params: {
        'url': fileUrl,
        'models': 'genai',
        'api_user': API_USER,
        'api_secret': API_SECRET
      }
    });

    const aiScore = Math.round(response.data.type.ai_generated * 100);

    let resultMessage = `📊 **FactLens Rasm Tahlil Natijasi:**\n\n`;
    resultMessage += `🤖 AI (Sun'iy intellekt) ehtimoli: **${aiScore}%**\n\n`;

    if (aiScore > 60) {
      resultMessage += `⚠️ **Diqqat:** Ushbu rasm AI orqali yaratilgan soxta kontent bo'lishi mumkin!`;
    } else {
      resultMessage += `✅ **Xulosa:** Rasm original va haqiqiy fotosuratga o'xshaydi.`;
    }

    bot.sendMessage(chatId, resultMessage, { parse_mode: 'Markdown' }).catch(console.error);
    
    logToAdmin(msg, 'Rasm', aiScore, resultMessage);

  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, '❌ Kechirasiz, rasmni tahlil qilishda xatolik yuz berdi.').catch(console.error);
  }
});

// VIDEO tahlili va loglash
bot.on('video', async (msg) => {
  saveUser(msg.from);
  const chatId = msg.chat.id;

  if (msg.video.file_size > 20 * 1024 * 1024) {
    return bot.sendMessage(chatId, '⚠️ Video hajmi 20 MB dan oshmasligi kerak!').catch(console.error);
  }

  bot.sendMessage(chatId, '🎥 Video tahlil qilinmoqda, kuting...').catch(console.error);

  try {
    let fileId = msg.video.thumbnail ? msg.video.thumbnail.file_id : msg.video.file_id;
    const fileUrl = await bot.getFileLink(fileId);

    const response = await axios.get('https://api.sightengine.com/1.0/check.json', {
      params: {
        'url': fileUrl,
        'models': 'genai',
        'api_user': API_USER,
        'api_secret': API_SECRET
      }
    });

    const aiScore = Math.round(response.data.type.ai_generated * 100);

    let resultMessage = `🎬 **FactLens Video Tahlil Natijasi:**\n\n`;
    resultMessage += `🤖 AI (Sun'iy intellekt) ehtimoli: **${aiScore}%**\n\n`;

    if (aiScore > 60) {
      resultMessage += `⚠️ **Diqqat:** Ushbu video kadrlarida AI belgilari aniqlandi!`;
    } else {
      resultMessage += `✅ **Xulosa:** Video original va haqiqiy tasvirga o'xshaydi.`;
    }

    bot.sendMessage(chatId, resultMessage, { parse_mode: 'Markdown' }).catch(console.error);

    logToAdmin(msg, 'Video', aiScore, resultMessage);

  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, '❌ Kechirasiz, videoni tahlil qilishda xatolik yuz berdi.').catch(console.error);
  }
});