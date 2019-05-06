import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { CartesianGrid, Tooltip } from 'recharts';
import _ from 'lodash';
import { scaleLinear } from 'd3-scale';
import pureRender from '../../src/util/PureRender';
import Cell from '../../src/component/Cell';
import XAxis from '../../src/cartesian/XAxis';
import YAxis from '../../src/cartesian/YAxis';
import ZAxis from '../../src/cartesian/ZAxis';
import generateCategoricalChart from '../../src/chart/generateCategoricalChart';
import { formatAxisMap } from '../../src/util/CartesianUtils';
import { getOffset, calculateChartCoordinate } from '../../src/util/DOMUtils';
import { getAnyElementOfObject } from '../../src/util/DataUtils';
import {
  PRESENTATION_ATTRIBUTES,
  EVENT_ATTRIBUTES,
  LEGEND_TYPES,
  isSsr,
  findAllByType,
  findChildByType
} from '../../src/util/ReactUtils';
import { getCateCoordinateOfLine } from '../../src/util/ChartUtils';

function rect(props) {
  const { ctx, x, y, width, height, fill } = props;
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  ctx.strokeRect(x, y, width, height);
  ctx.fillRect(x, y, width, height);
}

const colorScale = scaleLinear()
  .domain([0, 100])
  .range(['#eee', '#4B3F72']);

@pureRender
class Heatmap extends Component {
  static displayName = 'Heatmap';

  static propTypes = {
    ...EVENT_ATTRIBUTES,
    ...PRESENTATION_ATTRIBUTES,

    xAxisId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    yAxisId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    zAxisId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    line: PropTypes.oneOfType([
      PropTypes.bool,
      PropTypes.object,
      PropTypes.func,
      PropTypes.element
    ]),
    lineType: PropTypes.oneOf(['fitting', 'joint']),
    lineJointType: PropTypes.oneOfType([
      PropTypes.oneOf([
        'basis',
        'basisClosed',
        'basisOpen',
        'linear',
        'linearClosed',
        'natural',
        'monotoneX',
        'monotoneY',
        'monotone',
        'step',
        'stepBefore',
        'stepAfter'
      ]),
      PropTypes.func
    ]),
    legendType: PropTypes.oneOf(LEGEND_TYPES),
    className: PropTypes.string,
    name: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),

    activeIndex: PropTypes.number,
    activeShape: PropTypes.oneOfType([
      PropTypes.object,
      PropTypes.func,
      PropTypes.element
    ]),
    shape: PropTypes.oneOfType([
      PropTypes.oneOf([
        'circle',
        'cross',
        'diamond',
        'square',
        'star',
        'triangle',
        'wye'
      ]),
      PropTypes.element,
      PropTypes.func
    ]),
    points: PropTypes.object,
    hide: PropTypes.bool,

