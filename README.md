[![api.russell.work/daily_update](https://img.shields.io/endpoint?url=https%3A%2F%2Fapi.russell.work%2Fserver_status%3Fbadge%3Dhttps%3A%2F%2Fapi.russell.work/daily_update)](https://api.russell.work/daily_update)
[![api.russell.work/daily_update](https://img.shields.io/endpoint?url=https%3A%2F%2Fapi.russell.work%2Fserver_status%3Fuptimes%3D1%26badge%3Dhttps%3A%2F%2Fapi.russell.work/daily_update)](https://api.russell.work/daily_update)



### Guide!

#### Submit an update:
[https://api.russell.work/daily_update?update=](https://api.russell.work/daily_update?update=)
Click that link, and type your update in the URL bar after the equal sign. 

Everytime you put and update, it adds the update to the database. When the `send` endpoint is invoked, it grabs the most recent update sent in the last 24 hours.


#### Send the update:
You should never do this by hand. This is called daily by an AWS cloudwatch event.
It sends the update to `The Whole Family` group chat.


If you ever get a `500` response, that is a bug. Please report to [http://t.me/russeii](http://t.me/russeii)
