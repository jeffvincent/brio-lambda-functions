# lambda-functions

code for all AWS lambda functions

## functions included

**events receiver**

handles all incoming webhooks from typeform and hellosign. invokes SNS messages to send data along to more lambda functions.

**typeform submission**

handles new typeform submission events. sends them along to kinvey endpoint.

**hellosign webhook**

handles all hellosign events. pulls JSON out of multipart-form body, passes proper events along to kinvey endpoint.

**pwn approval notification**

handles all PWN order approval posts. sends relevant data to kinvey endpoint.

**pwn results notification**

handles all PWN results posts. Requests full results if results are complete. Sends relevant data to kinvey endpoint.

## how to use

- each function has it's own npm instantiation.
- add necessary libraries to `package.json` and run `npm install`.
- zip up and upload to AWS as needed.

## issues / improvements

Many. A few:

1. timeouts are a potential issue. SNS was put in place to handle that, but functions that await Kinvey responses can still have to wait a long time.
2. naming is inconsistent.
3. code structure and order is also inconsistent - some methods are used asynchronously, others are kept synchronous.
