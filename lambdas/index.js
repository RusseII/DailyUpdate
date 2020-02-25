/* eslint-disable no-console */
const fetch = require('node-fetch');

const { MongoClient, ObjectID } = require('mongodb');

let cachedDb = null;
const MONGODB_URI = process.env.RUSSELL_WORK_MONGODB_URI;
const wholeGroupChatId = '-1001341192052';
const reminderChatId = '-1001341192052';
const timestamp = () => new Date().toString();
const persons = [
  'Matt',
  'Peter',
  'Emerson',
  'Kyle',
  'Jack',
  'James',
  'Julie',
  'Russell',
  'Grace',
  'Aaron',
];

function getRandomPerson() {
  return persons[Math.floor(Math.random() * persons.length)];
}

async function connectToDatabase() {
  const uri = MONGODB_URI;
  console.log('=> connect to database');

  if (cachedDb) {
    console.log('=> using cached database instance');
    return Promise.resolve(cachedDb);
  }

  const connection = await MongoClient.connect(uri);
  console.log('=> creating a new connection');
  cachedDb = connection.db('russell_work');
  return Promise.resolve(cachedDb);
}

async function addDailyUpdate(db, dailyUpdate) {
  console.log('=> query database');

  await db
    .collection('daily_update')
    .insertOne({ dailyUpdate, createdAt: timestamp() })
    .catch(err => {
      console.log('=> an error occurred: ', err);
      return { statusCode: 500, body: 'error adding to mongodb' };
    });

  return { dailyUpdate };
}

async function getLastDbEntry(db) {
  console.log('=> query database');

  const lastUpdate = await db
    .collection('daily_update')
    .find({
      _id: {
        $gt: ObjectID.createFromTime(Date.now() / 1000 - 24 * 60 * 60),
      },
    })
    .sort({ _id: -1 })
    .toArray()
    .catch(err => {
      console.log('=> an error occurred: ', err);
      return { statusCode: 500, body: 'error adding to mongodb' };
    });

  if (lastUpdate && lastUpdate.length > 0) {
    lastMessage = lastUpdate[0].dailyUpdate;
  } else {
    lastMessage = `Uh oh, someone decided not to post an update today :(. A new person has been picked: ${getRandomPerson()})`;
  }

  return lastMessage;
}

const sendTelegramMsg = async (text, chatId) => {
  const headers = { 'Content-Type': 'application/json' };
  const msg = { text, chat_id: chatId };
  const resp = await fetch(
    `https://api.telegram.org/bot${process.env.GATES_ONLINE_SERVER_BOT_KEY}/sendMessage`,
    { method: 'POST', body: JSON.stringify(msg), headers }
  ).catch(err => console.log(err));
  if (resp.status !== 200) console.log(resp);
  return resp;
};

const whatTelegramMessageToSend = async db => {
  const msg = await getLastDbEntry(db);
  return sendTelegramMsg(msg, wholeGroupChatId);
};

// No reminders
const sendReminder = async db => {
  const msg = await getLastDbEntry(db);
  if (msg.indexOf('Uh oh') !== -1) {
    return sendTelegramMsg(
      `Friendly reminder, the person better post an update soon!`,
      reminderChatId
    );
  }
  return null;
};

const executeMongo = async (event, context, callback) => {
  // eslint-disable-next-line no-param-reassign
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.queryStringParameters) {
    const { update, send, reminder } = event.queryStringParameters;

    const db = await connectToDatabase();
    if (update) {
      await addDailyUpdate(db, update).catch(err => callback(err));
      const resp = {
        statusCode: 200,
        body: `Thanks! Your update has been saved: <code>${update}</code>`,
      };
      return callback(null, resp);
    }

    if (send === '1') {
      await whatTelegramMessageToSend(db);
      const resp = {
        statusCode: 200,
        body: JSON.stringify({ message: 'Message sent succesfully!' }),
      };
      return callback(null, resp);
    }

    // No reminders
    if (reminder === '1') {
      return;
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
    body:
      'Nothing happened. To update your message of the day please add your update after the equal sign. Example: api.russell.work/daily_update?update=Hello here is my update today!',
  };

  return callback(null, resp);
};

module.exports.handler = executeMongo;
