const express = require('express');
const { Telegraf, Markup } = require('telegraf'); // Markup нужен для кнопки
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;

// ВАЖНО: тут сразу проставим адрес Render
const BASE_URL = process.env.BASE_URL || 'https://oliva-space.onrender.com';





if (!BOT_TOKEN) {
  throw new Error('Не указан BOT_TOKEN. Вставь токен от BotFather в переменную BOT_TOKEN.');
}

// ====== ПЕРСИСТЕНТНЫЕ ДАННЫЕ (ФАЙЛ) ======

const DATA_FILE = 'data.json';

// структура данных по умолчанию
let data = {
  users: {},      // userId -> { balance }
  tasks: [],      // список задач биржи
  nextTaskId: 1   // счётчик ID задач
};

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      if (raw.trim().length > 0) {
        const parsed = JSON.parse(raw);
        data = {
          users: parsed.users || {},
          tasks: parsed.tasks || [],
          nextTaskId: parsed.nextTaskId || 1
        };
        console.log('Данные загружены из data.json');
      }
    } else {
      console.log('Файл data.json пока не создан, начнём с пустых данных');
    }
  } catch (err) {
    console.error('Ошибка при загрузке data.json:', err);
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Ошибка при сохранении data.json:', err);
  }
}

// загружаем данные при старте
loadData();

// пользователи: userId -> { balance }
function getUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = { balance: 0 };
    saveData();
  }
  return data.users[userId];
}

// статусы: open | in_progress | submitted | cancelled | done
function statusToText(status) {
  if (status === 'open') return 'открыта';
  if (status === 'in_progress') return 'в работе';
  if (status === 'submitted') return 'на проверке';
  if (status === 'cancelled') return 'отменена';
  if (status === 'done') return 'завершена';
  return status;
}

// ====== НАСТРОЙКА БОТА OLIVA SPACE ======
const bot = new Telegraf(BOT_TOKEN);

// /start
// /panel — открывает веб-панель внутри Telegram
bot.command('panel', async (ctx) => {
  await ctx.reply('Открой панель Oliva Space 🌿 прямо здесь 👇', {
    reply_markup: {
      keyboard: [
        [
          { text: '🌿 Open Oliva Space', web_app: { url: BASE_URL } }
        ]
      ],
      resize_keyboard: true,
      one_time_keyboard: true // 👈 кнопка исчезнет после нажатия
    }
  });
});




bot.start((ctx) => {
  ctx.reply(
    'Добро пожаловать в Oliva Space 🌿 — мини-биржу микро-задач!\n\n' +
    'Я умею:\n' +
    '💰 Баланс:\n' +
    '• /balance — показать баланс\n' +
    '• /deposit сумма — пополнить баланс (учебно)\n\n' +
    '📌 Задачи:\n' +
    '• /newtask цена текст — создать задачу\n' +
    '• /market — список открытых задач\n' +
    '• /take ID — взять задачу в работу\n' +
    '• /mytasks — задачи, которые ты создал\n' +
    '• /myworks — задачи, которые ты выполняешь\n' +
    '• /submit ID — отправить задачу на проверку\n' +
    '• /approve ID — принять работу и оплатить\n' +
    '• /canceltask ID — отказаться / отменить задачу\n\n' +
    'Пример создания задачи:\n/newtask 200 Написать пост в телеграм'
  );
});

// ====== БАЛАНС ======

// /balance — показать баланс
bot.command('balance', (ctx) => {
  const user = getUser(ctx.from.id);
  ctx.reply(`Твой баланс: ${user.balance.toFixed(2)}₽ (виртуальный, учебный)`);
});

// /deposit сумма — пополнить баланс
bot.command('deposit', (ctx) => {
  const parts = ctx.message.text.trim().split(' ');
  const amountStr = parts[1];

  if (!amountStr) {
    return ctx.reply(
      'Укажи сумму после команды.\n\n' +
      'Пример:\n/deposit 100'
    );
  }

  const amount = parseFloat(amountStr.replace(',', '.'));
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('Сумма должна быть положительным числом. Пример: /deposit 150');
  }

  const user = getUser(ctx.from.id);
  user.balance += amount;
  saveData();

  ctx.reply(
    `Баланс пополнен на ${amount.toFixed(2)}₽ ✅\n` +
    `Текущий баланс: ${user.balance.toFixed(2)}₽`
  );
});

// ====== ЗАДАЧИ БИРЖИ ======

