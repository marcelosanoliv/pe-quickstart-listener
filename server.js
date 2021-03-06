// Copyright (c) 2018-present, salesforce.com, inc. All rights reserved
// Licensed under BSD 3-Clause - see LICENSE.txt or git.io/sfdc-license

/**
 * Module dependencies
 */
const nforce = require('nforce');
const redis = require('redis');
const express = require('express');
const app = express();
const server = require('http').Server(app);
const faye = require('faye');
const extensions = require('./fayeReplayExtension');
const request = require('request');
const crypto = require('crypto');

/**
 * Setup environment variables, with defaults in case not present 
 */
let PORT = process.env.PORT || 3000;
let REDIS_URL = process.env.REDIS_URL;
let SF_ORG_ID = process.env.SF_ORG_ID;
let SF_INSTANCE_URL = process.env.SF_INSTANCE_URL || "https://na53.lightning.force.com";
let SF_ENV_TYPE = process.env.SF_ENV_TYPE || "production";
let SF_CLIENT_ID = process.env.SF_CLIENT_ID;
let SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET;
let SF_USER_NAME = process.env.SF_USER_NAME;
let SF_USER_PASSWORD = process.env.SF_USER_PASSWORD;
let SF_SECURITY_TOKEN = process.env.SF_SECURITY_TOKEN;
let PE_NAMESPACE = process.env.PE_NAMESPACE || "";
let PE_DATA_CHANNEL = process.env.PE_DATA_CHANNEL || "BatchEvent__e";
let PE_ORGINFO_CHANNEL = process.env.PE_ORGINFO_CHANNEL || "/event/UpdatedCustomerOrgInfo__e";
let PE_REPLAY_DEFAULT = process.env.PE_REPLAY_DEFAULT || "-2";
let PE_REPLAY_OVERRIDE = process.env.PE_REPLAY_OVERRIDE || "FALSE";
let PE_SUBSCRIPTION_TYPE = process.env.PE_SUBSCRIPTION_TYPE || "Subscription";
let BASE_URL = process.env.WORKER_URL || 'http://pe-quickstart-<num>-worker.herokuapp.com/';
let WORKER_URL = BASE_URL + 'processEvent';
let WORKER_COUNT = process.env.WORKER_COUNT || "1";
let ENCODED_KEY = process.env.ENCODED_KEY;

console.log('REDIS_URL:' + REDIS_URL);
console.log('SF_INSTANCE_URL:' + SF_INSTANCE_URL);
console.log('SF_ENV_TYPE:' + SF_ENV_TYPE);
console.log('SF_CLIENT_ID:' + SF_CLIENT_ID);
console.log('SF_CLIENT_SECRET:' + SF_CLIENT_SECRET);
console.log('SF_USER_NAME:' + SF_USER_NAME);
console.log('PE_DATA_CHANNEL:' + PE_DATA_CHANNEL);
console.log('PE_ORGINFO_CHANNEL:' + PE_ORGINFO_CHANNEL);
console.log('PE_REPLAY_DEFAULT:' + PE_REPLAY_DEFAULT);
console.log('PE_REPLAY_OVERRIDE:' + PE_REPLAY_OVERRIDE);
console.log('WORKER_URL:' + WORKER_URL);
console.log('WORKER_COUNT:' + WORKER_COUNT);

/**
 * Initialize redis
 */
let redisClient = redis.createClient(REDIS_URL);

redisClient.on("error", function (err) {
  console.log("Redis error "+ err);
});

/**
 * Initialize faye subscriptions
 */
let subscriptions = new Map();

/**
 * Initialize server
 */
server.listen(PORT, () => console.log(`Express server listening on ${PORT}`));

let bayeux = new faye.NodeAdapter({mount: '/faye', timeout: 45});
bayeux.attach(server);
bayeux.on('disconnect', function(clientId) {
    console.log('Bayeux server disconnect');
});

