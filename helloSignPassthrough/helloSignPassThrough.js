'use strict';

// libraries
const rp = require('request-promise');
const busboy = require('busboy');

// Kinvey Credentials
// TODO: we could store these as environment variables
const username = 'brio';
const password = 'systems';

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
  // TODO: make sure hellosign user agent is present
  console.log('running event');

  var contentType =
    event.headers['Content-Type'] || event.headers['content-type'];
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
  // Kinvey call options
  var options = {
    port: 443,
    uri:
      'https://kvy-us2-baas.kinvey.com/appdata/kid_Hy6yPLNkm/hellosign-submissions',
    method: 'POST',
    body: body,
    json: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization:
        'Basic ' + new Buffer(username + ':' + password).toString('base64')
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
