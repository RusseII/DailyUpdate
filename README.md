[![russell.work/daily_update](https://img.shields.io/endpoint?url=https%3A%2F%2Fapi.russell.work%2Fserver_status%3Fbadge%3Dhttps%3A%2F%2Frussell.work/daily_update)](https://russell.work/daily_update)
[![russell.work/daily_update](https://img.shields.io/endpoint?url=https%3A%2F%2Fapi.russell.work%2Fserver_status%3Fuptimes%3D1%26badge%3Dhttps%3A%2F%2Frussell.work/daily_update)](https://russell.work/daily_update)



### Guide!

#### Submit an update:
[https://russell.work/daily_update?update=](https://russell.work/daily_update?update=)
Click that link, and type your update in the URL bar after the equal sign. 

Everytime you put and update, it adds the update to the database. When the `send` endpoint is invoked, it grabs the most recent update sent in the last 24 hours.


#### Send the update:
You should never do this by hand. This is called daily by an AWS cloudwatch event.
