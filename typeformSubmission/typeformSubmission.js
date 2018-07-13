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
  console.log('running event');

  // End the lambda function when the send function completes.
  forwardWithAuthentication(event, function(status) {
    console.log("status: ", status);
    if (status.error) {
      return callback(null, responses.error(status));
    }
    if (event.body) {
      sendInternalNotification(event, status);
    }
    return callback(null, responses.success(status));
  });
};

function sendInternalNotification(event, status) {

  let eventBody = JSON.parse(event.body);
  console.log("eventBody form response answers ", eventBody.form_response.answers);

  let submissionEmail = eventBody.form_response.answers.filter( answer => answer.type === 'email' )[0].email;

  let messageBody = ""
  messageBody += "Typeform submission received:"
  messageBody += " ```"
  messageBody += `event id: ${event.event_id}\n`
  messageBody += `email: ${submissionEmail}\n`
  messageBody += `Kinvey returned ${status}.`
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
    uri: process.env.typeformSubmissionUrl,
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
      completedCallback({ message: parsedBody });
    })
    .catch(err => {
      console.log('err: ', err);
      completedCallback({ error: true, message: err });
    });
}
