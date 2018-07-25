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
      body: JSON.stringify(body)
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

// pwn health request options
const pwnURIBase = 'https://api16-staging.pwnhealth.com';
const pwnOptions = {
  port: 443,
  method: 'GET',
  headers: {
    Authorization:
      'Basic ' +
      new Buffer(
        process.env.pwn_key + ':' + process.env.pwn_token)
      .toString('base64')
  }
};

// Lambda function
exports.handler = (event, context, callback) => {
  console.log('running event');

  // these are required query params by the API gateway
  let token = event['queryStringParameters']['token'];
  let id = event['queryStringParameters']['id'];
  let result = event['queryStringParameters']['result'].toLowerCase();
  let result_complete = event['queryStringParameters']['result_complete'].toLowerCase();

  //
  // ensure query param values are legit
  //
  if (token != process.env.authentication_token) {
    console.log('attempt to call with incorrect token.');
    return callback(
      null,
      responses.error({ code: 401, message: `incorrect token ${token}` })
    );
  }

  let acceptableResults = 'released normal'.split(' ');
  if (acceptableResults.indexOf(result) < 0) {
    console.log(`function called with incorrect result: ${result}`);
    return callback(
      null,
      responses.error({
        code: 400,
        message: `result type not recognized: ${result}`
      })
    );
  }

  let acceptableResultCompleteTypes = 'incomplete complete'.split(' ');
  if (acceptableResultCompleteTypes.indexOf(result_complete) < 0) {
    console.log(`incorrect result_complete type: ${result_complete}`);
    return callback(
      null,
      responses.error({
        code: 400,
        message: `result_complete type not recognized: ${result_complete}`
      })
    );
  }

  //
  // ok, move forward
  //
  let notification = {
    orderId: id,
    result,
    result_complete
  };

  // if the results are complete, request the results and append them onto the notification
  // TODO: this can definitely be cleaned up
  if (result_complete === 'complete') {
    requestResultsData(notification, function(data, err) {
      if (err) {
        sendInternalNotification(notification, responses.error(err));
        return callback(null, responses.error(err));
      }

      notifyKinvey(notification, function(status) {
        sendInternalNotification(notification, status);
        return callback(null, status);
      });
    });
  } else {
    // notify Kinvey of PWN order status change
    notifyKinvey(notification, function(status) {
      return callback(null, status);
    });
  }
};

function requestResultsData(notification, requestCallback) {
  pwnOptions.uri = `${pwnURIBase}/customers/${notification.orderId}?include=reconciled_results`;

  return rp(pwnOptions)
    .then(parsedBody => {
      console.log('body: ', parsedBody);
      notification.results_data = parsedBody;
      requestCallback(notification, null);
    })
    .catch(err => {
      console.log('err: ', err);
      requestCallback(null, responses.error(err));
    });
}

function sendInternalNotification(notification, status) {
  let messageBody = '';
  messageBody += 'PWN event received:';
  messageBody += ' ```';
  messageBody += `type: results received\n`;
  messageBody += `order ID: ${notification.orderId}\n`;
  messageBody += `Kinvey returned ${status.statusCode}:`;
  messageBody += `\"${status.body.replace(/\./g, '')}\", proper callback sent.`;
  messageBody += '``` ';

  console.log(`notification messageBody: ${messageBody}`);

  slackOptions.body = { text: messageBody };

  rp(slackOptions)
    .then(parsedBody => {
      console.log('body: ', parsedBody);
      return true;
    })
    .catch(err => {
      console.log('err: ', err);
      return true;
    });
}

function notifyKinvey(notification, completedCallback) {
  kinveyOptions.body = notification;

  rp(kinveyOptions)
    .then(parsedBody => {
      console.log('body: ', parsedBody);
      completedCallback(responses.success(parsedBody));
    })
    .catch(err => {
      console.log('err: ', err);
      completedCallback(responses.error(err));
    });
}
