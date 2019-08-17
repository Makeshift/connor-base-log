const config = require('./config.js')
const log = require('./index.js')(config);

async function testFunction() {
	log.info("Test Info", {some: "data"});
    log.warn("Test Warn", {test: "testing"});
    log.error("Error Test", {some: "Stuff"});
    log.error("Passed Exception", {trace: new Error()})
    try {
    	JSON.parse("this will fail to parese{}[][[]")
    } catch (e) {
    	console.log(e)
    	log.error("Failed something", {trace: e})
    }
    let empty = config.get("empty");
    console.log(empty)
}

// function differentTestFunction() {
//     log.warn("otherTest", {asdf: "test2"})
// }
//
// async function anotherTestFunction() {
//     log.info("test3", {fasd: "asfasf"})
// }

testFunction();