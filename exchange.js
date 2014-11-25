var restler = require('restler');

var utils = require('./utils');

// for this exercise we'll just use these objects in memory for storage
var users = {};
var stocks = {};
var orders = {};

//remember users' sockets
var sockets = {};

function createUser(socket) {
  var id = utils.createRandomId();
  var user = {
    id: id,
    socketId: socket.id,
    usd: 100000,
    portfolio: {},
    orderIds: [],
    trades: [],
    created: new Date()
  };
  users[id] = user;
  sockets[socket.id] = socket;
  return user;
}

function createStock(symbol) {
  symbol = utils.normalizeSymbol(symbol);
  var stock = {
    symbol: symbol,
    orderIds: []
  };
  stocks[symbol] = stock;
  return stock;
}

function createOrder(user, order, callback) {
  var symbol;
  var type;
  var shares;
  var price;
  
  // first let's check our inputs
  
  symbol = utils.normalizeSymbol(order.symbol);
  // any order must involve a stock that's been looked up in the past
  if (!stocks[symbol]) {
    return callback(new Error('unknown symbol'));
  }
  
  type = order.type;
  if (['buy', 'sell'].indexOf(type) === -1) {
    return callback(new Error('order type must be "buy" or "sell"'));
  }
  
  shares = parseInt(order.shares);
  if (isNaN(shares) || shares < 1) {
    return callback(new Error('shares must be a positive integer'));
  }
  
  if (user && type === 'sell' && user.portfolio[symbol] < shares) {
    return callback(new Error('you can\'t sell more shares than you own'));
  }
  
  price = utils.roundTo2Decimals(order.price);
  // this exchange allows no Superman 3 hijinx
  if (isNaN(price) || price < .01) {
    return callback(new Error('price must be at least 1 cent'));
  }
  
  order = {
    id: utils.createRandomId(),
    symbol: symbol,
    type: type,
    shares: shares,
    price: price,
    created: new Date()
  };
  orders[order.id] = order;
  
  stocks[symbol].orderIds.push(order.id);
  
  if (user) {
    order.userId = user.id;
    user.orderIds.push(order.id);
  }
  
  if (callback) {
    scanOrders(symbol);
    callback(null, order);
  }
  
}

function deleteOrder(id, user) {
  var order = orders[id];
  var stock = stocks[order.symbol];
  delete orders[id];
  if (user) {
    user.orderIds.splice(user.orderIds.indexOf(id), 1);
  }
  stock.orderIds.splice(stock.orderIds.indexOf(id), 1);
}

function getUserOrders(user) {
  var userOrders = [];
  user.orderIds.forEach(function(id) {
    userOrders.push(orders[id]);
  });
  return userOrders;
}

function authenticateUser(id) {
  // obviously this is the most secure authentication in the world...
  return users[id];
}

function getStockProfileFromBenzinga(symbol, callback) {
  symbol = utils.normalizeSymbol(symbol);
  var options = {
    parser: restler.parsers.json
  };
  restler.get('http://data.benzinga.com/stock/'+symbol, options).on('complete', function(result) {
    var profile;
    var stock;
    if (result instanceof Error) {
      callback(result);
    } 
    else if (result && result.status === 'error') {
      /*
      on error, Benzinga returns json object like this:
      {
        "status": "error",
        "msg": "Symbol not found"
      }
      */
      callback(new Error(result.msg));
    }
    else {
      profile = result;
      if (stocks[symbol]) {
        // let's update our profile of this stock
        stocks[symbol].profile = profile;
        stock = stocks[symbol];
      }
      else {
        // or create a new record
        stock = createStock(symbol);
        stock.profile = profile;
        
        // here we create initial buy and sell orders for the stock, based on the bid and ask sizes
        if (parseInt(profile.asksize) && utils.roundTo2Decimals(profile.ask)) {
          createOrder(null, {
            symbol: symbol,
            type: 'sell',
            shares: parseInt(profile.asksize),
            price: utils.roundTo2Decimals(profile.ask)
          });
        }
        if (parseInt(profile.bidsize) && utils.roundTo2Decimals(profile.bid)) {
          createOrder(null, {
            symbol: symbol,
            type: 'buy',
            shares: parseInt(profile.bidsize),
            price: utils.roundTo2Decimals(profile.bid)
          });
        }
        
      }
      
      callback(null, stock);

    }
  });
}

