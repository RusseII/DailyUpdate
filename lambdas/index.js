/* eslint-disable no-console */
const fetch = require('node-fetch');
const { MongoClient, ObjectID } = require('mongodb');
const { users } = require('./users');
const { ranks } = require('./ranks');
const { luckyMessages, unluckyMessages } = require('./messages');
require('dotenv').config();

let cachedDb = null;
const MONGODB_URI = process.env.RUSSELL_WORK_MONGODB_URI;
const TELEGRAM_URI = `https://api.telegram.org/bot${process.env.GATES_ONLINE_SERVER_BOT_KEY}`;
const wholeGroupChatId = '-1001341192052';
const russellBusinessId = 837702272;
const stevenId = 313659549;
const kaiId = 316190324;
const luckyFactor = 0.5;
const luckyEventEvery = 200;

const timestamp = () => new Date().toString();

const errorHandler = err => {
  console.log('=> an error occurred: ', err);
  return { statusCode: 500, body: 'EEK! ERROR' };
};
function getRandomPerson() {
  return users[Math.floor(Math.random() * users.length)];
}

function getRandomUnluckyMessage(username, level, title) {
  const unluckyMessagesArray = unluckyMessages(username, level, title)
  return unluckyMessagesArray[Math.floor(Math.random() * unluckyMessagesArray.length)]
}

function getRandomLuckyMessage(username, level, title) {
  const luckyMessagesArray = luckyMessages(username, level, title)
  return luckyMessagesArray[Math.floor(Math.random() * luckyMessagesArray.length)]
}

const storeLuckyMessage = async (db, chat) => {
  return await db
    .collection('lucky_message')
    .insertOne(chat)
    .catch(errorHandler);
};

const storeUnluckyMessage = async (db, chat) => {
  return await db
    .collection('lucky_message')
    .insertOne({ ...chat, unlucky: true })
    .catch(errorHandler);
};

const getCombinedLuckyMessageCount = async (db, userId) => {
  const luckyCount = await db
    .collection('lucky_message')
    .count({ "message.from.id": userId })
    .catch(errorHandler);

  const unluckyCount = await db
    .collection('lucky_message')
    .count({ "message.from.id": userId, unlucky: true })
    .catch(errorHandler);

  return luckyCount - unluckyCount;
}

const handleLuckMessage = async (db, chat) => {
  await storeLuckyMessage(db, chat)
  level = await getCombinedLuckyMessageCount(db, chat.message.from.id)
  const title = ranks[Math.min(ranks.length - 1, level - 1)]
  const message = getRandomLuckyMessage(chat.message.from.username, level, title)


  await sendTelegramMsg(
    message,
    wholeGroupChatId
  );
}

const handleUnluckyMessage = async (db, chat) => {
  await storeUnluckyMessage(db, chat)
  level = await getCombinedLuckyMessageCount(db, chat.message.from.id)
  const title = ranks[Math.max(0, level - 1)]
  const message = getRandomUnluckyMessage(chat.message.from.username, level, title)
  console.log("message", message)

  await sendTelegramMsg(message, 
    wholeGroupChatId
  );
}

const storeUpdatePerson = async (db, person) => {
  await db
    .collection('daily_update_person')
    .insertOne(person)
    .catch(errorHandler);
};

const getUpdatePerson = async db => {
  const person = await db
    .collection('daily_update_person')
    .findOne({}, { sort: { $natural: -1 } })
    .catch(errorHandler);

  return person;
};

const sendTelegramMsg = async (text, chatId) => {
  const headers = { 'Content-Type': 'application/json' };
  const msg = { text, chat_id: chatId };
  const resp = await fetch(`${TELEGRAM_URI}/sendMessage`, {
    method: 'POST',
    body: JSON.stringify(msg),
    headers,
  }).catch(err => console.log(err));
  if (resp.status !== 200) console.log(resp);
  return resp;
};

