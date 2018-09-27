# Heroku + Platform Events Quick Start for Salesforce ISV's
# Heroku Listener / Dispatcher Component

This example is to demonstrate and serve as a quick start for how large-scale processing can be moved from Salesforce to Heroku.  It consists of four components, each with its own git repository

1. [Business org](https://github.com/sfisv-heroku/pe-quickstart-bizorg): A Salesforce application that keeps track of the activity happening in the Customer org and on Heroku
1. [Customer org](https://github.com/sfisv-heroku/pe-quickstart-custorg): A Salesforce application that generates Platform Events
1. [Listener](https://github.com/sfisv-heroku/pe-quickstart-listener) (this project): A Heroku application that consumes events and dispatches them to the worker
1. [Worker](https://github.com/sfisv-heroku/pe-quickstart-worker): A Heroku application that receives work from the listener and performs processing on data retrieved from the Customer org

They must be configured in the listed order, due to dependencies (Customer Org and Listener dependent on Business Org and Worker dependent on Listener)

This is an experimental project, which means that:

1. It's work in progress
1. We need your feedback
1. Code contributions are welcome

For more information, please go to the Salesforce Partner Community and view the ["Heroku for ISV's - Quick Start" Chatter Group](https://sfdc.co/herokuisvquickstart "https://sfdc.co/herokuisvquickstart")

## Table of Contents

*   Installation
    *   [Installing Heroku Platform Events Quick Start Customer Org using Salesforce DX](#installing-heroku-pe-quickstart-custorg-using-salesforce-dx)
    *   [Installing Heroku Platform Events Quick Start Customer Org using an unlocked package](#installing-pe-quickstart-custorg-using-an-unlocked-package)

## Installation

There are two ways to install the Heroku Platform Events Quick Start Heroku listener/dispatcher component:

*   Using Heroku CLI
*   Using "Deploy to Heroku" button

### Installing Heroku Platform Events Quick Start Customer Org using Heroku CLI

1.  If not already done, get the heroku CLI by following instructions at https://devcenter.heroku.com/articles/heroku-cli

1.  From the command line, login to heroku
    ```
    heroku login
    ```

1.  Clone this repository:

    ```
    git clone https://github.com/sfisv-heroku/pe-quickstart-listener
    cd pe-quickstart-listener
    ```

1.  Modify the .env file to enter your business org credentials
    1. Fill in the config variables as follows:
        - For **BIZ_CLIENT_ID**, enter the Consumer Key of the Salesforce Connected App in your business org
        - For **BIZ_CLIENT_SECRET**, enter the Consumer Secret of the Salesforce Connected App in your business org
        - For **BIZ_USERNAME**, enter the the username of the Salesforce user for your business org
        - For **BIZ_PASSWORD**, enter the the password of the Salesforce user for your business org
        - For **BIZ_TOKEN**, enter the the security token of the Salesforce user for your business org

1.  Execute the script to create a new heroku project and set config parameters
    ```
    ./scripts/initHeroku.sh
    ```
    Note the REDIS_URL that is displayed to the screen when running this command.

1. Set the REDIS_URL config variable on the Heroku app:
    1. Login to the heroku web interface and click on your new app
    1. Take the REDIS_URL from the last step
    1. Click on the "Settings" tab
    1. Click on the "Reveal Config Vars" button
    1. On a new row, enter REDIS_URL in the box on the left, and the value of REDIS_URL from the last step in the box on the right, and click "Add"

### Installing Heroku Platform Events Quick Start Customer Org using "Deploy to Heroku" button (Not complete)

Follow the instructions below to deploy your own instance of the application:

1. Make sure you are logged in to the Heroku Dashboard
1. Click the button below to deploy the example app on Heroku:

    [![Deploy](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy)

1.  Clone this repository:

    ```
    git clone https://github.com/sfisv-heroku/pe-quickstart-listener
    cd pe-quickstart-listener
    ```