    isAnimationActive: PropTypes.bool,
    animationId: PropTypes.number,
    animationBegin: PropTypes.number,
    animationDuration: PropTypes.number,
    animationEasing: PropTypes.oneOf([
      'ease',
      'ease-in',
      'ease-out',
      'ease-in-out',
      'linear'
    ])
  };

  static defaultProps = {
    xAxisId: 0,
    yAxisId: 0,
    zAxisId: 0,
    legendType: 'circle',
    lineType: 'joint',
    lineJointType: 'linear',
    data: [],
    shape: 'circle',
    hide: false,

    isAnimationActive: !isSsr(),
    animationBegin: 0,
    animationDuration: 400,
    animationEasing: 'linear'
  };

  /**
   * Compose the data of each group
   * @param  {Object} xAxis   The configuration of x-axis
   * @param  {Object} yAxis   The configuration of y-axis
   * @param  {String} dataKey The unique key of a group
   * @return {Array}  Composed data
   */
  static getComposedData = ({
    xAxis,
    yAxis,
    zAxis,
    item,
    displayedData,
    onItemMouseLeave,
    onItemMouseEnter,
    offset,
    xAxisTicks
  }) => {
    const xAxisDataKey = _.isNil(xAxis.dataKey) ?
      item.props.dataKey : xAxis.dataKey;
    const yAxisDataKey = _.isNil(yAxis.dataKey) ? item.props.dataKey : yAxis.dataKey;
    const zAxisDataKey = zAxis && zAxis.dataKey;
    const xBandSize = xAxis.scale.bandwidth ? xAxis.scale.bandwidth() : 0;
    const yBandSize = yAxis.scale.bandwidth ? yAxis.scale.bandwidth() : 0;

    const points = displayedData.reduce((acc, entry, index) => {
      const z = (!_.isNil(zAxisDataKey) && entry[zAxisDataKey]) || '-';

      const cx = getCateCoordinateOfLine({
        axis: xAxis,
        ticks: xAxisTicks,
        bandSize: xBandSize,
        entry,
        index,
        dataKey: xAxisDataKey
      });
      const cy = getCateCoordinateOfLine({
        axis: yAxis,
        ticks: xAxisTicks,
        bandSize: yBandSize,
        entry,
        index,
        dataKey: yAxisDataKey
      });

      const x = entry[xAxisDataKey];
      const y = entry[yAxisDataKey];
      if (acc[y] === undefined) {
        acc[y] = {};
      }
      if (acc[y][x] === undefined) {
        acc[y][x] = {};
      }
      acc[y][x] = { cx, cy, z };
      return acc;
    }, {});

    return {
      onMouseLeave: onItemMouseLeave,
      onMouseEnter: onItemMouseEnter,
      points,
      ...offset
    };
  };

  constructor(props) {
    super(props);

    this.canvas = React.createRef();
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.onEnterSquareDebounced = _.throttle(this.onEnterSquareDebounced, 160);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
  }

  componentDidMount() {
    this.updateCanvas();
  }

  componentDidUpdate() {
    this.updateCanvas();
  }

  updateCanvas() {
    const { left, top, points, width, height, xAxis, yAxis } = this.props;
    const ctx = this.canvas.current.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const cellWidth = width / xAxis.niceTicks[xAxis.niceTicks.length - 1];
    const cellHeight = height / yAxis.niceTicks[yAxis.niceTicks.length - 1];
    console.log(points);
    Object.keys(points).forEach(row =>
      Object.keys(points[row]).forEach(col => {
        const d = points[row][col];
        rect({
          ctx,
          x: d.cx - left,
          y: d.cy - top,
          width: cellWidth,
          height: cellHeight,
          fill: colorScale(d.z)
        });
      })
    );
  }

  handleMouseMove(event) {
    const { xAxis, yAxis, zAxis, left, top, width, height, points } = this.props;
    // TODO: zAxis needs to be passed as props from getComposedData
    const zAxis2 = zAxis || { name: 'keywords' };
    const bounds = event.target.getBoundingClientRect();
    const cellWidth = width / xAxis.niceTicks[xAxis.niceTicks.length - 1];
    const cellHeight = height / yAxis.niceTicks[yAxis.niceTicks.length - 1];
    const xCoord = Math.ceil(event.clientX - bounds.left);
    const yCoord = Math.ceil(event.clientY - bounds.top);

    const containerOffset = getOffset(event.target);
    const e = calculateChartCoordinate(event, containerOffset);

    const xScale = xAxis.scale;
    const yScale = yAxis.scale;
    const x = xScale && xScale.invert ? Math.floor(xScale.invert(e.chartX + left)) : null;
    const y = yScale && yScale.invert ? Math.floor(yScale.invert(e.chartY + top)) : null;

    const z = points[y] && points[y][x] && points[y][x].z;
    if (z !== undefined && this.hoveredX !== x || this.hoveredY !== y) {
      this.hoveredX = x;
      this.hoveredY = y;
      const tooltipPayload = [
        {
          name: xAxis.name || xAxis.dataKey,
          unit: xAxis.unit || '',
          value: x,
          payload: null,
          dataKey: null
        },
        {
          name: yAxis.name || yAxis.dataKey,
          unit: yAxis.unit || '',
          value: y,
          payload: null,
          dataKey: null
        },
        {
          name: zAxis2.name || zAxis2.dataKey,
          unit: zAxis2.unit || '',
          value: z,
          payload: null,
          dataKey: null
        }
      ];
      this.onEnterSquareDebounced({
        tooltipPayload,
        tooltipPosition: { x: xCoord + left, y: yCoord + top }
      });
    }
  }

  onEnterSquareDebounced(payload) {
    this.props.onMouseEnter(payload);
  }

  handleMouseLeave() {
    const { onMouseLeave } = this.props;
    onMouseLeave();
  }

  render() {
    const { left, top, width, height } = this.props;

    return (
      <foreignObject width={width} height={height} x={left} y={top}>
        <canvas
          ref={this.canvas}
          width={width}
          height={height}
          onMouseMove={this.handleMouseMove}
          onMouseLeave={this.handleMouseLeave}
        />
      </foreignObject>
    );
  }
}

const HeatmapChart = generateCategoricalChart({
  chartName: 'HeatmapChart',
  GraphicalChild: Heatmap,
  eventType: 'single',
  axisComponents: [
    { axisType: 'xAxis', AxisComp: XAxis },
    { axisType: 'yAxis', AxisComp: YAxis },
    { axisType: 'zAxis', AxisComp: ZAxis }
  ],
  formatAxisMap
});

function getData() {
  const numCols = 185;
  const numRows = 100;
  const data = [];
  for (let i = 0; i < numCols; i++) {
    for (let j = 0; j < numRows; j++) {
      data.push({ x: i, y: j, z: i === numCols - 1 ? 80 : Math.random() * 5 * j * 3 + 2 });
    }
  }
  return data;
}
const data = getData();

export default class Demo extends Component {
  static displayName = 'DemoHeatmap';

  render() {
    return (
      <HeatmapChart
        width={900}
        height={400}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5
        }}
      >
        <Heatmap data={data} />
        <XAxis type='number' dataKey='x' name='date' />
        <YAxis type='number' dataKey='y' name='position' />
        <ZAxis
          type='number'
          dataKey='z'
          range={[0, 1200]}
          name='score'
          unit='km'
        />
        <Tooltip />
      </HeatmapChart>
    );
  }
}