function scanOrders(symbol) {
  // This is the fun part.  Scan through orders involving this stock looking for matches
  // This function should be optimized six ways from Sunday.  Here it isn't.
  symbol = utils.normalizeSymbol(symbol);
  var stock = stocks[symbol];
  var buyOrders = [];
  var sellOrders = [];
  var ask = null;
  var bid = null;
  var buyOrder;
  var sellOrder;
  var buyUser;
  var sellUser;
  var shares;
  var buyLimit;
  var price;
  var cost;
  
  console.log('scanning '+symbol+' for order matches...');
  
  // separate buy and sell orders
  stock.orderIds.forEach(function(orderId) {
    var order = orders[orderId];
    if (order.type === 'buy') {
      buyOrders.push(order);
    }
    else if (order.type === 'sell') {
      sellOrders.push(order);
    }
  });
  
  // sort orders by price
  sellOrders.sort(function(o1, o2) {
    if (o1.price < o2.price) {
      return 1
    }
    else {
      return -1;
    }
  });
  buyOrders.sort(function(o1, o2) {
    if (o1.price < o2.price) {
      return -1
    }
    else {
      return 1;
    }
  });
  
  while (buyOrders.length && sellOrders.length && buyOrders[buyOrders.length-1].price >= sellOrders[sellOrders.length-1].price) {
  
    sellOrder = null;
    sellUser = null;
    buyOrder = null;
    buyUser = null;
  
    if (buyOrders.length && sellOrders.length && buyOrders[buyOrders.length-1].price >= sellOrders[sellOrders.length-1].price) {
      // a match exists between local buy and sell orders
      buyOrder = buyOrders[buyOrders.length-1];
      buyUser = users[buyOrder.userId];
      sellOrder = sellOrders[sellOrders.length-1];
      sellUser = users[sellOrder.userId];
      price = sellOrder.price;
    }
  
    // let's see how many shares this trade will involve
    // start with a limit of 5000 shares per trade, just an arbitrary number
    shares = 5000;
    if (buyOrder && shares > buyOrder.shares) {
      shares = buyOrder.shares;
    }
    if (sellOrder && shares > sellOrder.shares) {
      shares = sellOrder.shares;
    }
    if (buyUser) {
      // can this user afford this trade?
      buyLimit = Math.floor(buyUser.usd / price);
      if (shares > buyLimit) {
        shares = buyLimit;
      }
    }
    if (sellUser) {
      // does this seller have enough stock?
      if (shares > sellUser.portfolio[symbol]) {
        shares = sellUser.portfolio[symbol];
      }
    }
    
    if (buyUser && sellUser && buyUser.id === sellUser.id) {
      // doesn't make sense for someone to sell to themselves
      buyOrders.pop();
      continue;
    }
    
    if (shares) {
      // let's trade
      if (buyOrder) {
        buyOrder.shares -= shares;
        if (!buyOrder.shares) {
          // this order has been fulfilled
          buyOrders.pop();  // remove it from the stack
          deleteOrder(buyOrder.id, buyUser);
        }
      }
      if (sellOrder) {
        sellOrder.shares -= shares;
        if (!sellOrder.shares) {
          // this order has been fulfilled
          sellOrders.pop();  // remove it from the stack
          deleteOrder(sellOrder.id, sellUser);
        }
      }
      if (buyUser) {
        buyUser.usd -= shares * price;
        console.log('user bought ' + shares + ' at ' + price);
        //update portfolio
        if (buyUser.portfolio[symbol]) {
          buyUser.portfolio[symbol] += shares;
        }
        else {
          buyUser.portfolio[symbol] = shares;
        }
        buyUser.trades.push({
          symbol: symbol,
          date: new Date(),
          shares: shares,
          type: 'buy'
        });
        if (shares === 1) {
          sendUserUpdate(buyUser, 'You bought 1 share of ' + symbol + ' for ' + utils.monetize(shares * price) + '!');
        }
        else {
          sendUserUpdate(buyUser, 'You bought ' + shares + ' shares of ' + symbol + ' for ' + utils.monetize(shares * price) + '!');
        }
      }
      if (sellUser) {
        sellUser.usd += shares * price;
        console.log('user sold ' + shares + ' at ' + price);
        //update portfolio
        sellUser.portfolio[symbol] -= shares;
        sellUser.trades.push({
          symbol: symbol,
          date: new Date(),
          shares: shares,
          type: 'sell'
        });
        if (shares === 1) {
          sendUserUpdate(sellUser, 'You sold 1 share of ' + symbol + ' for ' + utils.monetize(shares * price) + '!');
        }
        else {
          sendUserUpdate(sellUser, 'You sold ' + shares + ' shares of ' + symbol + ' for ' + utils.monetize(shares * price) + '!');
        }
      }
    }
    
    if (buyUser && buyLimit === 0) {
      // this buyer can't afford even 1 share, ignore their buy order for now
      buyOrders.pop();
    }
    if (sellOrder && sellUser && !sellUser.portfolio[symbol]) {
      // this seller has no more stock, ignore their sell order for now
      sellOrders.pop();
    }
    
  }
  
}

