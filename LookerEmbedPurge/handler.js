'use strict';

const axios = require('axios');
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const USERS_TO_REQUEST = process.env.USERS_TO_REQUEST || 1;

async function deleteEmbedUsers() {
    let response;

    response = await axios.post(
        'https://topcoderpbl.looker.com:19999/api/3.1/login',
        `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`
    ).catch(error => {
        console.log(error);
    });
    const token = response.data.access_token;
    const tokenType = response.data.token_type;

    response = await axios.get(
        `https://topcoderpbl.looker.com:19999/api/3.1/users?page=1&per_page=${USERS_TO_REQUEST}`,
        {
            headers: {
                'Authorization': `${tokenType} ${token}`
            }
        }
    ).catch(error => {
        console.log(error);
    });
    const users = response.data;

    const embedUsers = users.filter(u => !u.credentials_email && u.credentials_embed.length > 0 && !u.email);
    const primaryUsers = users.filter(u => !!u.credentials_email && !!u.email);
    console.log(`Found ${embedUsers.length} embedded users`);
    console.log(`Found ${primaryUsers.length} primary users`);

    await Promise.all(embedUsers.map(user => {
        console.log(`Deleting user with id: ${user.id} ${JSON.stringify(user.credentials_embed)}`);
        return axios.delete(`https://topcoderpbl.looker.com:19999/api/3.1/users/${user.id}`, {
            headers: {
                'Authorization': `${tokenType} ${token}`
            }
        });
    })).catch(error => {
        console.log(error);
    });
}

module.exports.lookerEmbedPurge = async event => {
    await deleteEmbedUsers();
    return {
        statusCode: 200
    };
};