// /newtask цена текст — создать задачу (заказчик)
bot.command('newtask', (ctx) => {
  const parts = ctx.message.text.trim().split(' ');
  if (parts.length < 3) {
    return ctx.reply(
      'Формат команды:\n' +
      '/newtask цена текст\n\n' +
      'Пример:\n/newtask 200 Написать пост в телеграм'
    );
  }

  const priceStr = parts[1];
  const price = parseFloat(priceStr.replace(',', '.'));

  if (isNaN(price) || price <= 0) {
    return ctx.reply('Цена должна быть положительным числом. Пример: /newtask 150 Текст задания');
  }

  const text = parts.slice(2).join(' ');

  const task = {
    id: data.nextTaskId++,
    customerId: ctx.from.id,
    performerId: null,
    text,
    price,
    status: 'open',
    createdAt: new Date().toISOString()
  };

  data.tasks.push(task);
  saveData();

  ctx.reply(
    `Задача #${task.id} создана ✅\n` +
    `Цена: ${task.price.toFixed(2)}₽\n` +
    `Текст: ${task.text}\n\n` +
    'Теперь её могут увидеть фрилансеры через /market'
  );
});

// /market — список открытых задач
bot.command('market', (ctx) => {
  const userId = ctx.from.id;
  const openTasks = data.tasks.filter(
    (t) => t.status === 'open' && t.customerId !== userId
  );

  if (openTasks.length === 0) {
    return ctx.reply('Сейчас нет доступных задач на бирже 🙃');
  }

  const lines = openTasks.map((t) => {
    return `#${t.id} — ${t.text}\nЦена: ${t.price.toFixed(2)}₽`;
  });

  ctx.reply(
    'Доступные задачи:\n\n' +
    lines.join('\n\n') +
    '\n\nЧтобы взять задачу, используй команду:\n/take ID\nНапример: /take 1'
  );
});

// /take ID — взять задачу в работу
bot.command('take', (ctx) => {
  const parts = ctx.message.text.trim().split(' ');
  const idStr = parts[1];

  if (!idStr) {
    return ctx.reply(
      'Укажи ID задачи после команды.\n\n' +
      'Пример:\n/take 1'
    );
  }

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return ctx.reply('ID должен быть числом. Пример: /take 1');
  }

  const userId = ctx.from.id;
  const task = data.tasks.find((t) => t.id === id);

  if (!task) {
    return ctx.reply('Задача с таким ID не найдена 🤔');
  }

  if (task.customerId === userId) {
    return ctx.reply('Ты не можешь взять свою же задачу как исполнитель 🙂');
  }

  if (task.status !== 'open') {
    return ctx.reply('Эта задача уже недоступна для взятия (не в статусе "open").');
  }

  task.performerId = userId;
  task.status = 'in_progress';
  saveData();

  ctx.reply(
    `Ты взял задачу #${task.id} в работу 💼\n` +
    `Текст: ${task.text}\n` +
    `Цена: ${task.price.toFixed(2)}₽\n\n` +
    'Когда закончишь — отправь на проверку командой:\n' +
    `/submit ${task.id}`
  );
});

// /mytasks — задачи, которые я создал (как заказчик)
bot.command('mytasks', (ctx) => {
  const userId = ctx.from.id;
  const my = data.tasks.filter((t) => t.customerId === userId);

  if (my.length === 0) {
    return ctx.reply('Ты ещё не создавал задач. Используй /newtask 🙂');
  }

  const lines = my.map((t) => {
    const status = statusToText(t.status);
    const performer = t.performerId ? `(исполнитель: ${t.performerId})` : '(пока без исполнителя)';
    return `#${t.id} — ${t.text}\nЦена: ${t.price.toFixed(2)}₽\nСтатус: ${status} ${performer}`;
  });

  ctx.reply('Твои задачи как заказчика:\n\n' + lines.join('\n\n'));
});

// /myworks — задачи, которые я выполняю (как фрилансер)
bot.command('myworks', (ctx) => {
  const userId = ctx.from.id;
  const my = data.tasks.filter((t) => t.performerId === userId);

  if (my.length === 0) {
    return ctx.reply('У тебя пока нет задач в работе. Посмотри /market 🙂');
  }

  const lines = my.map((t) => {
    const status = statusToText(t.status);
    return `#${t.id} — ${t.text}\nЦена: ${t.price.toFixed(2)}₽\nСтатус: ${status}`;
  });

  ctx.reply('Твои задачи как исполнителя:\n\n' + lines.join('\n\n'));
});

// /submit ID — исполнитель отправляет задачу на проверку
bot.command('submit', (ctx) => {
  const parts = ctx.message.text.trim().split(' ');
  const idStr = parts[1];

  if (!idStr) {
    return ctx.reply(
      'Укажи ID задачи после команды.\n\n' +
      'Пример:\n/submit 1'
    );
  }

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return ctx.reply('ID должен быть числом. Пример: /submit 1');
  }

  const userId = ctx.from.id;
  const task = data.tasks.find((t) => t.id === id);

  if (!task) {
    return ctx.reply('Задача с таким ID не найдена 🤔');
  }

  if (task.performerId !== userId) {
    return ctx.reply('Ты не являешься исполнителем этой задачи.');
  }

  if (task.status !== 'in_progress') {
    return ctx.reply('Задача должна быть в статусе "в работе", чтобы отправить её на проверку.');
  }

  task.status = 'submitted';
  saveData();

  ctx.reply(
    `Задача #${task.id} отправлена на проверку 🕓\n` +
    'Теперь заказчик должен использовать /approve ID, чтобы принять работу и оплатить.'
  );
});

