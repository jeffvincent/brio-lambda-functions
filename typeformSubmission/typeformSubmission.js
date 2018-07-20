'use strict';

// libraries
const rp = require('request-promise');

// create a responses object for use with the callback
const responses = {
  success: body => {
    return {
      statusCode: 200,
      body: body.message || "Typeform Submission Received"
    }
  },
  error: error => {
    return {
      statusCode: error.statusCode || 500,
      body: error.message || "Error in processing"
    }
  }
}

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
  console.log('running event', event)

  if (!event.Records) {
    console.log('no sns data included with message, just returning.')
    return callback(null, responses.success({ message: "incorrect data included with message." }))
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
    sendInternalNotification(parsedMessage)
      .then(res => {
        console.log("new typeform event posted to Slack, response: ", res)
      }).then(() => {
        return forwardWithAuthentication(parsedMessage)
      }).catch(error => {
        console.log(error);
        return callback(null, responses.error({ message: error }))
      })
  }).then(res => {
    console.log('kinvey post response: ', res)
    return res
  }).then(() => {
    return callback(null, responses.success({ message: "Data passed to Kinvey" }))
  }).catch(error => {
    console.log(error)
    return callback(null, responses.error({message: error }))
  })
}

// notification in Slack
function sendInternalNotification(parsedMessage) {
  console.log('posting to Slack: ', parsedMessage);

  let submissionEmail;
  if (parsedMessage.form_response && parsedMessage.form_response.answers) {
    submissionEmail = parsedMessage.form_response.answers.filter( answer => answer.type === 'email' )[0].email;
  }

  let messageBody = ""
  messageBody += "Typeform submission received by AWS:"
  messageBody += " ```"
  messageBody += `event id: ${parsedMessage.event_id}\n`
  if (submissionEmail) {
    messageBody += `email: ${submissionEmail}\n`
  }
  messageBody += "```"

  console.log(`notification messageBody: ${messageBody}`)


  slackOptions.body = { "text": messageBody }

  return rp(slackOptions)
}

// forward request on to Kinvey
function forwardWithAuthentication(parsedMessage) {
  console.log('forwarding to Kinvey: ', parsedMessage)

  kinveyOptions.body = JSON.stringify(parsedMessage)

  return rp(kinveyOptions)
}