/**
 * Initialize SAML connector, for acquiting an access_token to be used when connecting to Salesforce
 */
const constants = {
    ENCODED_KEY: ENCODED_KEY
}

/**
 * Establish connection to the ISV Business org, query it to get customer orgs, and listen for events from them
 */
let bizConnInfo = {
    clientId: SF_CLIENT_ID,
    clientSecret: SF_CLIENT_SECRET,
    environment: SF_ENV_TYPE,
    instance_url: SF_INSTANCE_URL,
    redirectUri: 'https://login.salesforce.com/services/oauth2/callback',
    refresh_token: '',
    username: SF_USER_NAME,
    password: SF_USER_PASSWORD,
    token: SF_SECURITY_TOKEN
}

let bizOrg = '';

//Connect to bizOrg to get connection info for customer org(s)
let bizOrgPromise = login(bizConnInfo); //getConnection(bizConnInfo);
bizOrgPromise.then(function(result) {
    bizOrg = result;
    console.log("Successfully authenticated to business org");

    var custOrgInfoPromise = getCustomerOrgInfo(bizOrg);
    custOrgInfoPromise.then(function(result) {
        console.log("Successfully connected to business org to get customer org info.");
        result.forEach((customerOrg) => {
            let custConnInfoString = customerOrg.get('ConnectionInfo__c');
            console.log('Customer org connection info: ' + custConnInfoString);
            try {
                let custConnInfo = JSON.parse(custConnInfoString);
                initializeCustomerOrg(custConnInfo);
            } catch (err) {
                console.log('Customer org connection error: ' + err);
            }
        }, function(err) {
            console.log(err);
        })
    });

    initializeForPlatformEvents(SF_ORG_ID, bizOrg, PE_ORGINFO_CHANNEL);

}, function(err) {
    console.log(err);
})

/**
 * Get nforce connection to Salesforce using a useragent flow to authenticate 
 */
 function login(connInfo) {
    let org = nforce.createConnection({
      clientId: connInfo.clientId,
      clientSecret: connInfo.clientSecret,
      environment: connInfo.environment,
      instance_url: connInfo.instance_url,
      redirectUri: connInfo.redirectUri,
      mode: 'single',
      autoRefresh: true
    });

    return new Promise(function(resolve, reject) {
      // Do async auth
      console.log('Attempting to connect with Connection Info: ' + JSON.stringify(connInfo) + ' and org: ' + JSON.stringify(org));
      console.log('ClientId: ' + connInfo.clientId);
      org.authenticate({username: connInfo.username, password: connInfo.password, securityToken: connInfo.token}, err => {
        if (err) {
            console.error("Salesforce authentication error" + err);
            reject(err);
        } else {
            console.log("Salesforce authentication successful");
            console.log('Org URL: ' + org.oauth.instance_url);
            console.log('Access token: ' + org.oauth.access_token);
            console.log('nforce org: ' + JSON.stringify(org));
            resolve(org);
        }
      });
    })
};

/**
 * Call into Salesforce to fetch the customer org connection info
 */
 function getCustomerOrgInfo(bizOrg) {

    var q = 'SELECT Org_Id__c, ConnectionInfo__c FROM Customer_Org_Info__c WHERE IsActive__c = true';

    return new Promise(function(resolve, reject) {
        // Do async query
        bizOrg.query({ query: q }, function(err, resp){ // nforce format
            if(!err && resp.records) {
                console.log('Array of records returned: ' + JSON.stringify(resp.records));
                resolve(resp.records);
            } else {
                console.error("Salesforce query error");
                console.error(err);
                reject(err);               
            }
        });
    });

};

