'use strict';

// libraries
const rp = require('request-promise');
const busboy = require('busboy');

// create a responses object for use with the callback
const responses = {
  success: body => {
    return {
      statusCode: 200,
      body: body
    };
  },
  error: error => {
    return {
      statusCode: error.code || 500,
      body: JSON.stringify(error.message)
    };
  }
};

// Lambda function
exports.handler = (event, context, callback) => {
  console.log('running event');

  // make sure hellosign user agent is present
  if (event.headers['User-Agent'] != 'HelloSign API') {
    console.log('User Agent check failed');
    return callback(responses.error({ statusCode: 404, message: "Bad request." }))
  }

  var contentType = event.headers['Content-Type'] || event.headers['content-type'];
  var bb = new busboy({ headers: { 'content-type': contentType } });
  var fieldVal;

  // since there is only one field in the hellosign message, we can just do this once.
  bb
    .on('field', (fieldname, val) => {
      fieldVal = JSON.parse(val);

      // End the lambda function when the send function completes.
      forwardWithAuthentication(fieldVal, function(status) {
        callback(null, status);
      });
    })
    .on('finish', () => {
      console.log('Done parsing form!');
    })
    .on('error', err => {
      console.log('failed', err);
    });

  bb.end(event.body);
};

function forwardWithAuthentication(body, completedCallback) {
  var options = {
    port: 443,
    uri: process.env.hellosign_submission_url,
    method: 'POST',
    body: body,
    json: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization:
        'Basic ' + new Buffer(process.env.kinvey_username + ':' + process.env.kinvey_password).toString('base64')
    }
  };

  rp(options)
    .then(parsedBody => {
      console.log('parsedBody: ', parsedBody);
      completedCallback(responses.success(parsedBody));
    })
    .catch(err => {
      console.log('err: ', err);
      completedCallback(responses.error(err));
    });
}
