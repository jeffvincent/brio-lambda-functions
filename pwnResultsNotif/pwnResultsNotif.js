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
      new Buffer(process.env.pwn_key + ':' + process.env.pwn_token).toString(
        'base64'
      )
  }
};

// Lambda function
exports.handler = (event, context, callback) => {
  console.log('running event', event);

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
  console.log("result_complete is: ", result_complete);
  let response;
  if (result_complete === 'complete') {
    console.log('results are complete, requesting results.');
    requestResultsData(notification)
      .then(pwnRes => {
        console.log('pwn results: ', pwnRes);
        notification.results_data = pwnRes;
        return notification;
      })
      .then(notification => {
        return notifyKinvey(notification);
      })
      .then(kinveyRes => {
        console.log('status returned from kinvey: ', kinveyRes);
        return sendInternalNotification(notification, kinveyRes);
      })
      .then(slackRes => {
        console.log('response from slack: ', slackRes);
        response = responses.success({});
      })
      .catch(err => {
        console.log('error: ', err);
        response = responses.error(err);
      });
  } else {
    console.log('results incomplete, notifying Kinvey of update.');
    notifyKinvey(notification).then(kinveyRes => {
      console.log('status returned from kinvey: ', kinveyRes);
      response = responses.success({ message: kinveyRes });
    });
  }

  callback(null, responses.success({}));
};

function requestResultsData(notification) {
  pwnOptions.uri = `${pwnURIBase}/customers/${notification.orderId}?include=reconciled_results`;

  return rp(pwnOptions);
}

function sendInternalNotification(notification, kinveyRes) {
  let messageBody = '';
  messageBody += 'PWN event received:';
  messageBody += ' ```';
  messageBody += `type: results received\n`;
  messageBody += `order ID: ${notification.orderId}\n`;
  messageBody += `Kinvey returned \"${kinveyRes}\".`;
  messageBody += '``` ';

  console.log(`notification messageBody: ${messageBody}`);

  slackOptions.body = { text: messageBody };

  return rp(slackOptions);
}

function notifyKinvey(notification) {
  kinveyOptions.body = notification;
  return rp(kinveyOptions);
}