const sendRanks = async db => {
  let message = 'Who is the luckiest memer in the chat?\n\n';
  const obj = [];

  await Promise.all(
    users.map(async user => {
      let level = await getCombinedLuckyMessageCount(db, user.id);
      level = (level - 1) < 0 ? 0 : (level -1);
      const title = level > (ranks.length - 1) ? ranks[ranks.length - 1] : ranks[level];
      obj.push({ name: user.first_name, level, title });
    })
  );

  obj.sort((a, b) => {
    return b.level - a.level;
  });

  let order = 1;
  obj.forEach(object => {
    message += `${order}. ${object.name} :: ${object.title || object.level}\n`;
    order += 1;
  });

  sendTelegramMsg(message, wholeGroupChatId);
};

async function connectToDatabase() {
  const uri = MONGODB_URI;
  console.log('=> connect to database');

  if (cachedDb) {
    console.log('=> using cached database instance');
    return Promise.resolve(cachedDb);
  }

  if (uri) {
    const connection = await MongoClient.connect(uri, {
      useUnifiedTopology: true,
      useNewUrlParser: true,
    });
    console.log('=> creating a new connection');
    cachedDb = connection.db('russell_work');
    return Promise.resolve(cachedDb);
  }
  throw Error('Create a .env with RUSSELL_WORK_MONGODB_URI');
}

async function addUpdate(db, dailyUpdate) {
  console.log('=> query database');

  const todaysPerson = await getUpdatePerson(db);

  const row = {
    dailyUpdate,
    person: todaysPerson,
    createdAt: timestamp(),
  };

  await db
    .collection('daily_update')
    .insertOne(row)
    .catch(errorHandler);

  return row;
}

async function getTodaysDailyUpdate(db) {
  console.log('=> query database');
  let sendTime = new Date();
  sendTime.setUTCHours(0, 0, 0);
  // Javascript uses the number of milliseconds since epoch. Unix timestamp is seconds since epoch.
  // ObjectId.createFromTime needs the timestamp in seconds (Unix timestamp).
  sendTime = sendTime / 1000;

  const lastUpdate = await db
    .collection('daily_update')
    .findOne(
      {
        _id: {
          $gt: ObjectID.createFromTime(sendTime),
        },
      },
      { sort: { $natural: -1 } }
    )
    .catch(errorHandler);
  console.log("LAST UPDATE", lastUpdate)
  return lastUpdate;
};


const passLogic = (chat, db) => {
  await sendTelegramMsg(
    `${chat.message.from.first_name} has decided to pass their turn.`,
    wholeGroupChatId
  );
  selectNewPerson(db)
}

const sendDailyUpdate = async db => {
  const lastUpdate = await getTodaysDailyUpdate(db);
  console.log(lastUpdate)
  const currentPerson = await getUpdatePerson(db);
  let msg = '';
  if (!lastUpdate) {
    msg = `Uh oh, ${currentPerson.first_name} (@${currentPerson.username}) decided not to post an update today :(`;
  } else {
    msg = `This update is from our very own ${currentPerson.first_name} (@${currentPerson.username}):\n\n${lastUpdate.dailyUpdate}`;
  }

  // send the msg to people via PM
  sendTelegramMsg(msg, russellBusinessId);
  sendTelegramMsg(msg, stevenId);
  sendTelegramMsg(msg, kaiId);
  return sendTelegramMsg(msg, wholeGroupChatId);
};

const sendReminder = async db => {
  const lastUpdate = await getTodaysDailyUpdate(db);
  const currentPerson = await getUpdatePerson(db);

  if (!lastUpdate) {
    return sendTelegramMsg(
      `Hey ${currentPerson.first_name}. Just a friendly reminder, please post an update soon!!\n\nTo post an update, respond to me with your message.`,
      currentPerson.id
    );
  }

  return null;
};

const selectNewPerson = async db => {
  const newPerson = getRandomPerson();
  await storeUpdatePerson(db, { ...newPerson, createdAt: timestamp() });

  await sendTelegramMsg(
    `A new person has been chosen: ${newPerson.first_name} @${newPerson.username}`,
    wholeGroupChatId
  );
  return sendTelegramMsg(
    `You've been selected! Please write to me about your present life and I will share it with everyone tomorrow at 8pm (:
      
      If you do not want to post, type 'pass' for your update & it will move to the next person.`,
    newPerson.id
  );
};