/**
 * Login to customer org and initialize subscription
 */
 function initializeCustomerOrg(custConnInfo) {

        const samlData = {
            audience: custConnInfo.instance_url,
            issuer: custConnInfo.clientId,
            subject: custConnInfo.username,
            action: custConnInfo.instance_url + "/services/oauth2/token",
            timestamp: Date.now(),
            random: Math.random()
        }

        let samlConnector = require('./sfdc_saml_connector')({request, crypto, constants})

        let oauthPromise = samlConnector.connect(samlData);
        oauthPromise.then(function(result) {
            console.log("Successful SAML connection");
            console.log("Result: " + result);
            let oauth = JSON.parse(result);
            console.log("Access token: " + oauth.access_token);
            if (oauth.access_token) {
                let custOrg = getPreauthenticatedConnection(custConnInfo, oauth);
                console.log("Created customer org: " + JSON.stringify(custOrg));
                var channel = custConnInfo.namespace_prefix ? custConnInfo.namespace_prefix + "__" + PE_DATA_CHANNEL : PE_DATA_CHANNEL;
                initializeForPlatformEvents(custConnInfo.orgId, custOrg, "/event/" + channel, custConnInfo.namespace_prefix);
                // Publish that the connection succeeded
                publishCustomerOrgActivityEvent(bizOrg, custConnInfo.orgId, PE_SUBSCRIPTION_TYPE, 1);
            } else {
                // Publish that the connection failed
                publishCustomerOrgActivityEvent(bizOrg, custConnInfo.orgId, PE_SUBSCRIPTION_TYPE, 0);                
            }
        }, function(err) {
            console.log("Error while connecting to org (" + custConnInfo.orgId + "): " + err);
            publishCustomerOrgActivityEvent(bizOrg, custConnInfo.orgId, PE_SUBSCRIPTION_TYPE, 0);
        })
}

/**
 * Get connection to Salesforce using nforce
 */
 function getPreauthenticatedConnection(connInfo, oauth) {

    console.log('connInfo: ' + JSON.stringify(connInfo));
    let org = nforce.createConnection({
      clientId: connInfo.clientId,
      environment: connInfo.environment,
      instance_url: connInfo.instance_url,
      redirectUri: connInfo.redirectUri,
      autoRefresh: true
    });

    org.oauth = oauth;
    console.log('nforce org: ' + JSON.stringify(org));

    return org;
}

/**
 * Initialize faye, with replay handling
 * and subscribe to events
 */
function initializeForPlatformEvents(orgId, orgConn, channel, namespace) {
    var client = new faye.Client(orgConn.oauth.instance_url + '/cometd/42.0/');
    client.setHeader('Authorization', 'OAuth ' + orgConn.oauth.access_token);
    var subscription;

    // Subsctibe to one or more channels
    subscription = subscribeToEvents(client, channel, namespace);
    subscriptions[orgId] = subscription;

    // Save connection info for org into redis
    redisClient.hmset(orgId, "conn_string", JSON.stringify(orgConn), "access_token", orgConn.oauth.access_token,function (err, reply) {
        if(err) {
            console.log('Redis set err: ' + err);
        }
        if (reply) {
            console.log('Redis set reply ' + reply);
            console.log('Successfully set conn_string: ' + JSON.stringify(orgConn) + ' and access_token: ' + orgConn.oauth.access_token + ' for org: ' + orgId);
        }
    });

    var replayIdPromise = getReplayId(orgId);
    replayIdPromise.then(function(result) {
        console.log("Successfully got replay id to use.");
        
        // Register replay extension
        var replayExtension = extensions.FayeReplayExtension;
        replayExtension.setChannel(channel);

        // Set replay extension
        console.log('About to set replay id to: ' + result);
        replayExtension.setReplay(result);
        client.addExtension(replayExtension);

    }, function(err) {
        console.log(err);
    })
};

