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
  // let eventText = JSON.stringify(event, null, 2)

  console.log("Received event, parsed body: ", event.body)

  if (!event.body) {
    return callback(responses.success({ message: "no body present 👍" }))
  }

  //let eventBody = JSON.parse(event.body)
  let eventBody = event.body

  // event received: Typeform submission

  // TODO: replace with proper logic for detecting Typeform (check sender?)
  if (true) {
    var sns = new AWS.SNS()

    let params = {
      Message: JSON.stringify(eventBody),
      Subject: "SNS message from events receiver",
      TopicArn: "arn:aws:sns:us-east-2:458939526827:brio-typeform-submission"
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