const executeMongo = async (event, context, callback) => {
  // eslint-disable-next-line no-param-reassign
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.queryStringParameters) {
    const db = await connectToDatabase();

    if (event.queryStringParameters.update) {
      const resp = {
        statusCode: 200,
        body: `Send it to the bot not to me!.`,
      };
      return callback(null, resp);
    }

    if (event.queryStringParameters.send === '1') {
      await sendDailyUpdate(db);
      await selectNewPerson(db);
      const resp = {
        statusCode: 200,
        body: 'Messages sent succesfully!',
      };
      return callback(null, resp);
    }

    // bad paramater name - called on TG message callback
    if (event.queryStringParameters.privateChat === '1') {
      let chat = {};
      try {
        chat = JSON.parse(event.body);
      } catch (e) {
        chat = event.body;
      }

      // console.log("msg here", chat)
      // if (chat.message.chat.id === wholeGroupChatId ) {
      //   const { message_id: id, from, text, date} = chat.message
      //   const {first_name, last_name, id: from_id} = from
      //   const from = `${first_name} ${last_name}`
      //   const chatHistoryFormat = {id, type, date, edited, from, from_id, text, originalFormat: chat.message}

      // }


      if (chat.message.chat.type === 'private') {
        const todaysPerson = await getUpdatePerson(db);
        if (chat.message.from.id === todaysPerson.id) {
          console.log("pm", chat)
          const message = chat.message.text

          if (message) {
            if (message === 'pass') {
              passLogic(chat, db)
            }
            await addUpdate(db, message);
            await sendTelegramMsg(
              `Your update has been saved, thanks ${chat.message.from.first_name}`,
              chat.message.from.id
            );
            await sendTelegramMsg(
              `${chat.message.from.first_name} has submitted their update of the day. It's ${message.length} characters long.`,
              wholeGroupChatId
            );
          } else {
            console.log("msg is null")
            await sendTelegramMsg(
              `${chat.message.from.first_name} ALLLEEERT!!!!!!!!!!!! BAD MESSAGE. MESSAGE NOT SUBMITTED. Please submit a message with Text only.`,
              russellBusinessId
            );
          }
        } else {
          await sendTelegramMsg(
            `Its not your turn to update, its ${todaysPerson.first_name}'s turn. Your ID is ${chat.message.from.id}`,
            chat.message.from.id
          );
        }
      } else if (chat.message.text && chat.message.text.toLowerCase().includes('!everyone')) {
        await sendTelegramMsg(users.map(user => `@${user.username}`).join(' '), wholeGroupChatId);
      } else if (chat.message.text && chat.message.text.toLowerCase().includes('!rank')) {
        await sendRanks(db);
      } else if (Math.random() * luckyEventEvery < 1) {
        if (Math.random() < luckyFactor) {
          await handleLuckMessage(db, chat);
        } else {
          console.log("unlucky")
          await handleUnluckyMessage(db, chat);
        }
      }

      return callback(null, { statusCode: 200 });
    }

    if (event.queryStringParameters.speak) {
      await sendTelegramMsg(event.queryStringParameters.speak, wholeGroupChatId);
      return callback(null, { statusCode: 200 });
    }

    if (event.queryStringParameters.reminder === '1') {
      await sendReminder(db);
      const resp = {
        statusCode: 200,
        body: JSON.stringify({ message: 'Reminder Successful!' }),
      };
      return callback(null, resp);
    }
  }

  const resp = {
    statusCode: 200,
    body: 'Nothing happened. To update your message of the day please send it to the bot!',
  };

  return callback(null, resp);
};

module.exports.handler = executeMongo;

if (process.env.NODE_ENV === 'development') {
  executeMongo({ queryStringParameters: { test: '1' } }, {}, async (error, response) => {
    try {
      const json = await response.json();
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log(response);
    }
    if (error) console.log('Error:', error);
    process.exit();
  });
}
