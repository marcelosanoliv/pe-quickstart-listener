#! /bin/bash
# Sets the confir params for heroku
# Uses command line parameter and env variables to populate fields in the template file.

# Source the env file to get values for the business org credentials
. ./.env

# Check for variables from env file
if [ -z $BIZ_USERNAME ]
then
	echo "Credentials must be defined in .env file"
	exit 1
fi

#Create a new heroku app, with a random number in its name to be unique
NUMBER=$RANDOM
APPNAME="pe-quickstart-"
APPNAME+=${NUMBER}
LISTENER_APPNAME+="-listener"
WORKER_APPNAME=+="-worker"
heroku create ${LISTENER_APPNAME}

#Attach heroku to git and push the code
#git push heroku master

#Add redis (starting with hobby) on to the new heroku app
heroku addons:create heroku-redis:hobby-dev -a ${LISTENER_APPNAME}
NEW_REDIS_URL='heroku config | grep REDIS'
echo ${NEW_REDIS_URL}

# Create shell for new heroku template file
touch scripts/setHerokuConfig.sh
chmod 751 scripts/setHerokuConfig.sh

# Substitute field in heroku config file, using template file
sed -e "s/BIZ_ORG_ID/${BIZ_ORG_ID}/g" \
	-e "s/BIZ_URL/${BIZ_URL}/g" \
	-e "s/BIZ_ENV_TYPE/${BIZ_ENV_TYPE}/g" \
	-e "s/BIZ_USERNAME/${BIZ_USERNAME}/g" \
	-e "s/BIZ_PASSWORD/${BIZ_PASSWORD}/g" \
	-e "s/BIZ_TOKEN/${BIZ_TOKEN}/g" \
	-e "s/BIZ_CLIENT_ID/${BIZ_CLIENT_ID}/g" \
	-e "s/BIZ_CLIENT_SECRET/${BIZ_CLIENT_SECRET}/g" \
	-e "s/APPNAME/${WORKER_APPNAME}/g" \
#	-e "s/REDIS_URL/${NEW_REDIS_URL}/g" \
	scripts/herokuConfig.template > ./scripts/setHerokuConfig.sh

# Then execute it
./scripts/setHerokuConfig.sh