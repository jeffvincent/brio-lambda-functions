'use strict'

// this function receives an order approved notification from PWN Health,
// then notifies Kinvey of the approval status change.

// libraries
const rp = require('request-promise')
const parser = require('xml2json')

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
  let result = event['queryStringParameters']['result'].toLowerCase()
  let result_complete = event['queryStringParameters']['result_complete'].toLowerCase()

  //
  // ensure query param values are legit
  //
  if (token != process.env.authentication_token) {
    console.log("attempt to call with incorrect token.")
    return callback(null, responses.error({ code: 401, message: `incorrect token ${token}` }))
  }

  let acceptableResults = 'released normal'.split(' ')
  if ( acceptableResults.indexOf(result) < 0 ) {
    console.log(`function called with incorrect result: ${result}`)
    return callback(null, responses.error({ code: 400, message: `result type not recognized: ${result}` }))
  }

  let acceptableResultCompleteTypes = 'incomplete complete'.split(' ')
  if ( acceptableResultCompleteTypes.indexOf(result_complete) < 0 ) {
    console.log(`function called with incorrect result_complete type: ${result_complete}`)
    return callback(null, responses.error({ code: 400, message: `result_complete type not recognized: ${result_complete}` }))
  }

  //
  // ok, move forward
  //
  let notification = {
    orderId: id,
    result,
    result_complete
  }

  // if the results are complete, request the results and append them onto the notification
  if (result_complete === 'complete') {
    requestResultsData(notification, function(data, err) {
      if (err) { return callback(null, responses.error(err)) }

      return callback(null, responses.success(notification))

      notifyKinvey(notification, function(status) {
        return callback(null, status)
      })
    })
  } else {
    // notify Kinvey of PWN order status change
    notifyKinvey(notification, function(status) {
      return callback(null, status)
    })
  }
}

function requestResultsData(notification, requestCallback) {
  // pwn health request options
  var options = {
    port: 443,
    uri: `https://api16-staging.pwnhealth.com/customers/${notification.orderId}?include=reconciled_results`,
    method: 'GET',
    headers: {
      Authorization:
        'Basic ' + new Buffer(process.env.pwn_key + ':' + process.env.pwn_token).toString('base64')
    }
  }

  rp(options)
    .then(parsedBody => {
      console.log('body: ', parsedBody)
      notification.results_data = parser.toJson(parsedBody)
      requestCallback(parsedBody, null)
    })
    .catch(err => {
      console.log('err: ', err)
      requestCallback(null, responses.error(err))
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
