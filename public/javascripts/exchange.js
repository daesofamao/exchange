
var socket;
var user;
var currentSymbol;

$(document).ready(init);

function init() {
  //connect to socket.io
  socket = io.connect('/io', {'sync disconnect on unload': true});

  socket.on("connect", function () {
    //say hello to the server
    var userId = getCookie("id");
    socket.emit('hey', {userId: userId});
  });

  socket.on("problem", function (data) {
    displayMessage(data.message);
  });
  
  socket.on("heyResponse", function (data) {
    if (data.user) {
      user = data.user;
      user.orders = data.orders;
      displayPortfolio();
      document.cookie="id="+user.id+"; expires=Wed, 10 Dec 2014 12:00:00 UTC";
    }
    if (data.message) {
      displayMessage(data.message);
    }
  });
  
  socket.on("userMessage", function (data) {
    if (data.user) {
      user = data.user;
      user.orders = data.orders;
      displayPortfolio();
    }
    if (data.message) {
      displayMessage(data.message);
    }
    if (currentSymbol) {
      socket.emit('getStock', {userId: user.id, symbol: currentSymbol});
    }
  });

  socket.on("lookupStockResponse", function (data) {
    displayStockProfile(data.stock);
    displayStockOrders(data.stock, data.orders);
    $('#symbolInput').val('');
    currentSymbol = data.stock.symbol;
  });
  
  socket.on("createOrderResponse", function (data) {
    if (data.user) {
      user = data.user;
      user.orders = data.orders;
      displayPortfolio();
    }
    if (data.message) {
      displayMessage(data.message);
    }
    if (currentSymbol) {
      socket.emit('getStock', {userId: user.id, symbol: currentSymbol});
    }
  });

  $('#symbolInput').keydown(function(e){
    if (e.keyCode === 13) {
      socket.emit('getStock', {userId: user.id, symbol: $(this).val()});
      if ($(this).val().toLowerCase() === 'reset') {
        location.reload();
      }
    }
  });

}

function displayPortfolio() {
  var p = $('#portfolio');
  var symbol;
  var numStocks = 0;
  p.empty();
  var fieldset = $('<fieldset></fieldset>');
  fieldset.append('<legend>Portfolio</legend>');
  fieldset.append('<p><span style="color:gray">USD:</span> ' + monetize(user.usd) + '</p>');
  for (symbol in user.portfolio) {
    if (user.portfolio[symbol]) {
      fieldset.append('<span class="portfolioStock">' + symbol + ': ' + user.portfolio[symbol] + ' </span>');
      numStocks += 1;
    }
  }
  if (!numStocks) {
    fieldset.append('<p style="color:lightgray">You currently don\'t own any stocks.</p>');
  }
  p.append(fieldset);
  
  if (user.orders.length) {
    fieldset.append('<p style="color:gray">Your Orders</p>');
    user.orders.forEach(function(order) {
      if (order.shares === 1) {
        fieldset.append('<p><button onclick="deleteOrder(\'' + order.id + '\')">X</button> ' + order.type + ' ' + order.shares + ' share of ' + order.symbol + ' at ' + monetize(order.price) + ' per share</p>');
      }
      else {
        fieldset.append('<p><button onclick="deleteOrder(\'' + order.id + '\')">X</button> ' + order.type + ' ' + order.shares + ' shares of ' + order.symbol + ' at ' + monetize(order.price) + ' per share</p>');
      }
    });
  }

}

function displayStockProfile(stock) {
  var p = $('#stockProfile');
  p.empty();
  var fieldset = $('<fieldset></fieldset>');
  fieldset.append('<legend>' + stock.profile.name + '</legend>');
  fieldset.append('<p>' + stock.symbol + '</p>');
  fieldset.append('<input style="display:none" id="stockSymbol" value="' + stock.symbol + '" type="hidden">');
  fieldset.append('<p><span style="color:gray">new buy order:</span> ' + 'buy <input id="buyShares" placeholder="number of shares"> at <input id="buyPrice" placeholder="price per shares"> <button id="buyButton" onclick="buyOrder()">order</button></p>');
  if (user.portfolio[stock.symbol]) {
    fieldset.append('<p><span style="color:gray">new sell order:</span> ' + 'sell <input id="sellShares" placeholder="number of shares"> at <input id="sellPrice" placeholder="price per share"> <button id="sellButton" onclick="sellOrder()">order</button></p>');
  }
  p.append(fieldset);
}

function displayStockOrders(stock, orders) {
  var sellOrders = [];
  var buyOrders = [];
  var table;
  var i;
  var fieldset = $('#stockProfile fieldset');

  orders.forEach(function(order) {
    if (order.type === 'buy') {
      buyOrders.push(order);
    }
    else if (order.type === 'sell') {
      sellOrders.push(order);
    }
  });
  
  // sort buy and sell orders
  buyOrders.sort(function(o1, o2) {
    if (o1.price < o2.price) {
      return 1;
    }
    else {
      return -1;
    }
  });
  sellOrders.sort(function(o1, o2) {
    if (o1.price < o2.price) {
      return -1;
    }
    else {
      return 1;
    }
  });
  
  //merge buy and sell orders
  for (i = buyOrders.length - 1; i > 0; i--) {
    if (buyOrders[i].price === buyOrders[i-1].price) {
      buyOrders[i-1].shares += buyOrders[i].shares;
      buyOrders.splice(i, 1);
    }
  }
  for (i = sellOrders.length - 1; i > 0; i--) {
    if (sellOrders[i].price === sellOrders[i-1].price) {
      sellOrders[i-1].shares += sellOrders[i].shares;
      sellOrders.splice(i, 1);
    }
  }
  
  table = $('<table></table>');
  table.append('<tr><th><span style="color:gray">sell orders</span></th><th><span style="color:gray">buy orders</span></th></tr>');
  for (i = 0; i < sellOrders.length || i < buyOrders.length; i++) {
    var tr = $('<tr></tr>');
    if (sellOrders[i]) {
      tr.append('<td>' + sellOrders[i].shares + ' shares at ' + monetize(sellOrders[i].price) + '</td>');
    }
    else {
      tr.append('<td></td>');
    }
    if (buyOrders[i]) {
      tr.append('<td>' + buyOrders[i].shares + ' shares at ' + monetize(buyOrders[i].price) + '</td>');
    }
    else {
      tr.append('<td></td>');
    }
    table.append(tr);
  }
  fieldset.append(table);
}

function buyOrder() {
  var order = {
    symbol: $('#stockSymbol').val(),
    shares: parseInt($('#buyShares').val()),
    price: Number($('#buyPrice').val()),
    type: 'buy'
  };
  socket.emit('createOrder', {userId: user.id, order: order});
}

function sellOrder() {
  var order = {
    symbol: $('#stockSymbol').val(),
    shares: parseInt($('#sellShares').val()),
    price: Number($('#sellPrice').val()),
    type: 'sell'
  };
  socket.emit('createOrder', {userId: user.id, order: order});
}

function deleteOrder(orderId) {
  socket.emit('deleteOrder', {userId: user.id, orderId: orderId});
}

////////// utility functions

function getCookie(name) {
  name = name + "=";
  var ca = document.cookie.split(';');
  for(var i=0; i<ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0)==' ') c = c.substring(1);
    if (c.indexOf(name) != -1) return c.substring(name.length, c.length);
  }
  return null;
}

function displayMessage(message) {
  alert(message);
}

function monetize(num) {
  num = Number(num);
  return '$' + (num.toFixed(2));
}