// /approve ID — заказчик принимает работу и платит исполнителю
bot.command('approve', (ctx) => {
  const parts = ctx.message.text.trim().split(' ');
  const idStr = parts[1];

  if (!idStr) {
    return ctx.reply(
      'Укажи ID задачи после команды.\n\n' +
      'Пример:\n/approve 1'
    );
  }

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return ctx.reply('ID должен быть числом. Пример: /approve 1');
  }

  const userId = ctx.from.id;
  const task = data.tasks.find((t) => t.id === id);

  if (!task) {
    return ctx.reply('Задача с таким ID не найдена 🤔');
  }

  if (task.customerId !== userId) {
    return ctx.reply('Ты не являешься заказчиком этой задачи.');
  }

  if (task.status !== 'submitted') {
    return ctx.reply('Задача должна быть в статусе "на проверке", чтобы её одобрить.');
  }

  if (!task.performerId) {
    return ctx.reply('У задачи нет исполнителя.');
  }

  const customer = getUser(task.customerId);
  const performer = getUser(task.performerId);

  if (customer.balance < task.price) {
    return ctx.reply(
      `Недостаточно средств у заказчика.\n` +
      `Нужно: ${task.price.toFixed(2)}₽\n` +
      `Твой баланс: ${customer.balance.toFixed(2)}₽\n\n` +
      'Пополнить баланс: /deposit сумма'
    );
  }

  customer.balance -= task.price;
  performer.balance += task.price;
  task.status = 'done';
  saveData();

  ctx.reply(
    `Задача #${task.id} принята ✅\n` +
    `Исполнитель получил: ${task.price.toFixed(2)}₽\n\n` +
    `Твой новый баланс: ${customer.balance.toFixed(2)}₽`
  );
});

// /canceltask ID — отменить / отказаться от задачи
bot.command('canceltask', (ctx) => {
  const parts = ctx.message.text.trim().split(' ');
  const idStr = parts[1];

  if (!idStr) {
    return ctx.reply(
      'Укажи ID задачи после команды.\n\n' +
      'Пример:\n/canceltask 1'
    );
  }

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return ctx.reply('ID должен быть числом. Пример: /canceltask 1');
  }

  const userId = ctx.from.id;
  const task = data.tasks.find((t) => t.id === id);

  if (!task) {
    return ctx.reply('Задача с таким ID не найдена 🤔');
  }

  // заказчик отменяет задачу
  if (task.customerId === userId) {
    if (task.status === 'done') {
      return ctx.reply('Нельзя отменить уже завершённую задачу.');
    }
    task.status = 'cancelled';
    saveData();
    return ctx.reply(`Ты отменил задачу #${task.id} ❌`);
  }

  // исполнитель отказывается
  if (task.performerId === userId) {
    if (task.status === 'done') {
      return ctx.reply('Нельзя отказаться от завершённой задачи.');
    }
    task.performerId = null;
    task.status = 'open';
    saveData();
    return ctx.reply(
      `Ты отказался от задачи #${task.id} ❌\n` +
      'Она снова доступна другим фрилансерам.'
    );
  }

  ctx.reply('Ты не заказчик и не исполнитель этой задачи, отменять её нельзя.');
});

// Ответ по умолчанию
bot.on('text', (ctx) => {
  ctx.reply(
    'Я понимаю только команды:\n\n' +
    '💰 Баланс:\n' +
    '• /balance — показать баланс\n' +
    '• /deposit сумма — пополнить баланс\n\n' +
    '📌 Задачи:\n' +
    '• /newtask цена текст — создать задачу\n' +
    '• /market — список открытых задач\n' +
    '• /take ID — взять задачу\n' +
    '• /mytasks — мои задачи как заказчика\n' +
    '• /myworks — мои задачи как исполнителя\n' +
    '• /submit ID — отправить на проверку\n' +
    '• /approve ID — принять и оплатить\n' +
    '• /canceltask ID — отказаться / отменить'
  );
});

// запуск бота
bot.launch().then(() => {
  console.log('Oliva Space bot запущен ✅');
});

// ====== ВЕБ-СЕРВЕР ======

// раздаём статические файлы из папки public (в том числе index.html)
app.use(express.static('public'));

// API для задач — используется нашей веб-панелью
app.get('/api/tasks', (req, res) => {
  res.json(data.tasks);
});

app.listen(PORT, () => {
  console.log(`Сервер Oliva Space запущен: http://localhost:${PORT}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
