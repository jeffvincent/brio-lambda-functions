'use strict'

// load libraries and config
const AWS = require("aws-sdk")
AWS.config.region = 'us-east-2'

// create a responses object for use with the callback
const responses = {
  success: body => {
    return {
      statusCode: 200,
      body: body.message
    }
  },
  error: error => {
    return {
      statusCode: error.statusCode || 500,
      body: error.message
    }
  }
}

exports.handler = (event, context, callback) => {
  console.log('received event: ', event);

  if (!event.body) {
    console.log("Event has no body, returning.");
    return callback(null, responses.success({ message: "no body present 👍" }))
  }

  let eventBody = event.body
  console.log("Body of event: ", eventBody)

  // event received: Typeform submission (event_id is best proxy)
  if (eventBody.event_id) {
    console.log("Event is Typeform event.")

    var sns = new AWS.SNS()

    let params = {
      Message: JSON.stringify(eventBody),
      Subject: "SNS message from events receiver",
      TopicArn: process.env.typeformSubmissionArn
    }

    console.log('publishing message: ', params)

    let publish = sns.publish(params).promise()

    publish.then(data => {
      console.log('message published: ', data)
      return callback(null, responses.success({ message: "SNS published" }))
    })
    .catch(err => {
      console.error("error: ", err.stack)
      return callback(null, responses.error({ message: "Failed to publish" }))
    })
  } else if (event.headers['User-Agent'] === 'HelloSign API') {
    console.log("Event is HelloSign event.")

    var sns = new AWS.SNS()

    let params = {
      Message: JSON.stringify(eventBody),
      Subject: "SNS message from events receiver",
      TopicArn: process.env.hellosignEventArn
    }

    console.log('publishing message: ', params)

    let publish = sns.publish(params).promise()

    publish.then(data => {
      console.log('message published: ', data)
      return callback(null, responses.success({ message: "SNS published" }))
    })
    .catch(err => {
      console.error("error: ", err.stack)
      return callback(null, responses.error({ message: "Failed to publish" }))
    })
  } else {
    return callback(null, responses.success({ message: "Nothing to publish" }))
  }
}
