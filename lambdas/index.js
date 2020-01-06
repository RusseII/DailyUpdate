/* eslint-disable no-console */
const fetch = require('node-fetch');

const { MongoClient, ObjectID } = require('mongodb');

const MONGODB_URI = process.env.RUSSELL_WORK_MONGODB_URI;

let cachedDb = null;
const timestamp = () => new Date().toString();

async function connectToDatabase(uri) {
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

  let lastMessage = 'Uh oh, Emerson decided not to post an update today :(';
  if (lastUpdate && lastUpdate.length > 0) {
    lastMessage = `Emerson: ${lastUpdate[0].dailyUpdate}`;
  }

  return lastMessage;
}

const sendTelegramMsg = async text => {
  const headers = { 'Content-Type': 'application/json' };
  const msg = { text, chat_id: '-1001341192052' };
  console.log(text);
  const resp = await fetch(
    `https://api.telegram.org/bot${process.env.GATES_ONLINE_SERVER_BOT_KEY}/sendMessage`,
    { method: 'POST', body: JSON.stringify(msg), headers }
  ).catch(err => console.log(err));
  if (resp.status !== 200) console.log(resp);
  return resp;
};

const whatTelegramMessageToSend = async db => {
  const lastMessage = await getLastDbEntry(db);
  return sendTelegramMsg(lastMessage);
};

const executeMongo = async (event, context, callback) => {
  // eslint-disable-next-line no-param-reassign
  context.callbackWaitsForEmptyEventLoop = false;
  const db = await connectToDatabase(MONGODB_URI);

  if (event.queryStringParameters && event.queryStringParameters.update) {
    const { update } = event.queryStringParameters;
    await addDailyUpdate(db, update).catch(err => callback(err));
    const resp = {
      statusCode: 200,
      body: JSON.stringify({ message: 'Update submitted succesfully' }),
    };
    callback(null, resp);
  } else {
    // if (event.queryStringParameters && event.queryStringParameters.send === '1') {
    const tgResponse = await whatTelegramMessageToSend(db);
    console.log(tgResponse);
    callback(null, 'Message Successfully Sent!');
    // }
  }
};

module.exports.handler = executeMongo;

// executeMongo({body: {city: 'Hammondsville', state: "Ohio"}}, {}, {})
