'use strict';
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const axios = require('axios');

const VALID_ISSUERS = process.env.VALID_ISSUERS.replace(/\s+/g, '').split(','); // Get right of spaces, then split
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const HS256_AUDIENCE = process.env.HS256_AUDIENCE;
const TARGET_HOST = process.env.TARGET_HOST

let identifier; // used for more clear logging
let logCount = 0;

module.exports.rs256ToHs256 = async (request) => {
    identifier = generateRandomIdentifier();

    // Log the thing along with params
    let incomingRequest = `Incoming request: ${request.path}`;
    let params = Object.entries(request.queryStringParameters || []).map(entry => {
        return `${entry[0]}=${entry[1]}`;
    }).join('&');
    if (params) incomingRequest += `?${params}`;
    log(incomingRequest);

    // Handle OPTIONS request quickly
    if (request.httpMethod == "OPTIONS") {
        let response = {
            isBase64Encoded: false,
            statusCode: 204,
            statusDescription: "200 OK",
            headers: {
                "Access-Control-Allow-Origin": "*", // Always add this
            }
        }
        if (request.headers) { // Mirror back what they're requesting - needs to ignore case
            for (let headerName of Object.keys(request.headers)) {
                if (headerName.toLowerCase() === 'access-control-request-method') {
                    response.headers['Access-Control-Allow-Methods'] = request.headers[headerName];
                }
                if (headerName.toLowerCase() === 'access-control-request-headers') {
                    response.headers['Access-Control-Allow-Headers'] = request.headers[headerName];
                }
            }
        }
        return wrapResponse(response);
    }

    let targetToken = null;
    let token = request.headers.authorization ? request.headers.authorization.split(' ')[1] : null
    log(`Incoming token: ${token}`);
    if (token) {
        if (isHS256Token(token)) { // If it's already an HS256 token, just pass it through
            targetToken = token;
        } else { // Otherwise, verify the token and then create an HS256 token and use that
            let verifyResult = await validateRS256Token(token);
            if (!verifyResult) {
                return wrapResponse(responseUnAuthorized());
            }
            targetToken = jwt.sign(generateHS256Token(token), PRIVATE_KEY);
        }
    }

    let options = {
        params: request.queryStringParameters
    }
    if (targetToken) {
        options.headers = {Authorization: `Bearer ${targetToken}`}
    }

    let result;
    try {
        result = await axios.get(`https://${TARGET_HOST}${request.path}`, options);
    } catch (err) {
        log(`Proxy request to https://${TARGET_HOST}${request.path} failed`);
        return wrapResponse({
            isBase64Encoded: false,
            statusCode: 502,
            statusDescription: "502 Internal Server Error",
            headers: {"Set-cookie": "cookies", "Content-Type": "application/json"},
        })
    }

    delete result.headers['set-cookie']; // This are causing an issue because it's an array of cookies, I don't think we need them...
    result.headers['Access-Control-Allow-Origin'] = '*'; // Added for CORS

    let response = {
        isBase64Encoded: false,
        statusCode: 200,
        statusDescription: "200 OK",
        headers: result.headers,
        body: JSON.stringify(result.data)
    };
    return wrapResponse(response);
}

function log(message) {
    logCount++;
    console.log(`[${identifier}-${logCount}] ${message}`);
}

function wrapResponse(response) {
    logResponse(response);
    return response;
}

function logResponse(response) {
    log(`${response.statusCode} response: ${JSON.stringify({
        headers: response.headers
    })}`);
}

function responseUnAuthorized() {
    return {
        isBase64Encoded: false,
        statusCode: 401,
        statusDescription: "401 Unauthorized",
        headers: {"Set-cookie": "cookies", "Content-Type": "application/json", "Access-Control-Allow-Origin": '*'}
    }
}

async function validateRS256Token(token) {
    try {
        let decodedToken = jwt.decode(token, {complete: true});
        let kid = decodedToken.header.kid;
        let issuer = decodedToken.payload.iss;
        let cert = (await jwksClient({jwksUri: `${issuer}.well-known/jwks.json`}).getSigningKeyAsync(kid)).publicKey;
        return jwt.verify(token, cert, {
            issuer: VALID_ISSUERS
        });
    } catch (err) {
        return false;
    }
}

function generateHS256Token(rs256Token) {
    let decodedToken = jwt.decode(rs256Token);
    return {
        roles: decodedToken['https://topcoder.com/roles'],
        iss: 'https://api.topcoder.com',
        user_id: 'auth0|proxy',
        exp: decodedToken['exp'],
        aud: HS256_AUDIENCE,
        iat: decodedToken['iat'],
        email: decodedToken['email'],
        sub: decodedToken['sub']
    };
}

function isHS256Token(token) {
    let decodedToken = jwt.decode(token, {complete: true});
    return (decodedToken.header.alg == 'HS256');
}

function generateRandomIdentifier() {
    let length = 10;
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (var i = length; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];
    return result;
}

