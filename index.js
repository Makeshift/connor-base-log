const defaultConfig = require('connor-base-config');
module.exports = (config = defaultConfig) => {
    const {createLogger, format, transports} = require('winston');
    const {combine, json, timestamp, printf, splat, colorize} = format;
    const tty = require('tty');
    const {SPLAT, LEVEL, MESSAGE} = require('triple-beam');
    let highlight = a => a;
    if (config.get("environment") === "develop" && config.get("colors")) highlight = require('cli-highlight').highlight;
    const Transport = require('winston-transport');
    const stackTrace = require('stack-trace');
    const Sentry = require('@sentry/node');
    if (config.get("useSentry")) {
        console.log("Connecting to " + config.get("sentryDSN"))
        Sentry.init({
            dsn: config.get("sentryDSN"),
            httpProxy: config.get("useProxy") ? config.get("proxy") : null,
            release: `${config.get("package")}-${config.get("version")}`,
            debug: config.get("debug"),
            environment: config.get("environment")
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
    // we make sure to actually log the error, wait for the report to hit Sentry, then exit.
    process.on('unhandledRejection', (err) => {
        console.error(err);
        const client = Sentry.getCurrentHub().getClient();
        if (client) {
            console.log("Flushing Sentry...")
            client.close(2000).then(function () {
                console.log("Sentry flush complete.")
                process.exit(1)
            });
        }
    })

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
            this.emit('logged', info)
            this.sentry.withScope(scope => {
                [...(config.get("sentryTags") || []), ...(config.get("baseSentryTags") || [])].forEach(tag => {
                    scope.setTag(tag, config.get(tag));
                });
                [...(config.get("sentryExtra") || []), ...(config.get("baseSentryExtra") || [])].forEach(extra => {
                    scope.setExtra(extra, config.get(extra));
                })
                config.env({whitelist: ['']});
                let appConfig = config.get();
                ["type", "$0", "_"].forEach(a => delete appConfig[a]);
                scope.setExtra('appConfig', appConfig);
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
                    scope.setExtra('stacktrace', parsedException)
                    this.sentry.captureEvent({
                        message: JSON.parse(info[MESSAGE]).message,
                        transaction: `parsedException[0].fileName`
                        })
                } else {
                    scope.setExtra('stacktrace', parsedException)
                    this.sentry.captureException(exception);
                }
            })

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
            let stacktrace = stackTrace.parse(info[SPLAT][0].trace);
            stacktrace.shift();
            this.sentry.addBreadcrumb({
                category: config.get("task"),
                message: JSON.parse(info[MESSAGE]).message,
                level: info[LEVEL] === "warn" ? "warning" : info[LEVEL],
                stacktrace: stacktrace
            })
            callback();
        }
    }

    function logger() {
        let ts = [];
        if (Sentry && config.get("useSentry")) {
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
                format: config.get("fastLog") ? null : formatForTTY(),
                level: config.get("logLevel"),
                stderrLevels: ["error"],
                consoleWarnLevels: ["warn"]
            }))
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
    //Add trace to each invocation
    Object.keys(exportLogger.constructor.prototype).forEach(func => {
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
    })

    return exportLogger;
}