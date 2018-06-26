'use strict';

// libraries
const rp = require('request-promise');
const busboy = require('busboy');

// create a responses object for use with the callback
const responses = {
  success: body => {
    return {
      statusCode: 200,
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

// Lambda function
exports.handler = (event, context, callback) => {
  console.log('running event');

  // make sure hellosign user agent is present
  if (event.headers['User-Agent'] != 'HelloSign API') {
    console.log('User Agent check failed');
    return callback(null, responses.error({ statusCode: 404, message: "Bad request." }))
  }

  var contentType = event.headers['Content-Type'] || event.headers['content-type'];
  var bb = new busboy({ headers: { 'content-type': contentType } });
  var fieldVal;

  // since there is only one field in the hellosign message, we can just do this once.
  bb
    .on('field', (fieldname, val) => {
      fieldVal = JSON.parse(val);

      // End the lambda function when the send function completes.
      forwardWithAuthentication(fieldVal, function(status) {
        sendInternalNotification(null, status);
        callback(null, status);
      });
    })
    .on('finish', () => {
      console.log('Done parsing form!');
    })
    .on('error', err => {
      console.log('failed', err);
    });

  bb.end(event.body);
};

function sendInternalNotification(notification, status) {
  var messageBody = `HelloSign submission posted to Kinvey. Kinvey returned ${status.statusCode}: "${status.body}".`

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
      console.log('body: ', parsedBody)
      return true
    })
    .catch(err => {
      console.log('err: ', err)
      return true
    })
};


function forwardWithAuthentication(body, completedCallback) {
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
      console.log('parsedBody: ', parsedBody);
      completedCallback(responses.success(parsedBody));
    })
    .catch(err => {
      console.log('err: ', err);
      completedCallback(responses.error(err));
    });
}