/**
 * Get nforce connection to Salesforce using a useragent flow to authenticate 
 */
 function getReplayId(orgId) {
    // Set default value of replay Id to use, in case there is no value or it is too old,
    var replayId = PE_REPLAY_DEFAULT;

    return new Promise(function(resolve, reject) {

        if (PE_REPLAY_OVERRIDE == "TRUE") {
            console.log('Replay override is true, so set replay to default');
            resolve(replayId);  
        }

        // Check in redis to see if there is another replay Id to use, which was from within the last 24 hours
        redisClient.exists(orgId,function(err,reply) {
            if (err) { 
                console.log('Redis err while checking for existence of org Id: ' + err + '.  Set replay to default.');
            } else {
                if(reply === 1) {
                    console.log("Key exists in redis: " + orgId);
                    redisClient.hgetall(orgId, function(err, orgInfo) {
                        if (err) { 
                            console.log('Redis err while getting org info: ' + err + '.  Set replay to default.');
                            resolve(replayId);  
                        } else {
                            console.log('Org information retrieved from redis: ' + JSON.stringify(orgInfo));
                            var yesterday = new Date(new Date().getTime() - (24 * 60 * 60 * 1000));
                            if (orgInfo.lastEventTime > yesterday) {
                                console.log('Last event was within 24 hours ago: ' + orgInfo.lastEventTime);
                                if (orgInfo.lastReplayId) {
                                    replayId = orgInfo.lastReplayId;
                                    resolve(orgInfo.lastReplayId);
                                    console.log('Last replay id used: ' + orgInfo.lastReplayId);
                                } else {
                                    console.log('Did not find value of last replay Id in redis.  Set replay to default.');
                                    resolve(replayId);  
                                }
                            } else {
                                console.log('Last event was older than 24 hours ago: ' + orgInfo.lastEventTime + '.  Set replay to default.');
                                resolve(replayId);   
                            }
                        }
                    });
                } else {
                    console.log("Key doesn't exists.  Set replay to default.");
                    resolve(replayId);  
                }
            }
        });
    })
};

/**
 * Subscribe to a single topic. 
 */
function subscribeToEvents(client, channel, namespace) {
    return client.subscribe(channel, function(message) {

        // Get parameters
        var eventId = message.event.replayId;

        // Log message
        var messageSummary = 'Notification '
            + 'on channel: ' + JSON.stringify(channel)
            + ', with Payload: ' + JSON.stringify(message.payload)
            + ', and Replay Id: ' + JSON.stringify(eventId);
            // + '. Full message: ' + JSON.stringify(message);
        console.log(messageSummary);

        var eventData = '';
        try {
            // Data will be RecordIds or ConnectionInfo, depending on channel
            eventData = namespace ? message.payload[namespace + "__Data__c"] : message.payload["Data__c"];
        } catch (ex) {
            console.log("DATA ERROR: No Data__c present in payload.  Cannot process event.");
        }

        // Add to redis to track last ID received
        var orgId = namespace ? message.payload[namespace + "__OrgId__c"] : message.payload["OrgId__c"];
        if (orgId) {
            if (channel == PE_ORGINFO_CHANNEL) {
                // Update the subscription to the org with the new connectionInfo
                updateOrgSubscription(orgId, eventData, message.payload.IsActive__c);  // eventData = ConnectionIInfo
            } else {
                // Set the lastReplayId and lastEventTime in redis
                redisClient.hmset(orgId, "lastReplayId", eventId, "lastEventTime", Date.now(), function(err, reply) {
                    if (err) {
                        console.log('Redis set err: ' + err);
                        throw err;
                    } else {
                        console.log('Set redis lastReplayId to: ' + eventId + ' for org: ' + orgId);
                    }
                });

                // Send to worker, with recordIds, and publish the increased event counter
                sendToWorker(orgId, eventId, eventData, namespace);  // eventData = recordIds
                publishCounterIncreasedEvent(bizOrg, orgId);
            }
        } else {
            console.log("DATA ERROR: No OrgId__c present in payload.  Cannot process event.");
        }
    
    });
};

/**
 * Update (activate or deactivate) a single subscription 
 */
