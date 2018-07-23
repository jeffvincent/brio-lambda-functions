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

// slack call options
const slackOptions = {
  port: 443,
  uri: process.env.slackbotUrl,
  method: 'POST',
  json: true,
  headers: {
    'Content-type': 'application/json'
  }
}

// kinvey call options
const kinveyOptions = {
  port: 443,
  uri: process.env.hellosignSubmissionUrl,
  method: 'POST',
  json: true,
  headers: {
    'Content-Type': 'application/json',
    Authorization:
      'Basic ' + new Buffer(process.env.kinveyUsername + ':' + process.env.kinveyPassword).toString('base64')
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
  let parsedMessage = JSON.parse(snsMessage)
  console.log('json parsed message body: ', parsedMessage.body)

  // decode the body from base64
  let buf = new Buffer(parsedMessage.body, 'base64');

  // set up busboy
  var bb = new busboy({ headers: { 'content-type': parsedMessage.headers['Content-Type'] } });
  var fieldVal;

  // since there is only one field in the hellosign message, we can just do this once.
  bb
    .on('field', (fieldname, val) => {
      fieldVal = JSON.parse(val);

      console.log(`Event hash = ${fieldVal.event.event_hash}`)
      console.log(`Event type = ${fieldVal.event.event_type}`)

      // we only work with certain types of notifications
      let eventsForProcessing = ["signature_request_sent", "signature_request_signed"]
      if (fieldVal.event && eventsForProcessing.indexOf(fieldVal.event.event_type) < 0) {
        console.log(`not a signature req sent or signed event. returning without taking further action.`)
        return callback(null, responses.success({ message: `Processed ${fieldVal.event.event_type} event.` }))
      }

      sendInternalNotification(fieldVal)
        .then(res => {
          console.log(`Slack posted, response: `, res)
          return res
        }).then(() => {
          return forwardWithAuthentication(fieldVal)
        }).then(res => {
          console.log('data posted to kinvey. response: ', res)
          return res
        }).then(() => {
          return callback(null, responses.success({ message: "Data passed to Kinvey." }))
        }).catch(error => {
          console.log(error)
          return callback(null, responses.error({message: error }))
        })
    })
    .on('finish', () => {
      console.log('Done parsing form!')
    })
    .on('error', err => {
      console.log('failed', err)
      return callback(null, responses.error({ message: err }))
    });

  bb.end(buf);
};

function sendInternalNotification(notification) {
  let event = notification.event
  let signature_request_id = notification.signature_request.signature_request_id

  let messageBody = ""
  messageBody += "HelloSign event received:"
  messageBody += " ```"
  messageBody += `event type: ${event.event_type}\n`
  messageBody += `event hash: ${event.event_hash}\n`
  messageBody += `signature request id: ${signature_request_id}\n`
  messageBody += "``` "

  console.log(`notification messageBody: ${messageBody}`)
  slackOptions.body = { "text": messageBody };

  return rp(slackOptions)
}


function forwardWithAuthentication(fieldVal) {
  console.log('forwarding!');

  kinveyOptions.body = fieldVal;

  return rp(kinveyOptions)
}
