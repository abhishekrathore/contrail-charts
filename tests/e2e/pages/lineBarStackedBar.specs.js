// /* global describe, it, expect */
// import { LogCheck } from '../../common/log.specs.js'
// describe('localhost:9000', function () {
//   beforeAll(function (done) {
//     //  elusive browser object, I will find where you're defined!
//     browser
//       .url('http://localhost:9000')  //  in the wdio.config.js I have the base url set to my website.
//       .call(done);
//   });
//   afterAll(function (done) {
//     browser.end(done);
//   });
//   describe('Juniper Home test case for lineBarStackedBar Page', () => {
//     it('Should not any SEVER error in console', (done) => {
//       var logCheck = new LogCheck()
//       var index = logCheck.checkLogs('http://localhost:9000/#lineBarStackedBar', 'lineBarStackedBar')
//       expect(index).toBe(-1)
//       browser.call(done);
//     })
//   })
// })

