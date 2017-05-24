/* global describe, it, expect, browser */
import { LogCheck } from '../../common/log.specs.js'
import { HexToRgb } from '../../common/hexToRgbConvert.js'
describe('localhost:9000', function () {
  beforeAll(function (done) {
    //  elusive browser object, I will find where you're defined!
    browser
      .url('http://localhost:9000')  //  in the wdio.config.js I have the base url set to my website.
      .call(done);
  });
  afterAll(function (done) {
    browser.end(done);
  });
  describe('Juniper Home test case for lineBarLegend Page', () => {
    it('Should not any SEVER error in console', (done) => {
      var logCheck = new LogCheck()
      var index = logCheck.checkLogs('http://localhost:9000/#lineBarLegend', 'lineBarLegend')
      expect(index).toBe(-1)
      browser.call(done);
    })
    // it('Should Change Graph Show Hide By lineBarLegend legend Select By Legend Bar Label A', (done) => {
    //   var newHexToRgb = new HexToRgb()
    //   if (browser.getValue('[data-accessor="a"] .legend-attribute input') === 'on') {
    //     var color = newHexToRgb.convert(browser.getCssProperty('[data-accessor="a"] .legend-attribute .color-indicator', 'background-color').parsed.hex)
    //     browser.click('[data-accessor="a"] .legend-attribute')
    //     var array = browser.isExisting('#chartBox .svg-wrapper svg .bar-chart rect') ? browser.getAttribute('#chartBox .svg-wrapper svg .bar-chart rect', 'fill') : []
    //     var index = array.indexOf(color)
    //     expect(index).toBe(-1)
    //   }
    //   browser.call(done)
    // })
  })
})



