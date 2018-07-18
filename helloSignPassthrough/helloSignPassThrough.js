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
  console.log('running event', event);

  if (!event.Records) {
    console.log('no sns data included with message, just returning.')
    return callback(null, responses.success({ message: "incorrect data included with message." }))
  }

  let snsMessage = event.Records[0].Sns.Message
  console.log('sns message: ', snsMessage)

  // decode the body from base64
  let buf = new Buffer(snsMessage, 'base64');

  // set up busboy
  var contentType = event.headers['Content-Type'];
  var bb = new busboy({ headers: { 'content-type': contentType } });
  var fieldVal;

  // since there is only one field in the hellosign message, we can just do this once.
  bb
    .on('field', (fieldname, val) => {
      fieldVal = JSON.parse(val);

      console.log(`Event hash = ${fieldVal.event.event_hash}`)

      // we only work with certain types of notifications
      let eventsForProcessing = ["signature_request_sent", "signature_request_signed"]
      if (fieldVal.event && eventsForProcessing.indexOf(fieldVal.event.event_type) < 0) {
        console.log(`just a ${fieldVal.event.event_type}, not an event worth hollering about.`)
        return callback(null, responses.success({ message: `Processed ${fieldVal.event.event_type} event.` }))
      }

      forwardWithAuthentication(fieldVal)
        .then(res => {
          console.log('kinvey post response: ', res)
          return res
        }).then(res => {
          return sendInternalNotification(fieldVal, res)
        }).then(() => {
          console.log("Slack posted.")
          return callback(null, responses.success({ message: "Data passed to Kinvey." }))
        }).catch(error => {
          console.log(error)
          return callback(null, responses.error({message: error }))
        })
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
  let event_hash = notification.event.event_hash
  let event_type = notification.event.event_type
  let signature_request_id = notification.signature_request.signature_request_id

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

  return rp(options)
}


function forwardWithAuthentication(fieldVal) {

  console.log('forwarding!');

  var options = {
    port: 443,
    uri: process.env.hellosignSubmissionUrl,
    method: 'POST',
    body: fieldVal,
    json: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization:
        'Basic ' + new Buffer(process.env.kinveyUsername + ':' + process.env.kinveyPassword).toString('base64')
    }
  };

  return rp(options)
}
