'use strict';

// libraries
//const rp = require('request-promise');

// create a responses object for use with the callback
const responses = {
  success: body => {
    return {
      statusCode: 200,
      body: "Typeform Submission Received"
    };
  },
  error: error => {
    return {
      statusCode: error.statusCode || 500,
      body: error.message
    };
  }
};

// Lambda function
exports.handler = (event, context, callback) => {
  console.log('running event', event);

  //sendInternalNotification(event);

  // End the lambda function when the send function completes.
  //forwardWithAuthentication(event, function(status) {
  //  console.log(`status is ${status}`);
  //  return callback(null, responses.success(status));
  //});

  return callback(null, responses.success());
};

function sendInternalNotification(event) {

  let messageBody = ""
  messageBody += "HelloSign event received:"
  messageBody += " ```"
  messageBody += `event type: ${event_type}\n`
  messageBody += `event hash: ${event_hash}\n`
  messageBody += `signature request id: ${signature_request_id}\n`
  messageBody += `Kinvey returned ${status.statusCode}: \"${status.body.replace(/\./g, '')}\", and sent proper callback.`
  messageBody += "``` "

  console.log(`notification messageBody: ${messageBody}`)

  // slack call options
  var options = {
    port: 443,
    uri: process.env.slackbotUrl,
    method: 'POST',
    body: { "text": messageBody },
    json: true,
    headers: {
      'Content-type': 'application/json'
    }
  }

  rp(options)
    .then(parsedBody => {
      console.log('slack post response: ', parsedBody)
      return true
    })
    .catch(err => {
      console.log('err: ', err)
      return true
    })
};


function forwardWithAuthentication(body, completedCallback) {

  console.log('forwarding!');

  var options = {
    port: 443,
    uri: process.env.hellosignSubmissionUrl,
    method: 'POST',
    body: body,
    json: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization:
        'Basic ' + new Buffer(process.env.kinveyUsername + ':' + process.env.kinveyPassword).toString('base64')
    }
  };

  rp(options)
    .then(parsedBody => {
      console.log('kinvey post response: ', parsedBody);
      completedCallback(responses.success({ message: parsedBody }));
    })
    .catch(err => {
      console.log('err: ', err);
      completedCallback(responses.error(err));
    });
}
