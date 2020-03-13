/* eslint-disable no-console */
const fetch = require('node-fetch');
const { MongoClient, ObjectID } = require('mongodb');
const { users } = require('./users');
const { ranks } = require('./ranks');
require('dotenv').config();

let cachedDb = null;
const MONGODB_URI = process.env.RUSSELL_WORK_MONGODB_URI;
const TELEGRAM_URI = `https://api.telegram.org/bot${process.env.GATES_ONLINE_SERVER_BOT_KEY}`;
const wholeGroupChatId = '-1001341192052';

const timestamp = () => new Date().toString();

const errorHandler = err => {
  console.log('=> an error occurred: ', err);
  return { statusCode: 500, body: 'EEK! ERROR' };
};
function getRandomPerson() {
  return users[Math.floor(Math.random() * users.length)];
}

const storeLuckyMessage = async (db, chat) => {
  return await db
    .collection('lucky_message')
    .insertOne(chat)
    .catch(errorHandler);
};

const getLuckyMessageCount = async (db, chat) => {
  const count = await db
    .collection('lucky_message')
    .count({ "message.from.id": chat.message.from.id })
    .catch(errorHandler);
  return count;
};

const handleLuckMessage = async (db, chat) => {

  await storeLuckyMessage(db, chat)
  level = await getLuckyMessageCount(db, chat)
  const title = ranks[level -1]

  await sendTelegramMsg(
    `MEOW XP MEOW! Congrats @${chat.message.from.username} on the lucky xp. 

You have been promoted to rank ${level} with a title of ${title}

Make sure to SPAM until you get a LUCKY PROMOTION!`,

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
}

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
    `You've been selected! Please post an update tomorrow (NOT today).
    \n\n
    To post an update, just send the full message to me when you're ready.`,
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
        body: 'Messages sent succesfully!' ,
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

      if (chat.message.chat.type === 'private') {
        const todaysPerson = await getUpdatePerson(db);
        if (chat.message.from.id === todaysPerson.id) {
          const message = chat.message.text
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
          await sendTelegramMsg(
            `Its not your turn to update, its ${todaysPerson.first_name}'s turn with tg id ${todaysPerson.id}. Your tg id is ${chat.message.from.id}. If its actually your turn tell an admin so he can fix ur id`,
            chat.message.from.id
          );
        }
      } else if (chat.message.text && chat.message.text.toLowerCase().includes('@everyone')) {
        await sendTelegramMsg(
          '@RusseII @geczy @gatesyq @memerson @ti0py @cr0wmium @sc4s2cg @gdog5 @ju1ie @gatesyp',
          wholeGroupChatId
        );
      }
      else if ((Math.random() * 100) < 0.5) {
        await handleLuckMessage(db, chat)
      }

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
