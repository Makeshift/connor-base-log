const config = require('connor-base-config');

config.use('log', {
    type: "literal",
    store: {
        "sentryDSN": "test", //Make sure you make a new Sentry DSN and add it here
        "useProxy": true, //Defaults to http://proxy:3128, can be overridden with the 'proxy' var in this object
        "sentryTags": ["clientName", "projectName"], //Extra list of config variables that should be added to the Sentry tags when sending in an error payload
        "sentryExtra": ["clientConfig"], //Extra config fields that should be added to the Sentry payload
        "clientConfig": {},
        "clientName": "Client",
        "projectName": "Project"
    }
}).env({
    parseValues: true,
    readOnly: false
});

module.exports = config;