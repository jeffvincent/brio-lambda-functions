'use strict';

// this function receives an order approved notification from PWN Health,
// then notifies Kinvey of the approval status change.

// libraries
const rp = require('request-promise');

// create a responses object for use with the callback
const responses = {
  success: body => {
    return {
      statusCode: body.statusCode || 200,
      body: body
    };
  },
  error: error => {
    return {
      statusCode: error.statusCode || 500,
      body: error.message
    };
  }
};

// Kinvey call options
const kinveyOptions = {
  port: 443,
  uri: process.env.kinveyEndpoint,
  method: 'POST',
  json: true,
  headers: {
    'Content-Type': 'application/json',
    Authorization:
      'Basic ' +
      new Buffer(
        process.env.kinvey_username + ':' + process.env.kinvey_password
      ).toString('base64')
  }
};

// slack call options
const slackOptions = {
  port: 443,
  uri: process.env.slackbotUrl,
  method: 'POST',
  json: true,
  headers: {
    'Content-type': 'application/json'
  }
};

// Lambda function
exports.handler = (event, context, callback) => {
  console.log('running event');

  // these are required query params by the API gateway
  let token = event['queryStringParameters']['token'];
  let id = event['queryStringParameters']['id'];
  let status = event['queryStringParameters']['status'];

  // ensure query param values are legit
  if (token != process.env.authentication_token) {
    console.log('attempt to call with incorrect token.');
    return callback(
      null,
      responses.error({ code: 401, message: `incorrect token ${token}` })
    );
  }

  let acceptableStatusList = ['approved', 'rejected'];
  if (acceptableStatusList.indexOf(status) < 0) {
    console.log(`function called with incorrect status: ${status}`);
    return callback(
      null,
      responses.error({
        code: 400,
        message: `status not recognized: ${status}`
      })
    );
  }

  //
  // ok, move forward
  //
  let notification = {
    orderId: id,
    status: status
  };

  // notify Kinvey of PWN order status change
  notifyKinvey(notification)
    .then(kinveyRes => {
      console.log('response from Kinvey: ', kinveyRes);
      // send internal Slack notification
      return sendInternalNotification(notification, kinveyRes);
    })
    .then(slackRes => {
      console.log('response from Slack: ', slackRes);
      return callback(null, responses.success(slackRes));
    })
    .catch(err => {
      console.log('err: ', err);
      return callback(null, responses.error(err));
    });
};

function sendInternalNotification(notification, response) {
  let messageBody = '';
  messageBody += 'PWN event received:';
  messageBody += ' ```';
  messageBody += `type: order approval\n`;
  messageBody += `order ID: ${notification.orderId}\n`;
  messageBody += `order status: ${notification.status}\n`;
  messageBody += `Kinvey returned \"${response}\"`;
  messageBody += '``` ';

  console.log(`notification messageBody: ${messageBody}`);

  slackOptions.body = { text: messageBody };

  return rp(slackOptions);
}

function notifyKinvey(notification) {
  kinveyOptions.body = notification;

  return rp(kinveyOptions);
}
