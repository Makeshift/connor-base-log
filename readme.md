![CircleCI](https://img.shields.io/circleci/build/github/Makeshift/connor-base-log?style=plastic) ![Libraries.io dependency status for GitHub repo](https://img.shields.io/librariesio/github/makeshift/connor-base-log?style=plastic) ![GitHub release](https://img.shields.io/github/release/makeshift/connor-base-log?style=plastic) ![Dependent repos (via libraries.io)](https://img.shields.io/librariesio/dependent-repos/npm/connor-base-log?style=plastic)
# Connor's Base Log Package

I tend to use this boilerplate package for logging. It automatically sets up Sentry logging and some nice sane defaults for logging with or without a TTY. Designed for use with my [default config library](https://github.com/Makeshift/connor-base-config).

### Install
`npm install connor-base-log`

### How to use
```javascript
//Assuming you have a config.js boilerplate from my logging lib
//index.js
const config = require('./config');
const log = require('connor-base-log')(config); //You don't *need* to pass a config option, but this will let you override defaults

log.silly("You may as well just print out every tick", {counter: counter});
log.debug("Okay but you still won't be able to read this");
log.verbose("Eh, this is acceptable in production", {customer_bank_account_no: key});
log.info("A descriptive info which will come up as a breadcrumb on Sentry", {with: extraData});
log.warn("Hm, did you mean to do that? This will show up in Sentry as a warning.", {you: screwedup});
log.error("We're going to spam Sentry with this error");
//Protip: You can set the environment variable LOGGING_LEVEL to change what shows up in your console.
```

#### Lazy Template
```javascript
const config = require('connor-base-config')();
config.load({sentry: {enabled: true, dsn: "https://sentry.makeshift.ninja/"}});
const log = require('./index.js')(config);
```

### Changing defaults
You can change the options by either:
* Overriding them in config.js and passing it to the log on invocation
* Requiring connor-base-config and overwriting with .load in-script
* Setting environment variables, you can see a full list in [the schema](https://github.com/Makeshift/connor-base-config/blob/master/base_schema.json5)