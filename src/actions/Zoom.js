/*
 * Copyright (c) Juniper Networks, Inc. All rights reserved.
 */
import _ from 'lodash'
import Action from '../core/Action'

export default class Zoom extends Action {
  constructor (p) {
    super(p)
    this._deny = false
  }
  /**
   * Zoom is performed by accessor ranges for any updated component be able to respond
   * while zooming by axes will require components to have the same corresponding axes names
   * @param ranges Hash of ranges by accessor
   */
  _execute (componentIds, ranges) {
    const chart = this._registrar
    let components = []
    if (componentIds) components = _.map(componentIds, id => chart.getComponent(id))
    else {
      components.push(...chart.getComponentsByType('CompositeYChart'))
      components.push(...chart.getComponentsByType('Navigation'))
    }

    _.each(components, component => {
      if (component) component.zoom(ranges)
    })
  }
}
