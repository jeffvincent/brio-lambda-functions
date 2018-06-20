'use strict'

// this function receives an order approved notification from PWN Health,
// then notifies Kinvey of the approval status change.

// libraries
const rp = require('request-promise')

// define kinvey custom endpoint
const kinveyEndpoint = 'https://kvy-us2-baas.kinvey.com/rpc/kid_Hy6yPLNkm/custom/pwn-order-update'

// create a responses object for use with the callback
const responses = {
  success: body => {
    return {
      statusCode: body.statusCode || 200,
      body: JSON.stringify(body)
    };
  },
  error: error => {
    return {
      statusCode: error.statusCode || 500,
      body: error.message
    };
  }
}

// Lambda function
exports.handler = (event, context, callback) => {
  console.log('running event')

  // these are required query params by the API gateway
  let token = event['queryStringParameters']['token']
  let id = event['queryStringParameters']['id']
  let status = event['queryStringParameters']['status']

  // ensure query param values are legit
  if (token != process.env.authentication_token) {
    console.log("attempt to call with incorrect token.")
    return callback(null, responses.error({ code: 401, message: `incorrect token ${token}` }))
  }

  let acceptableStatusList = ['approved', 'rejected']
  if ( acceptableStatusList.indexOf(status) < 0 ) {
    console.log(`function called with incorrect status: ${status}`)
    return callback(null, responses.error({ code: 400, message: `status not recognized: ${status}` }))
  }

  //
  // ok, move forward
  //
  let notification = {
    orderId: id,
    status: status
  }

  // notify Kinvey of PWN order status change
  notifyKinvey(notification, function(status) {
    return callback(null, status)
  })
}

function notifyKinvey(notification, completedCallback) {
  // Kinvey call options
  var options = {
    port: 443,
    uri: kinveyEndpoint,
    method: 'POST',
    body: notification,
    json: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization:
        'Basic ' + new Buffer(process.env.kinvey_username + ':' + process.env.kinvey_password).toString('base64')
    }
  }

  rp(options)
    .then(parsedBody => {
      console.log('body: ', parsedBody)
      completedCallback(responses.success(parsedBody))
    })
    .catch(err => {
      console.log('err: ', err)
      completedCallback(responses.error(err))
    })
}
