# ServiceMonitor
[![thegates.online](https://img.shields.io/endpoint?url=https%3A%2F%2F4mpgsamyqb.execute-api.us-east-1.amazonaws.com%2Fserver_status%3Fbadge%3Dhttps%3A%2F%2Fthegates.online)](https://thegates.online)
[![thegates.online](https://img.shields.io/endpoint?url=https%3A%2F%2F4mpgsamyqb.execute-api.us-east-1.amazonaws.com%2Fserver_status%3Fuptimes%3D1%26badge%3Dhttps%3A%2F%2Fthegates.online)](https://thegates.online)

[![russell.work](https://img.shields.io/endpoint?url=https%3A%2F%2F4mpgsamyqb.execute-api.us-east-1.amazonaws.com%2Fserver_status%3Fbadge%3Dhttps%3A%2F%2Frussell.work)](https://russell.work)
[![russell.work](https://img.shields.io/endpoint?url=https%3A%2F%2F4mpgsamyqb.execute-api.us-east-1.amazonaws.com%2Fserver_status%3Fuptimes%3D1%26badge%3Dhttps%3A%2F%2Frussell.work)](https://russell.work)


Monitors the Gates server &amp; sends telegram alerts when server status changes.

Deployed at [https://4mpgsamyqb.execute-api.us-east-1.amazonaws.com/server_status](https://4mpgsamyqb.execute-api.us-east-1.amazonaws.com/server_status)

Add `?uptimes=1` to return uptimes in result

Example: [https://4mpgsamyqb.execute-api.us-east-1.amazonaws.com/server_status?uptimes=1](https://4mpgsamyqb.execute-api.us-east-1.amazonaws.com/server_status?uptimes=1)


You need `RUSSELL_WORK_MONGODB_URI` env variable to store data in MongoDB
You need `GATES_ONLINE_SERVER_BOT_KEY` to send messages to the Gates server chat.

Deploy to AWS with `yarn deploy` - you will need aws keys with the appropriate permissions. 
