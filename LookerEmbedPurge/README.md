# Deploy
Deploy with `serverless deploy`

# Required Env Vars
You must define the following ENV var in the AWS lambda _**after**_ deployment
* `CLIENT_ID` Looker client ID
* `CLIENT_SECRET` Looker secret
* `USERS_TO_REQUEST` Number of users to request with the looker API call

In other words, do the deployment, then go to the lambda in the AWS web console and set the ENV vars. This only needs to be done the first time you deploy or if you remove it completely and then redeploy.

# Notes
1. The function will retrieve the number of requested users (USERS_TO_REQUEST), filter them for only "embeded" users, then delete all those embeded users.
1. The function is scheduled to run daily - see the `events` section in `serverless.yml`.