// For reference an example request from the ALB
let exampleRequest =
    {
        requestContext: {
            elb: {
                targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:409275337247:targetgroup/5e6b9f7f82a31d41cefabba3c0120b17/75f7aafcc5ccaafe'
            }
        },
        httpMethod: 'GET',
        path: '/helloConnectToLambda',
        queryStringParameters: {
            param1: 'one',
            param2: 'two'
        },
        headers: {
            accept: '*/*',
            'accept-encoding': 'gzip, deflate, br',
            authorization: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ik1rWTNNamsxTWpNeU5Ua3dRalkzTmtKR00wRkZPRVl3TmtJd1FqRXlNVUk0TUVFNE9UQkZOZyJ9.eyJodHRwczovL3RvcGNvZGVyLmNvbS9yb2xlcyI6WyJDb25uZWN0IE1hbmFnZXIiLCJUb3Bjb2RlciBVc2VyIiwiYWRtaW5pc3RyYXRvciIsIkxvb2tlciBBZG1pbiIsIkFjY291bnQgRXhlY3V0aXZlIl0sImh0dHBzOi8vdG9wY29kZXIuY29tL3VzZXJJZCI6IjQwMDE2MzU2IiwiaHR0cHM6Ly90b3Bjb2Rlci5jb20vaGFuZGxlIjoibXR3b21leSIsImh0dHBzOi8vdG9wY29kZXIuY29tL3VzZXJfaWQiOiJhdXRoMHw0MDAxNjM1NiIsImh0dHBzOi8vdG9wY29kZXIuY29tL3Rjc3NvIjoiNDAwMTYzNTZ8ZDhjNzQ4ZDg5NDY5ZTQzYjEwYmRmMjg2NWQ4NDFmYWIyYzQ2OGU2NDFlMzZhMDUzZDVhZDcwYTI1M2YyM2NkOCIsImh0dHBzOi8vdG9wY29kZXIuY29tL2FjdGl2ZSI6dHJ1ZSwibmlja25hbWUiOiJtdHdvbWV5IiwibmFtZSI6Im10d29tZXlAdG9wY29kZXIuY29tIiwicGljdHVyZSI6Imh0dHBzOi8vcy5ncmF2YXRhci5jb20vYXZhdGFyLzIyMTU1M2YxNTgxNWI3YTE1MGI5NmUzOTZlM2E3ZmRmP3M9NDgwJnI9cGcmZD1odHRwcyUzQSUyRiUyRmNkbi5hdXRoMC5jb20lMkZhdmF0YXJzJTJGbXQucG5nIiwidXBkYXRlZF9hdCI6IjIwMjAtMTAtMjlUMTk6MjA6MzYuNTIzWiIsImVtYWlsIjoibXR3b21leUB0b3Bjb2Rlci5jb20iLCJpc3MiOiJodHRwczovL2F1dGgudG9wY29kZXIuY29tLyIsInN1YiI6ImF1dGgwfDQwMDE2MzU2IiwiYXVkIjoiVVc3Qmhzbm1BUWgwaXRsNTZnMWpVUGlzQk85R29vd0QiLCJpYXQiOjE2MDQwMTM1OTcsImV4cCI6MTYwNDAxNDE5Nywibm9uY2UiOiJYMmhWTVRSRVJrUnZmbjVQVTJaRVZXZENiMk5aZWxaa1ltOUNPVnBSWTFsdVVXWndVMEp0UkdWSWJnPT0ifQ.WTC7_DaHnl0Y5vCDiZik8iGQ92J3BUITkaDPz_9xun3mNa39uZaFdkFv8hutLe6lMMcmB3dioYB1V5TksvV-FVd1nfDCHgMPrBdQyFNl8XwGsGk2wjJtivLvR4xhoU0XLnclik2xzGUWk1JUVlJSZ4iQs_881BiycR1Yo7AXD-dIkSc2TKwXYvalCT0ScGUh7947YmS7ofw5z8YbrRJbLMp-dOSvYQOoiHSFk4QEykFDqseHgvFcJLdzYRNRK1p6q93fYNMiHtO2D2sICv2e6ltlEs0P6H9tvQFH6bQlWVJJ6q4xdlkuJdtzimVtRltNVZ9u_y61TiMbO1gh1z8ekA',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
            cookie: 'sessionID=f06ec315b9ed3f66d0a86685fdc3818b33a46512; cookies',
            host: 'api.topcoder.com',
            'postman-token': '8e8d14d1-e658-45e9-b077-c03063c13f6e',
            'user-agent': 'PostmanRuntime/7.26.5',
            'x-amzn-trace-id': 'Root=1-5f9b4fc6-501bcf336e096b6721a40e1c',
            'x-forwarded-for': '52.21.65.101',
            'x-forwarded-port': '443',
            'x-forwarded-proto': 'https'
        },
        body: '',
        isBase64Encoded: false
    };
