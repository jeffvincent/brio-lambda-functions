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
  uri: process.env.typeformSubmissionUrl,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization':
      'Basic ' + new Buffer(process.env.kinveyUsername + ':' + process.env.kinveyPassword).toString('base64')
  }
}

// Lambda function
exports.handler = (event, context, callback) => {
  console.log('running event')

  if (!event.Records && !event.body) {
    console.log('no data included with message, just returning.')
    return callback(null, responses.success({ message: "no data included with message." }))
  }

  let snsMessage = event.Records[0].Sns.Message
  console.log('sns message: ', snsMessage)

  new Promise((resolve, reject) => {
    try {
      resolve(JSON.parse(snsMessage))
    } catch (error) {
      throw new Error("SNS message is not JSON.")
    }
  }).then(parsedMessage => {
    forwardWithAuthentication(parsedMessage)
    .then(res => {
      console.log('kinvey post response: ', res)
      return res
    }).then(res => {
      return sendInternalNotification(parsedMessage, res)
    }).then(() => {
      console.log("Slack posted.")
      return callback(null, responses.success({ message: "Data passed to Kinvey" }))
    }).catch(error => {
      console.log(error)
      return callback(null, responses.error({message: error }))
    })
  }).catch(error => {
    console.log(error)
    return callback(null, responses.error({ message: error }))
  })
}

// forward request on to Kinvey
function forwardWithAuthentication(parsedMessage) {
  console.log('forwarding to Kinvey: ', parsedMessage)

  kinveyOptions.body = parsedMessage

  return rp(kinveyOptions)
}

// notification in Slack
function sendInternalNotification(parsedMessage, status) {
  console.log('posting to Slack: ', parsedMessage);
  let submissionEmail;
  if (parsedMessage.form_response && parsedMessage.form_response.answers) {
    submissionEmail = parsedMessage.form_response.answers.filter( answer => answer.type === 'email' )[0].email;
  }

  let messageBody = ""
  messageBody += "Typeform submission received by AWS:"
  messageBody += " ```"
  messageBody += `event id: ${parsedMessage.eventId}\n`
  if (submissionEmail) {
    messageBody += `email: ${submissionEmail}\n`
  }
  messageBody += `event passed to Kinvey and returned status: ${status.message}`
  messageBody += "```"

  console.log(`notification messageBody: ${messageBody}`)


  slackOptions.body = { "text": messageBody }

  return rp(slackOptions)
}
