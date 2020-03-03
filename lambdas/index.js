/* eslint-disable no-console */
const fetch = require('node-fetch');
const users = require('./users').users;
require('dotenv').config();

const { MongoClient, ObjectID } = require('mongodb');

let cachedDb = null;
const MONGODB_URI = process.env.RUSSELL_WORK_MONGODB_URI;
const TELEGRAM_URI = `https://api.telegram.org/bot${process.env.GATES_ONLINE_SERVER_BOT_KEY}`;
const wholeGroupChatId = '-1001341192052';
const reminderChatId = '-1001341192052';
const timestamp = () => new Date().toString();

function getRandomPerson() {
  return users[Math.floor(Math.random() * users.length)];
}

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
  } else {
    throw Error('Create a .env with RUSSELL_WORK_MONGODB_URI');
  }
}

async function addUpdateAndRollPerson(db, dailyUpdate) {
  console.log('=> query database');

  // To get current person, so as not to reroll 10x if they call this API 10x
  const todaysUpdate = await getUpdateForToday(db);

  const row = {
    dailyUpdate,
    person: (todaysUpdate && todaysUpdate.person) || (await getNextPersonFromYesterday(db)),
    nextPerson: (todaysUpdate && todaysUpdate.nextPerson) || getRandomPerson(),
    createdAt: timestamp(),
  };

  await db
    .collection('daily_update')
    .insertOne(row)
    .catch(err => {
      console.log('=> an error occurred: ', err);
      return { statusCode: 500, body: 'error adding to mongodb' };
    });

  return row;
}

async function getUpdateForToday(db) {
  console.log('=> query database');

  const lastUpdate = await db
    .collection('daily_update')
    .findOne(
      {
        _id: {
          $gt: ObjectID.createFromTime(Date.now() / 1000 - 24 * 60 * 60),
        },
      },
      { sort: { $natural: -1 } }
    )
    .catch(err => {
      console.log('=> an error occurred: ', err);
      return { statusCode: 500, body: 'error adding to mongodb' };
    });

  return lastUpdate;
}

// Get the person for the scheduled update
async function getNextPersonFromYesterday(db) {
  console.log('=> query database');

  const lastUpdate = await db
    .collection('daily_update')
    .findOne({ nextPerson: { $exists: true } }, { sort: { $natural: -1 } })
    .catch(err => {
      console.log('=> an error occurred: ', err);
      return { statusCode: 500, body: 'error querying mongodb' };
    });

  nextPerson = (lastUpdate && lastUpdate.nextPerson) || null;

  return nextPerson;
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

const sendMessageForToday = async db => {
  const lastUpdate = await getUpdateForToday(db);
  let msg = '';
  if (!lastUpdate) {
    const nextPerson = await getNextPersonFromYesterday(db);
    msg = `Uh oh, ${nextPerson.first_name} (@${nextPerson.username}) decided not to post an update today :(`;
  } else {
    msg = `This update is from our very own ${lastUpdate.person.first_name} (@${lastUpdate.person.username}):\n\n${lastUpdate.dailyUpdate}`;
  }
  return sendTelegramMsg(msg, wholeGroupChatId);
};

const sendReminder = async db => {
  const lastUpdate = await getUpdateForToday(db);
  const nextPerson = await getNextPersonFromYesterday(db);

  if (!lastUpdate.dailyUpdate && nextPerson) {
    return sendTelegramMsg(
      `Hey ${nextPerson.first_name}. Just a friendly reminder, please post an update soon!!\n\nTo post an update, respond to me with your message.`,
      person.id
    );
  }

  return null;
};

// Should only be called on an empty update day
const sendNewPerson = async db => {
  const rando = await addUpdateAndRollPerson(db, null);
  await sendTelegramMsg(
    `A new person has been chosen: ${rando.nextPerson.first_name} @${rando.nextPerson.username}`,
    wholeGroupChatId
  );
  return sendTelegramMsg(
    `You've been selected! Please post an update tomorrow (NOT today).
    \n\n
    Use: https://api.russell.work/daily_update?update=hello`,
    rando.nextPerson.id
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
      await sendMessageForToday(db);
      const resp = {
        statusCode: 200,
        body: { message: 'Messages sent succesfully!' },
      };
      return callback(null, resp);
    }

    if (event.queryStringParameters.roll === '1') {
      await sendNewPerson(db);
      const resp = {
        statusCode: 200,
        body: { message: 'Roll sent!' },
      };
      return callback(null, resp);
    }

    if (event.queryStringParameters.reminder === '1') {
      await sendReminder(db);
      const resp = {
        statusCode: 200,
        body: { message: 'Reminder Successful!' },
      };
      return callback(null, resp);
    }

    // Save update sent to bot
    if (event.queryStringParameters.privateChat === '1') {
      let chat = {};
      try {
        chat = JSON.parse(event.body);
      } catch (e) {
        chat = event.body;
      }

      let person = {};
      const lastUpdate = await getUpdateForToday(db);
      if (!lastUpdate) {
        person = await getNextPersonFromYesterday(db);
      } else {
        person = lastUpdate.person;
      }

      if (chat.message.from.id === person.id && chat.message.chat.type === 'private') {
        await addUpdateAndRollPerson(db, chat.message.text);
        await sendTelegramMsg(
          `Your update has been saved, thanks ${chat.message.from.first_name}`,
          chat.message.from.id
        );
      }

      return callback(null, { statusCode: 200 });
    }

    if (event.queryStringParameters.test === '1') {
      let resp = await fetch(`${TELEGRAM_URI}/getUpdates?allowed_updates=["message"]`).catch(err =>
        console.log(err)
      );
      resp = await resp.json();
      const todaysPersonMessages = resp.result.filter(
        row => row.message.from.id === users[0].id && row.message.chat.type === 'private'
      );
      const latestTodaysPersonMessage =
        todaysPersonMessages[todaysPersonMessages.length - 1].message.text;

      return callback(null, latestTodaysPersonMessage);
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
