/* eslint-disable no-console */
const fetch = require('node-fetch');

const { MongoClient, ObjectID } = require('mongodb');

const MONGODB_URI = process.env.RUSSELL_WORK_MONGODB_URI;

let cachedDb = null;
const timestamp = () => new Date().toString();
const person = 'Julie';
let lastMessage = `Uh oh, ${person} decided not to post an update today :(`;
const wholeGroupChatId = '-1001341192052';
const reminderChatId = '-100370368978';

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
  console.log(lastUpdate);

  if (lastUpdate && lastUpdate.length > 0) {
    lastMessage = `${person}: ${lastUpdate[0].dailyUpdate}`;
  }

  return lastMessage;
}

const sendTelegramMsg = async (text, chatId) => {
  const headers = { 'Content-Type': 'application/json' };
  const msg = { text, chat_id: chatId };
  console.log(text);
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

const sendReminder = async db => {
  const msg = await getLastDbEntry(db);
  if (lastMessage === msg) {
    return sendTelegramMsg('Friendly reminder, ${person}, you better post an update soon!', reminderChatId);
  }
  return null;
};

const executeMongo = async (event, context, callback) => {
  console.log(event);

  // eslint-disable-next-line no-param-reassign
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.queryStringParameters && event.queryStringParameters.update) {
    const db = await connectToDatabase();
    const { update } = event.queryStringParameters;
    await addDailyUpdate(db, update).catch(err => callback(err));
    const resp = {
      statusCode: 200,
      body: JSON.stringify({ message: `Thanks, ${person}! Your update:\n\n ${update}\n\n has been saved.` }),
    };
    callback(null, resp);
  }

  if (event.queryStringParameters && event.queryStringParameters.send === '1') {
    const db = await connectToDatabase();
    const tgResponse = await whatTelegramMessageToSend(db);
    console.log(tgResponse);
    const resp = {
      statusCode: 200,
      body: JSON.stringify({ message: 'Message sent succesfully!' }),
    };
    callback(null, resp);
  }

  if (event.queryStringParameters && event.queryStringParameters.reminder === '1') {
    const db = await connectToDatabase();
    const tgResponse = await sendReminder(db);
    console.log(tgResponse);
    const resp = {
      statusCode: 200,
      body: JSON.stringify({ message: 'Reminder Successful!' }),
    };
    callback(null, resp);
  }

  const resp = {
    statusCode: 200,
    body: JSON.stringify({
      message:
        'Nothing happened. To update your message of the day please add your update after the equal sign. Example: api.russell.work/daily_update?update=Hello here is my update today!',
    }),
  };
  callback(null, resp);
};

module.exports.handler = executeMongo;

// executeMongo({body: {city: 'Hammondsville', state: "Ohio"}}, {}, {})
