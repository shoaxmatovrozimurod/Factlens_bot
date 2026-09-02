require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');
const axios = require('axios');
const i18next = require('i18next');
const { saveUser, setUserLanguage, getUserLanguage, getUsers } = require('./db');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const API_USER = process.env.API_USER;
const API_SECRET = process.env.API_SECRET;
const ADMIN_ID = Number(process.env.ADMIN_ID);
const LOG_CHANNEL_ID = Number(process.env.LOG_CHANNEL_ID);

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const uz = require('./locales/uz.json');
const en = require('./locales/en.json');

// 1. i18next init qismida escapeValue: false qo'shildi
i18next.init({
  lng: 'uz',
  fallbackLng: 'uz',
  interpolation: {
    escapeValue: false // &#39; belgilarini o'z holicha qoldiradi
  },
  resources: {
    uz: { translation: uz },
    en: { translation: en }
  }
});

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

bot.onText(/\/start/, (msg) => {
  saveUser(msg.from);
  const chatId = msg.chat.id;

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🇺🇿 O'zbekcha", callback_data: "lang_uz" },
          { text: "🇬🇧 English", callback_data: "lang_en" }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, "Iltimos, tilni tanlang / Please select a language:", options);
});

bot.onText(/\/language/, (msg) => {
  saveUser(msg.from);
  const chatId = msg.chat.id;

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🇺🇿 O'zbekcha", callback_data: "lang_uz" },
          { text: "🇬🇧 English", callback_data: "lang_en" }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, "Tilni almashtirish / Change language:", options);
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (data === 'lang_uz') {
    setUserLanguage(userId, 'uz');
    await bot.answerCallbackQuery(query.id, { text: "🇺🇿 O'zbek tili tanlandi!" });
    
    try { await bot.deleteMessage(chatId, query.message.message_id); } catch (e) {}

    bot.sendMessage(
      chatId, 
      "👋 Salom! Men *FactLens AI* botiman.\n\nMenga har qanday *rasm* yoki *video* yuboring, men uning *AI* orqali yaratilganini yoki haqiqiyligini tahlil qilaman.",
      { parse_mode: 'Markdown' }
    );
  } else if (data === 'lang_en') {
    setUserLanguage(userId, 'en');
    await bot.answerCallbackQuery(query.id, { text: "🇬🇧 English selected!" });

    try { await bot.deleteMessage(chatId, query.message.message_id); } catch (e) {}

    bot.sendMessage(
      chatId, 
      "👋 Hello! I am *FactLens AI* bot.\n\nSend me any *image* or *video*, and I will analyze whether it is created by *AI* or authentic.",
      { parse_mode: 'Markdown' }
    );
  }
});

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

bot.on('message', (msg) => {
  saveUser(msg.from);
  const chatId = msg.chat.id;

  if (!msg.photo && !msg.video && msg.text && !msg.text.startsWith('/')) {
    if (msg.chat.type === 'private') {
      bot.sendMessage(chatId, '⚠️ Iltimos, tahlil qilish uchun **rasm** yoki **video** yuboring!', { parse_mode: 'Markdown' }).catch(console.error);
    }
  }
});

bot.on('photo', async (msg) => {
  saveUser(msg.from);
  const chatId = msg.chat.id;
  const lang = getUserLanguage(msg.from.id);

  bot.sendMessage(chatId, i18next.t('analyzing', { lng: lang })).catch(console.error);

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

    // 2. HTML entitilarni almashtirish va parse_mode to'g'rilandi
    let resultMessage = i18next.t('resultMessage', {
      lng: lang,
      title: i18next.t('title', { lng: lang }),
      aiProb: i18next.t('aiProb', { lng: lang }),
      aiScore: aiScore,
      summary: aiScore > 60 
        ? i18next.t('summaryAI', { lng: lang }) 
        : i18next.t('summaryReal', { lng: lang })
    });

    resultMessage = resultMessage.replaceAll('&#39;', "'");

    await bot.sendMessage(chatId, resultMessage, { parse_mode: 'Markdown' }).catch(console.error);
    logToAdmin(msg, 'Rasm', aiScore, resultMessage);

  } catch (error) {
    console.error('Rasm tahlilida xatolik:', error);
    const errText = lang === 'en' 
      ? '❌ Sorry, an error occurred while analyzing the image.' 
      : '❌ Kechirasiz, rasmni tahlil qilishda xatolik yuz berdi.';
    bot.sendMessage(chatId, errText).catch(console.error);
  }
});

bot.on('video', async (msg) => {
  saveUser(msg.from);
  const chatId = msg.chat.id;
  const lang = getUserLanguage(msg.from.id);

  if (msg.video.file_size > 20 * 1024 * 1024) {
    const sizeText = lang === 'en' 
      ? '⚠️ Video file size must not exceed 20 MB!' 
      : '⚠️ Video hajmi 20 MB dan oshmasligi kerak!';
    return bot.sendMessage(chatId, sizeText).catch(console.error);
  }

  const waitVideoText = lang === 'en' 
    ? '🎥 Analyzing video, please wait...' 
    : '🎥 Video tahlil qilinmoqda, kuting...';
  bot.sendMessage(chatId, waitVideoText).catch(console.error);

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

    let resultMessage = i18next.t('resultMessage', {
      lng: lang,
      title: i18next.t('title', { lng: lang }),
      aiProb: i18next.t('aiProb', { lng: lang }),
      aiScore: aiScore,
      summary: aiScore > 60 
        ? i18next.t('summaryAI', { lng: lang }) 
        : i18next.t('summaryReal', { lng: lang })
    });

    resultMessage = resultMessage.replaceAll('&#39;', "'");

    await bot.sendMessage(chatId, resultMessage, { parse_mode: 'Markdown' }).catch(console.error);
    logToAdmin(msg, 'Video', aiScore, resultMessage);

  } catch (error) {
    console.error('Video tahlilida xatolik:', error);
    const errText = lang === 'en' 
      ? '❌ Sorry, an error occurred while analyzing the video.' 
      : '❌ Kechirasiz, videoni tahlil qilishda xatolik yuz berdi.';
    bot.sendMessage(chatId, errText).catch(console.error);
  }
});