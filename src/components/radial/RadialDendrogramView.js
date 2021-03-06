/*
 * Copyright (c) 2016 Juniper Networks, Inc. All rights reserved.
 */
import _ from 'lodash'
import * as d3Hierarchy from 'd3-hierarchy'
import * as d3Scale from 'd3-scale'
import * as d3Selection from 'd3-selection'
import * as d3Shape from 'd3-shape'
import ContrailChartsView from 'contrail-charts-view'
import actionman from 'core/Actionman'
import './radial-dendrogram.scss'

export default class RadialDendrogramView extends ContrailChartsView {
  static get dataType () { return 'Serie' }

  constructor (p) {
    super(p)
    this.listenTo(this.model, 'change', this._onDataModelChange)
    this.listenTo(this.config, 'change', this._onConfigModelChange)
    /**
     * Let's bind super _onResize to this. Also .bind returns new function ref.
     * we need to store this for successful removal from window event
     */
    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)
  }

  get tagName () { return 'g' }

  get selectors () {
    return _.extend(super.selectors, {
      node: '.arc',
      link: '.ribbon',
      active: '.active',
    })
  }

  get events () {
    return _.extend(super.events, {
      'click node': '_onClickNode',
      'click link': '_onEvent',
      'dblclick node': '_onEvent',
      'dblclick link': '_onEvent',
      'mousemove node': '_onMousemove',
      'mouseout node': '_onMouseout',
    })
  }

  render () {
    this.resetParams()
    this._calculateDimensions()
    this._prepareHierarchy()
    super.render()
    this._render()
    this._ticking = false
  }

  remove () {
    super.remove()
    window.removeEventListener('resize', this._onResize)
  }

  _calculateDimensions () {
    if (!this.params.width) {
      this.params.width = this._container.getBoundingClientRect().width
    }
    if (this.params.widthDelta) {
      this.params.width += this.params.widthDelta
    }
    if (!this.params.height) {
      this.params.height = this.params.width
    }
    if (!this.params.radius) {
      this.params.radius = this.params.width / 2
    }
    if (!this.params.labelMargin) {
      this.params.labelMargin = 50
    }
    if (!this.params.innerRadius) {
      this.params.innerRadius = this.params.radius - this.params.labelMargin
    }
  }
  /**
  * Build the root node tree structure that will be the input for the d3.hierarchy() layout.
  * We build one more level than configured in order to allow branching of the last configured level.
  */
  _prepareRootNode () {
    const data = this.model.data
    const hierarchyConfig = this.config.get('hierarchyConfig')
    const leafNodes = []
    this.maxDepth = 0
    // The root node of the hierarchy (tree) we are building.
    this.rootNode = {
      name: 'root',
      children: []
    }
    this.valueSum = 0
    _.each(data, (d, index) => {
      // Parsing a data element should return a 2 element array: [source, destination]
      const leafs = hierarchyConfig.parse(d)
      if (leafs[0].value <= 0 || leafs[1].value <= 0) {
        return
      }
      // Check if we havent already created a node pair (link) with the same id.
      const foundLeafNode = _.find(leafNodes, (leafNode) => {
        let found = false
        if (leafNode.id === leafs[0].id) {
          if (leafNode.otherNode.id === leafs[1].id) {
            found = true
          }
        }
        if (leafNode.id === leafs[1].id) {
          if (leafNode.otherNode.id === leafs[0].id) {
            found = true
          }
        }
        return found
      })
      if (foundLeafNode) {
        foundLeafNode.value += (foundLeafNode.id === leafs[0].id) ? leafs[0].value : leafs[1].value
        foundLeafNode.otherNode.value += (foundLeafNode.otherNode.id === leafs[0].id) ? leafs[0].value : leafs[1].value
        this.valueSum += leafs[0].value + leafs[1].value
      } else {
        _.each(leafs, (leaf, i) => {
          // leaf node contains an array of 'names' (ie. the path from root to leaf) and a 'value'
          let children = this.rootNode.children
          let node = null
          const namePath = []
          _.each(leaf.names, (name, depth) => {
            this.maxDepth = Math.max(this.maxDepth, depth + 1)
            if (depth >= this.params.drillDownLevel) {
              return
            }
            namePath.push(name)
            node = _.find(children, (child) => child.name === name)
            if (!node) {
              node = {
                name: name,
                namePath: namePath.slice(0),
                children: [],
                level: depth + 1
              }
              children.push(node)
            }
            children = node.children
          })
          // Now 'node' is one before leaf
          const leafNode = {
            id: leaf.id,
            otherNode: (i === 0) ? leafs[1] : leafs[0],
            value: leaf.value,
            type: (i === 0) ? 'src' : 'dst',
            linkId: leafs[0].id + '-' + leafs[1].id,
          }
          node.children.push(leafNode)
          this.valueSum += leafNode.value
          leafNodes.push(leafNode)
        })
      }
    })
    // console.log('maxDepth: ', this.maxDepth)
    // console.log('rootNode: ', this.rootNode, this.valueSum)
  }

  _prepareHierarchyRootNode () {
    const valueScale = this.config.get('valueScale').domain([0.01, this.valueSum]).range([0, 360])
    this.hierarchyRootNode = d3Hierarchy.hierarchy(this.rootNode).sum((d) => valueScale(d.value)).sort((a, b) => b.value - a.value)
    // console.log('hierarchyRootNode: ', this.hierarchyRootNode)
  }

  _prepareLinks () {
    this.links = []
    let i = 0
    const leaves = this.hierarchyRootNode.leaves()
    _.each(leaves, (leaf, leafIndex) => {
      for (i = leafIndex + 1; i < leaves.length; i++) {
        if (leaf.data.linkId === leaves[i].data.linkId) {
          this.links.push(leaf.path(leaves[i]))
        }
      }
    })
    // console.log('Links: ', this.links)
  }

  _prepareCluster () {
    const extraPaddingPerDepth = _.fill(_.range(this.params.drillDownLevel + 1), 0)
    // Create the cluster layout.
    const cluster = d3Hierarchy.cluster().size([360, this.params.innerRadius])
    // const cluster = d3Hierarchy.tree().size([360, this.params.innerRadius])
    .separation((a, b) => {
      let distance = (a.value + b.value) / 2
      if (a.parent !== b.parent) {
        // Count how many ancestors differ the two nodes.
        const aAncestors = a.ancestors()
        const bAncestors = b.ancestors()
        const differences = Math.max(0, _.difference(aAncestors, bAncestors).length - this.params.parentSeparationDepthThreshold)
        const extraPadding = this.params.parentSeparation * differences * this.hierarchyRootNode.value / 360
        distance += extraPadding
        extraPaddingPerDepth[a.depth] += extraPadding
      }
      return distance
    })
    cluster(this.hierarchyRootNode)
  }

  _prepareCircles () {
    this.circles = []
    const radiusScale = d3Scale.scaleLinear().domain([0, this.params.drillDownLevel]).range([0, this.params.innerRadius]).clamp(true)
    this.hierarchyRootNode.each((n) => {
      if (!n.parent || !n.children) {
        return
      }
      n.y = radiusScale(n.depth)
      if (this.circles.length === n.depth) {
        this.circles[n.depth] = { r: n.y }
      }
    })
    // console.log('circles: ', this.circles)
  }

  /**
  * Positions the arcs.
  */
  _prepareAngleRanges () {
    const depthValueOffset = [0]
    this.hierarchyRootNode.angleRange = [0, 360]
    this.hierarchyRootNode.valueRange = [0, this.hierarchyRootNode.value]
    this.hierarchyRootNode.angleScale = d3Scale.scaleLinear().domain(this.hierarchyRootNode.valueRange).range(this.hierarchyRootNode.angleRange)
    this.hierarchyRootNode.each((n) => {
      if (!n.parent) {
        return
      }
      if (depthValueOffset.length <= n.depth) {
        depthValueOffset.push(0)
      }
      const minValue = depthValueOffset[n.depth]
      const maxValue = minValue + n.value
      depthValueOffset[n.depth] = maxValue
      n.valueRange = [minValue, maxValue]
      let minAngle = n.parent.angleScale(minValue)
      let maxAngle = n.parent.angleScale(maxValue)
      // Shrink the angle range in order to create padding between nodes.
      n.separationValue = 0
      if (n.depth < this.params.parentSeparationDepthThreshold) {
        n.separationValue = this.params.parentSeparationShrinkFactor * (maxAngle - minAngle) / 2
      }
      minAngle += n.separationValue
      maxAngle -= n.separationValue
      n.angleRange = [minAngle, maxAngle]
      n.angleScale = d3Scale.scaleLinear().domain(n.valueRange).range(n.angleRange)
    })
    // Now shrink the parent nodes by the amount of sepration added to children.
    this.hierarchyRootNode.each((n) => {
      if (!n.parent) {
        return
      }
      let separationValueOfChildren = 0
      _.each(n.descendants(), (child) => {
        separationValueOfChildren += child.separationValue
      })
      n.angleRange[0] += separationValueOfChildren
      n.angleRange[1] -= separationValueOfChildren
      n.angleScale = d3Scale.scaleLinear().domain(n.valueRange).range(n.angleRange)
    })
  }

  /**
  * Prepares the connections. A connection consists of a path:
  * - starting from the leaf of the outer edge of the ribbon
  * - moving to just before the root
  * - leaf of the outer edge of the target arc
  * - inner edge to just before the root
  * - inner edge of the source leaf arc.
  */
  _prepareRibbons () {
    this.ribbons = []
    _.each(this.links, (link) => {
      const src = link[0]
      const dst = link[link.length - 1]
      const srcAncestors = src.ancestors()
      const dstAncestors = dst.ancestors()
      const outerPoints = []
      // Outer edge from source leaf to root.
      _.each(srcAncestors, (n, i) => {
        if (n.parent && n.children) {
          let valueStart = n.valueRange[0]
          if (n.children) {
            let found = false
            const leaves = n.leaves()
            _.each(leaves, (child) => {
              if (child === src) {
                found = true
              }
              if (!found) {
                valueStart += child.valueRange[1] - child.valueRange[0]
              }
            })
            if (!found) {
              // console.log('Never found')
            }
          }
          outerPoints.push([n.angleScale(valueStart), n.y])
        }
      })
      // Outer edge from root to target leaf.
      let i = 0
      for (i = dstAncestors.length - 1; i >= 0; i--) {
        let n = dstAncestors[i]
        if (n.parent && n.children) {
          let valueStart = n.valueRange[1]
          if (n.children) {
            let found = false
            let ci = 0
            const leaves = n.leaves()
            for (ci = leaves.length - 1; ci >= 0; ci--) {
              let child = leaves[ci]
              if (child === dst) {
                found = true
              }
              if (!found) {
                valueStart -= child.valueRange[1] - child.valueRange[0]
              }
            }
            if (!found) {
              // console.log('Never found')
            }
          }
          outerPoints.push([n.angleScale(valueStart), n.y])
        }
      }
      // Inner edge from target leaf to root.
      const innerPoints = []
      _.each(dstAncestors, (n, i) => {
        if (n.parent && n.children) {
          let valueStart = n.valueRange[0]
          if (n.children) {
            let found = false
            const leaves = n.leaves()
            _.each(leaves, (child) => {
              if (child === dst) {
                found = true
              }
              if (!found) {
                valueStart += child.valueRange[1] - child.valueRange[0]
              }
            })
            if (!found) {
              // console.log('Never found')
            }
          }
          innerPoints.push([n.angleScale(valueStart), n.y])
        }
      })
      // Inner edge from root to source leaf.
      for (i = srcAncestors.length - 1; i >= 0; i--) {
        let n = srcAncestors[i]
        if (n.parent && n.children) {
          let valueStart = n.valueRange[1]
          if (n.children) {
            let found = false
            let ci = 0
            const leaves = n.leaves()
            for (ci = leaves.length - 1; ci >= 0; ci--) {
              let child = leaves[ci]
              if (child === src) {
                found = true
              }
              if (!found) {
                valueStart -= child.valueRange[1] - child.valueRange[0]
              }
            }
          }
          innerPoints.push([n.angleScale(valueStart), n.y])
        }
      }
      this.ribbons.push({
        outerPoints: outerPoints,
        innerPoints: innerPoints,
        id: src.data.linkId
      })
    })
    // console.log('ribbons: ', this.ribbons)
  }

  _prepareArcs () {
    this.arcs = []
    this.hierarchyRootNode.each((n) => {
      if (!n.parent || !n.children) {
        return
      }
      // Estimate arc length and wheather the label will fit (default letter width is assumed to be 5px).
      n.arcLength = 6 * (n.y - this.params.arcLabelYOffset) * (n.angleRange[1] - n.angleRange[0]) / 360
      n.label = '' + n.data.namePath[n.data.namePath.length - 1]
      n.labelFits = this.params.arcLabelLetterWidth * n.label.length < n.arcLength
      if (this.params.labelFlow === 'perpendicular') {
        n.labelFits = (n.arcLength > 9) && ((this.params.innerRadius / this.params.drillDownLevel) - this.params.arcLabelYOffset > this.params.arcLabelLetterWidth * n.label.length)
      }
      this.arcs.push(n)
    })
  }

  _prepareHierarchy () {
    this._prepareRootNode()
    this._prepareHierarchyRootNode()
    this._prepareLinks()
    this._prepareCluster()
    this._prepareCircles()
    this._prepareAngleRanges()
    this._prepareRibbons()
    this._prepareArcs()
  }

  _render () {
    this.d3.attr('transform', `translate(${this.params.width / 2}, ${this.params.height / 2})`)
    // Circles
    const svgCircles = this.d3.selectAll('.circle').data(this.circles)
    svgCircles.enter().append('circle')
      .attr('class', 'circle')
      .attr('r', 0)
      .merge(svgCircles)
      .attr('r', (d) => d.r + 1)
    svgCircles.exit().remove()

    if (this.params.drawLinks) {
      // Links
      const radialLine = d3Shape.radialLine().angle((d) => d.x / 180 * Math.PI).radius((d) => d.y).curve(this.config.get('curve'))
      const svgLinks = this.d3.selectAll('.link').data(this.links)
      svgLinks.enter().append('path')
        .attr('class', (d) => 'link ' + d[0].data.id)
        .classed(this.selectorClass('interactive'), this.config.hasAction('node'))
        .style('stroke-width', 0)
        .attr('d', (d) => radialLine(d[0]))
      .merge(svgLinks)
        .style('stroke-width', (d) => (d[0].y * Math.sin((d[0].angleRange[1] - d[0].angleRange[0]) * Math.PI / 180)) + 'px')
        .attr('d', radialLine)
    }
    if (this.params.drawRibbons) {
      // Ribbons
      const radialLine = d3Shape.radialLine().angle((d) => d[0] / 180 * Math.PI).radius((d) => d[1]).curve(this.config.get('curve'))
      const svgLinks = this.d3.selectAll('.ribbon').data(this.ribbons, (d) => d.id)
      svgLinks.enter().append('path')
        .attr('class', (d) => 'ribbon' + ((d.active) ? ' active' : ''))
        .merge(svgLinks)// .transition().ease(this.config.get('ease')).duration(this.params.duration)
        .attr('class', (d) => 'ribbon' + ((d.active) ? ' active' : ''))
        .classed(this.selectorClass('interactive'), this.config.hasAction('link'))
        .attr('d', (d) => {
          const outerPath = radialLine(d.outerPoints)
          const innerPath = radialLine(d.innerPoints)
          const innerStitch = 'A' + d.outerPoints[0][1] + ' ' + d.outerPoints[0][1] + ' 0 0 0 '
          const endingStitch = 'A' + d.outerPoints[0][1] + ' ' + d.outerPoints[0][1] + ' 0 0 0 ' + radialLine([d.outerPoints[0]]).substr(1)
          return outerPath + innerStitch + innerPath.substr(1) + endingStitch
        })
      svgLinks.exit().remove()

      // Arc labels
      const arcLabelsAlongArcData = (this.params.labelFlow === 'along-arc') ? this.arcs : []
      const arcLabelsPerpendicularData = (this.params.labelFlow === 'perpendicular') ? this.arcs : []
      // Along Arc
      let svgArcLabels = this.d3.selectAll('.arc-label.along-arc').data(arcLabelsAlongArcData)
      let svgArcLabelsEnter = svgArcLabels.enter().append('text')
        .attr('class', 'arc-label along-arc')
        .attr('x', this.params.arcLabelXOffset)
        .attr('dy', this.params.arcLabelYOffset)
      svgArcLabelsEnter
        .append('textPath')
        .attr('xlink:href', (d) => '#' + d.data.namePath.join('-'))
      let svgArcLabelsEdit = svgArcLabelsEnter.merge(svgArcLabels).transition().ease(this.config.get('ease')).duration(this.params.duration)
        .attr('x', this.params.arcLabelXOffset)
        .attr('dy', this.params.arcLabelYOffset)
      svgArcLabelsEdit.select('textPath')
        .text((d) => (this.params.showArcLabels && d.labelFits) ? d.label : '')
      svgArcLabels.exit().remove()
      // Perpendicular
      svgArcLabels = this.d3.selectAll('.arc-label.perpendicular').data(arcLabelsPerpendicularData)
      svgArcLabelsEnter = svgArcLabels.enter().append('text')
        .attr('class', 'arc-label perpendicular')
        .merge(svgArcLabels)
        .attr('transform', (d) => {
          let alpha = ((d.angleRange[1] + d.angleRange[0]) / 2) + 90
          if ((d.angleRange[1] + d.angleRange[0]) / 2 < 180) {
            alpha -= 180
          }
          const x = (d.y + this.params.arcLabelYOffset) * Math.cos((d.angleRange[1] + d.angleRange[0] - 180) * Math.PI / 360) + this.params.arcLabelXOffset
          const y = (d.y + this.params.arcLabelYOffset) * Math.sin((d.angleRange[1] + d.angleRange[0] - 180) * Math.PI / 360)
          return `translate(${x}, ${y}) rotate(${alpha})`
        })
        .style('text-anchor', (d) => ((d.angleRange[1] + d.angleRange[0]) / 2 < 180) ? 'start' : 'end')
        .text((d) => (this.params.showArcLabels && d.labelFits) ? d.label : '')
      svgArcLabels.exit().remove()

      // Arcs for parent nodes.
      const arcEnter = d3Shape.arc()
        .innerRadius((n) => n.y)
        .outerRadius((n) => n.y + 1)
        .startAngle((n) => Math.PI * n.angleRange[0] / 180)
        .endAngle((n) => Math.PI * n.angleRange[1] / 180)
      const arc = d3Shape.arc()
        .innerRadius((n) => n.y)
        .outerRadius((n) => n.y + this.params.arcWidth)
        .startAngle((n) => Math.PI * n.angleRange[0] / 180)
        .endAngle((n) => Math.PI * n.angleRange[1] / 180)
      const svgArcs = this.d3.selectAll('.arc').data(this.arcs, (d) => d.data.namePath.join('-'))
      svgArcs.enter().append('path')
        .attr('id', (d) => d.data.namePath.join('-'))
        .attr('class', (d) => 'arc arc-' + d.depth)
        .attr('d', arcEnter)
        .merge(svgArcs).transition().ease(this.config.get('ease')).duration(this.params.duration)
        .style('fill', d => this.config.getColor([], this.config.get('levels')[d.depth - 1]))
        .attr('d', arc)
      svgArcs.exit().transition().ease(this.config.get('ease')).duration(this.params.duration)
        .attr('d', arcEnter)
        .remove()
    }
  }

  // Event handlers

  _onDataModelChange () {
    this.render()
  }

  _onConfigModelChange () {
    this.render()
  }

  _onMousemove (d, el) {
    const leaves = d.leaves()
    _.each(this.ribbons, (ribbon) => {
      ribbon.active = Boolean(_.find(leaves, (leaf) => leaf.data.linkId === ribbon.id))
    })
    this._render()
    const [left, top] = d3Selection.mouse(this._container)
    actionman.fire('ShowComponent', this.config.get('tooltip'), {left, top}, d.data)
  }

  _onMouseout (d, el) {
    _.each(this.ribbons, (ribbon) => {
      ribbon.active = false
    })
    this._render()
    actionman.fire('HideComponent', this.config.get('tooltip'))
  }

  _onClickNode (d, el, e) {
    if (d.depth < this.maxDepth && d.depth === this.params.drillDownLevel) {
      // Expand
      this.config.set('drillDownLevel', this.params.drillDownLevel + 1)
    } else if (d.depth < this.params.drillDownLevel) {
      // Collapse
      this.config.set('drillDownLevel', this.params.drillDownLevel - 1)
    }
    el.classList.remove(this.selectorClass('active'))
    super._onEvent(d, el, e)
  }
}