function sendUserUpdate(user, message) {
  var socket = sockets[user.socketId];
  var data = {
    user: user,
    orders: getUserOrders(user),
    message: message
  };
  socket.emit("userMessage", data);
  console.log('message emitted');
}

exports.socketManager = function(socket) {

  socket.on("hey", function(data) {
    // user is connecting for the first time
    var user = authenticateUser(data.userId);
    var response = {}
    if (!user) {
      user = createUser(socket);
      response.message = "Welcome to this exchange demo, written in node.js.  Your account has been created and contains $100,000.00 USD.";
    }
    response.user = user;
    response.orders = getUserOrders(user);
    socket.emit("heyResponse", response);
  });

  socket.on("getStock", function(data) {
    // user is requesting stock info
    // always pull a fresh copy from Benzinga
    var symbol = utils.normalizeSymbol(data.symbol);
    
    var user = authenticateUser(data.userId);
    if (!user) {
      return socket.emit("problem", {message: 'unauthorized'});
    }
    
    if (symbol === 'RESET') {
      users = {};
      stocks = {};
      orders = {};
      return;
    }
    
    var response = {};
    getStockProfileFromBenzinga(symbol, function(error, stock){
      if (error) {
        socket.emit("problem", {message: error.message});
      }
      else {
        response.stock = stock;
        // let's also let the user know any orders for this stock
        response.orders = [];
        stock.orderIds.forEach(function(orderId){
          response.orders.push(orders[orderId]);
          // note that userIds are included - if this was a real world app we'd filter those out
        });
        socket.emit("lookupStockResponse", response);
      }
    });
  });
  
  socket.on("createOrder", function(data) {
    //user is placing a new buy order
    var user = authenticateUser(data.userId);
    var response = {};
    if (!user) {
      return socket.emit("problem", {message: 'unauthorized'});
    }
    sockets[user.socketId] = socket;
    createOrder(user, data.order, function(error, order){
      if (error) {
        console.log(error);
        socket.emit("problem", {message: error.message});
      }
      else {
        response.user = user;
        response.orders = getUserOrders(user);
        response.symbol = order.symbol;
        socket.emit("createOrderResponse", response);
      }
    });
  });
  
  socket.on("deleteOrder", function(data) {
    //user is deleting a previous buy/sell order
    var user = authenticateUser(data.userId);
    var response = {};
    if (!user || user.orderIds.indexOf(data.orderId) === -1) {
      return socket.emit("problem", {message: 'unauthorized'});
    }
    deleteOrder(data.orderId, user);
    response.user = user;
    response.orders = getUserOrders(user);
    response.message = 'Order deleted';
    socket.emit("userMessage", response);
  });

}
