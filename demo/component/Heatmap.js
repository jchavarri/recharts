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
  ctx.fillRect(x, y, width, height);
}

const colorScale = scaleLinear()
  .domain([0, 100])
  .range(['#eee', '#4B3F72']);

function layout(data, width, height) {
  const cellWidth = width / data[0].length;
  const cellHeight = height / data.length;
  return data.map((row, i) =>
    row.map((d, j) => ({
      x: j * cellWidth,
      y: i * cellHeight,
      w: cellWidth,
      h: cellHeight,
      fill: colorScale(d.z)
    }))
  );
}

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
    points: PropTypes.arrayOf(
      PropTypes.shape({
        cx: PropTypes.number,
        cy: PropTypes.number,
        size: PropTypes.number,
        node: PropTypes.shape({
          x: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
          y: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
          z: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
        }),
        payload: PropTypes.any
      })
    ),
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
    const cells = findAllByType(item.props.children, Cell);
    const xAxisDataKey = _.isNil(xAxis.dataKey) ?
      item.props.dataKey : xAxis.dataKey;
    const yAxisDataKey = _.isNil(yAxis.dataKey) ? item.props.dataKey : yAxis.dataKey;
    const zAxisDataKey = zAxis && zAxis.dataKey;
    const defaultRangeZ = zAxis ? zAxis.range : ZAxis.defaultProps.range;
    const defaultZ = defaultRangeZ && defaultRangeZ[0];
    const xBandSize = xAxis.scale.bandwidth ? xAxis.scale.bandwidth() : 0;
    const yBandSize = yAxis.scale.bandwidth ? yAxis.scale.bandwidth() : 0;
    const points = displayedData.map((entry, index) => {
      const x = entry[xAxisDataKey];
      const y = entry[yAxisDataKey];
      const z = (!_.isNil(zAxisDataKey) && entry[zAxisDataKey]) || '-';
      const tooltipPayload = [
        {
          name: xAxis.name || xAxis.dataKey,
          unit: xAxis.unit || '',
          value: x,
          payload: entry,
          dataKey: xAxisDataKey
        },
        {
          name: yAxis.name || yAxis.dataKey,
          unit: yAxis.unit || '',
          value: y,
          payload: entry,
          dataKey: yAxisDataKey
        }
      ];

      if (z !== '-') {
        tooltipPayload.push({
          name: zAxis.name || zAxis.dataKey,
          unit: zAxis.unit || '',
          value: z,
          payload: entry,
          dataKey: zAxisDataKey
        });
      }
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
      const size = z !== '-' ? zAxis.scale(z) : defaultZ;
      const radius = Math.sqrt(Math.max(size, 0) / Math.PI);

      return {
        ...entry,
        cx,
        cy,
        x: cx - radius,
        y: cy - radius,
        xAxis,
        yAxis,
        zAxis,
        width: 2 * radius,
        height: 2 * radius,
        size,
        node: { x, y, z },
        tooltipPayload,
        tooltipPosition: { x: cx, y: cy },
        payload: entry,
        ...(cells && cells[index] && cells[index].props)
      };
    });

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
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
  }

  componentDidMount() {
    this.updateCanvas();
  }

  componentDidUpdate() {
    this.updateCanvas();
  }

  updateCanvas() {
    const { data, width, height } = this.props;
    console.log(this.props);
    const ctx = this.canvas.current.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    const renderedData = layout(data, width, height);

    renderedData.forEach(row =>
      row.forEach(d =>
        rect({
          ctx,
          x: d.x,
          y: d.y,
          width: d.w,
          height: d.h,
          fill: d.fill
        })
      )
    );
  }

  handleMouseMove(event) {
    const { xAxis, yAxis, zAxis, onMouseEnter, left, top } = this.props;
    // TODO: zAxis needs to be passed as props from getComposedData
    const zAxis2 = zAxis || { name: 'keywords' };
    const bounds = event.target.getBoundingClientRect();
    const x = Math.ceil(event.clientX - bounds.left);
    const y = Math.ceil(event.clientY - bounds.top);
    const z = Math.ceil(Math.random() * 2000);
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
    onMouseEnter({
      tooltipPayload,
      tooltipPosition: { x: x + left, y: y + top }
    });
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
  const numRows = 90;
  const numCols = 10;
  const data = [];
  for (let i = 0; i < numRows; i++) {
    const row = [];
    for (let j = 0; j < numCols; j++) {
      row.push({ x: i, y: j, z: Math.random() * 100 });
    }
    data.push(row);
  }
  return data;
}
const data = getData();

export default class Demo extends Component {
  static displayName = 'DemoTreemap';

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
          range={[50, 1200]}
          name='score'
          unit='km'
        />
        <Tooltip />
      </HeatmapChart>
    );
  }
}
