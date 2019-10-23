const config = require('connor-base-config').addToSchema(require("./log_spec.json5"));

const {createLogger, format, transports} = require('winston');
const {combine, json, timestamp, printf, splat, colorize} = format;
const tty = require('tty');
const {SPLAT, LEVEL, MESSAGE} = require('triple-beam');
let highlight = a => a;
if (config.get("environment") === "develop" && config.get("log.colors")) highlight = require('cli-highlight').highlight;
const Transport = require('winston-transport');
const stackTrace = require('stack-trace');
const Sentry = require('@sentry/node');
if (config.get("log.sentry.enabled")) {
    console.log("Connecting to " + config.get("log.sentry.dsn"));
    Sentry.init({
        dsn: config.get("log.sentry.dsn"),
        httpProxy: config.get("proxy.enabled") ? config.get("proxy.address") : null,
        release: config.get("metadata.release"),
        debug: config.get("log.sentry.debug"),
        environment: config.get("environment.level"),
        attachStacktrace: true, //This sometimes doesn't capture stacktraces, so we have another process that captures them for every message
        captureUnhandledRejections: false //We do it ourselves while adding a ton more data
    });
}

function formatForTTY() {
    if (tty.isatty(process.stdout.fd)) {
        return combine(colorize(), timestamp(), json(), myFormat)
    } else {
        return combine(timestamp(), splat(), json());
    }
}

//Since node doesn't auto-exit on unhandled rejections, and Sentry swallows them if you don't handle them,
// we make sure to actually log the error, wait for the report to hit Sentry, then exit. Node will start exiting on unhandled
// rejections soon anyway, so we may as well start doing it now
process.on('unhandledRejection', (err) => {
    console.log(err)
    exportLogger.error("Unhandled promise rejection", {trace: err});
    const client = Sentry.getCurrentHub().getClient();
    if (client) {
        console.log("Flushing Sentry...");
        client.close(2000).then(function () {
            console.log("Sentry flush complete.");
            process.exit(1)
        });
    }
});

const myFormat = printf(info => {
    return `${info.timestamp} ${info.level}: ${info.message} - ${info[SPLAT] ? highlight(JSON.stringify(info[SPLAT], null, 2), {language: 'json', ignoreIllegals: true}) : null}`;
});

//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
class sentryErrorTransport extends Transport {
    constructor(opts) {
        super(opts);
        this.name = opts.name || 'SentryErrorTransport';
        this.setMaxListeners(30);
        this.sentry = opts.sentry;
    }

    log(info, callback) {
        this.emit('logged', info);
        this.sentry.withScope(scope => {
            //Extra tags
            config.get("log.sentry.tags").forEach(tag => {
                scope.setTag(tag, config.get(tag));
            });
            config.get("log.sentry.extra").forEach(extra => {
                scope.setExtra(extra, config.get(extra));
            });
            let appConfig = config.getProperties();
            //["type", "$0", "_"].forEach(a => delete appConfig[a]);
            scope.setExtra('config', appConfig);
            scope.setExtra('details', {
                level: info[LEVEL],
                splat: info && info[SPLAT] && info[SPLAT][0] ? info[SPLAT][0] : null,
                timestamp: info.timestamp,
                message: JSON.parse(info[MESSAGE]).message,
            });
            let level = info[LEVEL] === "warn" ? "warning" : info[LEVEL];
            scope.setLevel(level);
            let exception = info[SPLAT][0].trace;
            exception.name = exception.name && exception.name === "Error" ? JSON.parse(info[MESSAGE]).message : exception.name;
            let parsedException = stackTrace.parse(exception);
            if (parsedException[0].fileName === __filename) {
                parsedException.shift();
                scope.setExtra('stacktrace', parsedException);
                this.sentry.captureEvent({
                    message: JSON.parse(info[MESSAGE]).message,
                    transaction: `${parsedException[0].fileName} in ${parsedException[0].functionName} (${parsedException[0].lineNumber}:${parsedException[0].columnNumber})`
                })
            } else {
                scope.setExtra('stacktrace', parsedException);
                this.sentry.captureException(exception);
            }
        });

        callback();
    }
}

class sentryBreadcrumbs extends Transport {
    constructor(opts) {
        super(opts);
        this.name = opts.name || 'SentryBreadcrumbTransport';
        this.setMaxListeners(30);
        this.sentry = opts.sentry;
    }

    log(info, callback) {
        this.emit('logged', info);
        this.sentry.addBreadcrumb({
            category: config.get("job.name"),
            message: JSON.parse(info[MESSAGE]).message,
            level: info[LEVEL] === "warn" ? "warning" : info[LEVEL]
        });
        callback();
    }
}

function logger() {
    let ts = [];
    if (Sentry && config.get("log.sentry.enabled")) {
        ts.push(new sentryErrorTransport({
                format: combine(timestamp(), splat(), json()),
                timestamp: true,
                showLevel: true,
                level: "warn",
                sentry: Sentry
            }),
            new sentryBreadcrumbs({
                format: combine(timestamp(), splat(), json()),
                timestamp: true,
                showLevel: true,
                level: "info",
                sentry: Sentry
            }))
    }
    ts.push(new transports.Console({
        timestamp: true,
        showLevel: true,
        format: formatForTTY(),
        level: config.get("log.level"),
        stderrLevels: ["error"]
    }));
    return createLogger({
        transports: ts
    });
}

let exportLogger = logger();

class Traces extends Error {
    constructor() {
        super();
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name
    }
}

//Add trace to warn/error invocations
Object.keys(exportLogger.constructor.prototype).forEach(func => {
    if (["warn", "error"].includes(func)) {
        let original = exportLogger.constructor.prototype[func];
        if (typeof original === "function") {
            exportLogger.constructor.prototype[func] = (name, data) => {
                if (!data) data = {};
                if (!data.trace) {
                    data.trace = new Traces()
                }
                original(name, data);
            }
        }
    }
});

module.exports = exportLogger;