function updateOrgSubscription(orgId, custConnInfoString, active) {

    // Login and subscribe to events
    console.log('Updating subscription to org: ' + orgId + ' and setting active to: ' + active);
    //console.log('Customer org connection info: ' + custConnInfoString);

    var oldSubscription = subscriptions[orgId];
    if (oldSubscription) {
        oldSubscription.cancel();
        console.log('Removed old subscription for org: ' + orgId);
    }

    if (active) {
        try {
            let custConnInfo = JSON.parse(custConnInfoString);
            initializeCustomerOrg(custConnInfo);
            console.log('Added new subscription for org: ' + orgId);
        } catch (err) {
            console.log('Customer org info not valid JSON.  Error: ' + err);
        }
    }
}

/**
 * Make external call to the worker
 * (Http call, passing eventID)
 */
function sendToWorker(orgId, eventId, recordIds, namespace) {

    // Set the headers
    var headers = {
        'User-Agent':       'Super Agent/0.0.1',
        'Content-Type':     'application/json'
    }

    const postInfo = {
        uri: WORKER_URL,
        method: 'POST',
        headers: headers,
        form: {
            orgId: orgId, 
            eventId:eventId,
            recordIds: recordIds,
            namespace: namespace
        },
        json: true  // JSON stringifies the body automatically
    }
    //console.log('Connection Info: ' + JSON.stringify(connInfo) + '. and Post Info: ' + JSON.stringify(postInfo));

    request(postInfo, function (error, response, body) {
      if (error) {
        console.error(`Error: Got error calling worker: ${error.message}`);
        publishErrorEvent(bizOrg, orgId, eventId, 'Got error calling worker: ' + error.message);
      } else {
        if(response.statusCode != 200){
            console.error(`Error: Got status when calling worker: ${response.statusCode}`);
        } else {
            // Request was successful
            console.log("Success: Got response from worker: " + body);

            // Add to redis that this event was sent to worker.  Use combined key with <orgID>-<eventId>
            let redisKey = orgId + '-' + eventId;
            redisClient.hmset(redisKey, "status", "Sent", "last_update", Date.now(), "record_ids", recordIds, "attempt_count", 0, function(err, reply) {
                if (err) {
                    console.log('Redis set err: ' + err);
                    throw err;
                } else {
                    console.log('Set status for ' + redisKey + ' to: Sent');
                }
            });
        }
      }
    })

}

/**
 * Publish a Platform Event to indicate that there has been activity (subscruption or event) for the supplied org
 */
 function publishCustomerOrgActivityEvent(org, orgId, type, success) {

    let event = nforce.createSObject('CustomerOrgActivity__e');  
    event.set('OrgId__c', orgId);
    event.set('Type__c', type);
    event.set('Success__c', success);

    org.insert({sobject: event}, err => {
        if (err) {
            console.error("Failed to publish CustomerOrgActivity__e of type " + type + " for orgId: " + orgId + ".  Error: " + err);
        } else {
            console.log("CustomerOrgActivity__e of type " + type + " published for orgId: " + orgId + " with success: " + success);
        }
    });

};

/**
 * Publish a Platform Event to indicate that the number of events has increased for the supplied org
 */
 function publishCounterIncreasedEvent(org, orgId) {

    let event = nforce.createSObject('EventCountIncreased__e');  
    event.set('Org_Id__c', orgId);

    org.insert({sobject: event}, err => {
        if (err) {
            console.error(err);
        } else {
            console.log("EventCountIncreased__e published for orgId: " + orgId);
        }
    });

};

/**
 * Publish a Platform Event to indicate that the number of events has increased for the supplied org
 */
 function publishErrorEvent(org, orgId, eventId, error) {

    let event = nforce.createSObject('EventHandlingError__e');  
    event.set('Org_Id__c', orgId);

    org.insert({sobject: event}, err => {
        if (err) {
            console.error(err);
        } else {
            console.log("EventHandlingError__e published for orgId: " + orgId);
        }
    });

};