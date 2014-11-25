exchange
========

a simple stock exchange written in Node.js

Here's my attempt at the Coding Challenge.  It's a working, realtime, multiuser exchange (not just a portfolio) written in Node.js.  Users can create buy and sell orders and the backend matches them up.  Each stock has a starting buy and/or sell order based on its ask and bid values pulled from your API.  Once the user has bought stock, they can sell to other users, or back to the market if there are preexisting buy orders.

The meat of the system is in exchange.js.

There are some quirks that I would fix if I had more time, but I had fun writing it.  The frontend is quite ugly... really only the basics to interact with the backend.

(open the page on another computer or in a different browser or in incognito mode to act as another user)

You can enter 'reset' into the stock symbol input box to reset the server and wipe everyone's accounts. 
