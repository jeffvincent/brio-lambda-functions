'use strict';

// libraries
const rp = require('request-promise');
const busboy = require('busboy');

// create a responses object for use with the callback
const responses = {
  success: body => {
    return {
      statusCode: 200,
      body: body.message || "Hello API Event Received"
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
    console.log(event.headers);
    return callback(null, responses.error({ statusCode: 404, message: "Bad request." }))
  }

  // make sure content type header is present
  if (!event.headers['Content-Type']) {
    console.log('Content Type check failed');
    console.log(event.headers);
    return callback(null, responses.error({ statusCode: 404, message: "Bad request." }))
  }

  // decode the body from base64
  let b64string = event.body;
  let buf = new Buffer(b64string, 'base64');

  // set up busboy
  var contentType = event.headers['Content-Type'];
  var bb = new busboy({ headers: { 'content-type': contentType } });
  var fieldVal;

  // since there is only one field in the hellosign message, we can just do this once.
  bb
    .on('field', (fieldname, val) => {
      fieldVal = JSON.parse(val);

      // we only work with certain types of notifications
      let eventsForProcessing = ["signature_request_sent", "signature_request_signed"]
      if (fieldVal.event && eventsForProcessing.indexOf(fieldVal.event.event_type) < 0) {
        console.log(`just a ${fieldVal.event.event_type}, not an event worth hollering about.`)
        return callback(null, responses.success({}))
      }

      // End the lambda function when the send function completes.
      forwardWithAuthentication(fieldVal, function(status) {
        sendInternalNotification(fieldVal, status);
        return callback(null, status);
      });
    })
    .on('finish', () => {
      console.log('Done parsing form!');
    })
    .on('error', err => {
      console.log('failed', err);
    });

  bb.end(buf);
};

function sendInternalNotification(notification, status) {
  var messageBody = `HelloSign event type ${notification.event.event_type} for ${notification.event.signature_request.signatures[0].signer_email_address} posted to Kinvey. Kinvey returned ${status.statusCode}: "${status.body}".`

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
      console.log('parsedBody: ', parsedBody);
      completedCallback(responses.success(parsedBody));
    })
    .catch(err => {
      console.log('err: ', err);
      completedCallback(responses.error(err));
    });
}
