'use strict';

// libraries
const rp = require('request-promise');

// create a responses object for use with the callback
const responses = {
  success: body => {
    return {
      statusCode: 200,
      body: body.message || "Typeform Submission Received"
    };
  },
  error: error => {
    return {
      statusCode: error.statusCode || 500,
      body: error.message || "Error in processing"
    };
  }
};

// Lambda function
exports.handler = (event, context, callback) => {
  console.log('running event')

  if (!event.Records && !event.body) {
    console.log('no data included with message, just returning.')
    return callback(null, responses.success({ message: "no data included with message." }))
  }

  let snsMessage = event.Records[0].Sns.Message
  console.log('sns message: ', snsMessage)

  let parsedMessage = JSON.parse(snsMessage)

  // send the event body along to Kinvey
  forwardWithAuthentication(parsedMessage, function(status) {
    console.log('forwarded and heres the status: ', status)

    // notify Slack we've received a new Typeform
    sendInternalNotification(parsedMessage, status, function(error) {
      if (error) {
        console.log('Slack notification error: ', error)
        callback(null, responses.error({ message: error }))
      }

      console.log("Slack posted.")
      callback(null, responses.success({ message: "Data passed to Kinvey" }))
    })
  })
};

function sendInternalNotification(parsedMessage, status, notificationCallback) {
  console.log('posting to Slack: ', parsedMessage);
  console.log('event_id: ', parsedMessage.event_id);
  console.log('["event_id"]: ', parsedMessage["event_id"]);
  let eventId = parsedMessage.event_id;
  let submissionEmail = null;
  if (parsedMessage.form_response && parsedMessage.form_response.answers) {
    submissionEmail = parsedMessage.form_response.answers.filter( answer => answer.type === 'email' )[0].email;
  }

  let messageBody = ""
  messageBody += "Typeform submission received by AWS:"
  messageBody += " ```"
  messageBody += `event id: ${eventId}\n`
  if (submissionEmail) {
    messageBody += `email: ${submissionEmail}\n`
  }
  messageBody += `event passed to Kinvey and returned status: ${status.message}`
  messageBody += "```"

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
      console.log('slack post response: ', parsedBody);
      return notificationCallback(null);
    })
    .catch(err => {
      console.log('slack post err: ', err);
      return notificationCallback(err);
    })
};


function forwardWithAuthentication(parsedMessage, forwardingCallback) {
  console.log('forwarding to Kinvey: ', parsedMessage);

  var options = {
    port: 443,
    uri: process.env.typeformSubmissionUrl,
    method: 'POST',
    body: parsedMessage,
    headers: {
      'Content-Type': 'application/json',
      Authorization:
        'Basic ' + new Buffer(process.env.kinveyUsername + ':' + process.env.kinveyPassword).toString('base64')
    }
  };

  rp(options)
    .then(parsedBody => {
      console.log('kinvey post response: ', parsedBody);
      let res = { message: parsedBody };
      return forwardingCallback(res);
    })
    .catch(err => {
      console.log('kinvey post err: ', err);
      let res = { error: true, message: err };
      return forwardingCallback(res);
    });
}
