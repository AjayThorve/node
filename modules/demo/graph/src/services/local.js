// Copyright (c) 2021, NVIDIA CORPORATION.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {clampSliceArgs as clamp} from '@nvidia/cuda';
import {DataFrame, Float32, Series, Uint32, Uint64, Uint8} from '@nvidia/cudf';
import {GraphCOO} from '@nvidia/cugraph';

export default async function* loadGraphData(props = {}) {

  const layoutParams = {
    simulating:         { name: 'simulating',          val: true },
    autoCenter:         { name: 'auto-center',         val: true },
    outboundAttraction: { name: 'outbound attraction', val: true },
    linLogMode:         { name: 'lin-log',             val: false },
    strongGravityMode:  { name: 'strong gravity',      val: false },
    jitterTolerance:    { name: 'layout speed', val: 0.5, min: 0.01, max: 1.0, step: 0.01 },
    barnesHutTheta:     { name: 'theta',               val: 0.1, min: 0.0, max: 1.0, step: 0.001, },
    scalingRatio:       { name: 'scale ratio',         val: 2.0, min: 0.0, max: 100.0, step: 0.1, },
    gravity:            { name: 'gravity',             val: 1.0, min: 0.0, max: 100.0, step: 0.1, },
  };
  const layoutParamNames = Object.keys(layoutParams);
  let selectedParameter = 0;

  window.addEventListener('keydown', (e) => {
    if ('1234567890'.includes(e.key)) {
      selectedParameter = +e.key;
    } else if (e.code === 'ArrowUp') {
      selectedParameter = clamp(layoutParamNames.length, selectedParameter - 1)[0] % layoutParamNames.length;
    } else if (e.code === 'ArrowDown') {
      selectedParameter = clamp(layoutParamNames.length, selectedParameter + 1)[0] % layoutParamNames.length;
    } else if (['PageUp', 'PageDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) !== -1) {
        const key = layoutParamNames[selectedParameter];
        const { val, min, max, step } = layoutParams[key];
        if (typeof val === 'boolean') {
          layoutParams[key].val = !val;
        } else if (e.code === 'PageUp') {
          layoutParams[key].val = Math.min(max, parseFloat(Number(val + step * 10).toPrecision(3)));
        } else if (e.code === 'PageDown') {
          layoutParams[key].val = Math.max(min, parseFloat(Number(val - step * 10).toPrecision(3)));
        } else if (e.code === 'ArrowLeft') {
          layoutParams[key].val = Math.max(min, parseFloat(Number(val - step).toPrecision(3)));
        } else if (e.code === 'ArrowRight') {
          layoutParams[key].val = Math.min(max, parseFloat(Number(val + step).toPrecision(3)));
        }
    }
  });

  /** @type DataFrame<{id: Uint32, color: Uint32, size: Uint8, x: Float32, y: Float32}> */
  let nodes = !props.nodes ? getDefaultNodes() : DataFrame.readCSV({
    header: 0,
    sourceType: 'files',
    sources: [props.nodes],
    dataTypes: {
      id: 'uint32',
      color: 'uint32',
      size: 'uint8',
    }
  });

  /** @type DataFrame<{src: Uint32, dst: Uint32, edge: Uint64, color: Uint64, bundle: Uint64}> */
  let edges = !props.edges ? getDefaultEdges() : DataFrame.readCSV({
    header: 0,
    sourceType: 'files',
    sources: [props.edges],
    dataTypes: {
      src: 'uint32',
      dst: 'uint32',
      edge: 'uint64',
      color: 'uint64',
      bundle: 'uint64',
    }
  });

  let graph = new GraphCOO(edges.get('src')._col, edges.get('dst')._col, {directedEdges: true});
  let graphDesc = {}, bbox = [0,0,0,0];

  for (let positions = null; true;) {
    if (layoutParams.simulating.val) {
      // Compute positions of the next time step from the previous time step's positions
      positions = graph.forceAtlas2({
          positions,
          ...layoutParamNames.reduce((params, name) => ({
            ...params, [name]: layoutParams[name].val
          }), {})
      });
  
      const n = graph.numNodes;
      // Extract the x and y positions and assign them as columns in our nodes DF
      nodes = nodes.assign({
        x: Series.new({type: new Float32, length: n, offset: 0, data: positions}),
        y: Series.new({type: new Float32, length: n, offset: n, data: positions}),
      });
  
      // Compute the positions minimum bounding box
      bbox = [
        ...nodes.get('x').minmax(),
        ...nodes.get('y').minmax(),
      ];
  
      graphDesc = createGraph(nodes, edges, graph);
    }
    const {promise, resolve: onAfterRender} = promiseSubject();
    // Yield the results to the caller for rendering
    yield {
      graph: graphDesc, 
      params: layoutParams,
      selectedParameter,
      bbox,
      autoCenter: layoutParams.autoCenter.val,
      onAfterRender
    };
    // Wait for the frame to finish rendering before advancing
    await promise.catch(() => {}).then(() => {});
  }
}

function promiseSubject() {
  let resolve, reject;
  let promise = new Promise((r1, r2) => {
    resolve = r1;
    reject  = r2;
  });
  return {promise, resolve, reject};
}

/**
 *
 * @param {DataFrame<{
 *  id: Uint32, color: Uint32, size: Uint8, x: Float32,  y: Float32,
 * }>} nodes
 * @param {DataFrame<{
 *  src: Uint32, dst: Uint32, edge: Uint64,  color: Uint64,  bundle: Uint64,
 * }>} edges
 * @param {*} graph
 */
function createGraph(nodes, edges, graph) {
  const numNodes = graph.numNodes;
  const numEdges = graph.numEdges;
  return {
    numNodes, numEdges, nodeRadiusScale: 1 / 75,
      // nodeRadiusScale: 1/255,
      nodeRadiusMinPixels: 5, nodeRadiusMaxPixels: 150, data: {
        edges: {
          offset: 0,
          length: numEdges,
          attributes: {
            edgeList: edges.get('edge').data,
            edgeColors: edges.get('color').data,
            edgeBundles: edges.get('bundle').data,
          }
        },
        nodes: {
          offset: 0,
          length: numNodes,
          attributes: {
            nodeRadius: nodes.get('size').data,
            nodeXPositions: nodes.get('x').data,
            nodeYPositions: nodes.get('y').data,
            nodeFillColors: nodes.get('color').data,
            nodeElementIndices: nodes.get('id').data,
          }
        },
      },
  }
}

function getDefaultNodes() {
  return new DataFrame({
    id: Series.new({
      type: new Uint32,
      data: [
        0,  1,  2,  3,  4,  5,  6,  7,  8,  9,  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39
      ]
    }),
    color: Series.new({
      type: new Uint32,
      data: [
        4282515870, 4282515870, 4283383509, 4283383509, 4283383509, 4283383509, 4282609140,
        4282609140, 4284591869, 4287357182, 4287357182, 4287357182, 4287357182, 4290772991,
        4290772991, 4290772991, 4290772991, 4288214502, 4288214502, 4288994731, 4288994731,
        4288994731, 4288994731, 4289053286, 4289053286, 4289053286, 4289053286, 4290611250,
        4290611250, 4290611250, 4290611250, 4288827230, 4288827230, 4288827230, 4288827230,
        4282515870, 4283383509, 4283383509, 4283383509, 4283383509
      ]
    }),
    size: Series.new({
      type: new Uint8,
      data: [
        5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,  5,   5,  5,   5, 5, 5, 5, 255,
        5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 79, 255, 97, 162, 5, 5, 5, 5, 162
      ]
    }),
  });
}

function getDefaultEdges() {
  return new DataFrame({
    src: Series.new({
      type: new Uint32,
      data: [
        3,  2,  7,  20, 1,  3,  35, 31, 27, 0,  4,  26, 13, 23, 25, 33, 21, 10, 37, 16, 5,  38, 14,
        30, 4,  34, 9,  19, 26, 3,  24, 26, 12, 15, 2,  30, 1,  27, 13, 23, 32, 25, 37, 14, 37, 28,
        28, 35, 12, 35, 24, 27, 0,  25, 0,  3,  27, 30, 27, 21, 0,  4,  11, 28, 38, 1,  4,  17, 9,
        11, 1,  2,  36, 18, 25, 20, 0,  27, 32, 25, 29, 1,  11, 5,  13, 26, 33, 36, 1,  33, 35, 20,
        22, 27, 7,  1,  27, 37, 2,  36, 26, 30, 28, 3,  37, 8,  8,  11, 4,  34, 18, 10, 27, 1,  0,
        1,  39, 3,  5,  33, 28, 0,  33, 6,  31, 0,  20, 27, 9,  36, 0,  19, 4,  27, 1,  15, 18, 0,
        16, 23, 25, 26, 37, 2,  27, 3,  11, 27, 4,  34, 13, 25, 4,  31, 36, 34, 6,  20, 27, 34, 27,
        1,  3,  32, 27, 19, 26, 24, 11, 34, 31, 2,  19, 36, 31, 18, 1,  36, 3,  39, 5,  0,  19, 4,
        24, 38, 5,  4,  8,  22, 3,  4,  30, 1,  5,  4,  9,  16, 6,  0,  2,  7,  8,  37, 27, 21, 11,
        17, 1,  29, 27, 23, 3,  0,  19, 33, 12, 28, 15, 26, 7,  2,  17, 9,  29, 15, 39, 18, 17, 0,
        33, 1,  31, 22, 9,  32, 34, 15, 4,  5,  12, 3,  0,  36, 37, 8,  32, 13, 12, 1,  4,  10, 17,
        24, 15, 27, 5,  6,  0,  17, 34, 18, 24, 10, 35, 2,  23, 38, 7,  33, 13, 14, 22, 27, 27, 3,
        11, 35, 13, 27, 20, 0,  22, 7,  22, 36, 19, 13, 26, 29, 12, 12, 9
      ]
    }),
    dst: Series.new({
      type: new Uint32,
      data: [
        4,  25, 21, 14, 29, 1,  8,  0,  15, 18, 38, 17, 28, 39, 20, 31, 0,  4,  27, 23, 32, 4,  0,
        26, 25, 0,  27, 24, 7,  15, 4,  3,  30, 0,  16, 7,  10, 35, 34, 29, 3,  14, 12, 36, 3,  34,
        27, 4,  17, 16, 6,  0,  14, 2,  15, 32, 34, 5,  7,  17, 6,  3,  27, 15, 24, 22, 24, 32, 25,
        20, 13, 23, 2,  0,  31, 0,  29, 25, 5,  27, 16, 16, 2,  17, 15, 21, 4,  14, 25, 27, 23, 11,
        4,  5,  0,  36, 11, 5,  4,  9,  27, 27, 1,  28, 18, 29, 23, 33, 36, 15, 21, 16, 23, 34, 20,
        6,  2,  12, 3,  2,  24, 19, 9,  3,  36, 3,  2,  6,  33, 0,  1,  3,  11, 9,  38, 24, 7,  35,
        1,  8,  0,  5,  30, 14, 1,  18, 1,  22, 39, 1,  6,  36, 16, 14, 25, 13, 34, 31, 12, 38, 39,
        24, 37, 26, 31, 4,  30, 13, 36, 24, 4,  27, 38, 4,  1,  17, 11, 20, 13, 4,  27, 37, 15, 8,
        27, 0,  18, 27, 1,  23, 5,  33, 18, 39, 0,  6,  4,  10, 0,  13, 1,  5,  39, 26, 4,  3,  0,
        5,  4,  39, 29, 4,  0,  36, 1,  25, 18, 3,  38, 32, 30, 11, 0,  0,  4,  4,  8,  32, 30, 39,
        20, 31, 2,  0,  1,  37, 19, 3,  20, 21, 27, 21, 28, 33, 21, 0,  27, 19, 5,  20, 31, 27, 26,
        3,  27, 32, 12, 28, 34, 27, 27, 27, 0,  29, 39, 10, 0,  27, 3,  0,  3,  33, 8,  38, 24, 24,
        25, 22, 1,  14, 25, 4,  10, 32, 39, 27, 0,  38, 18, 27, 26, 32, 20
      ]
    }),
    edge: Series.new({
      type: new Uint64,
      data: [
        55834574849n,  81604378625n,  73014444048n,  115964117006n, 128849018887n, 167503724570n,
        133143986178n, 128849018902n, 154618822687n, 158913789987n, 150323855362n, 124554051600n,
        133143986190n, 103079215122n, 21474836481n,  90194313224n,  98784247810n,  133143986195n,
        163208757255n, 103079215110n, 146028888090n, 64424509448n,  158913789976n, 68719476744n,
        115964117009n, 133143986199n, 73014444044n,  120259084306n, 128849018888n, 64424509446n,
        141733920775n, 94489280519n,  73014444036n,  150323855376n, 141733920784n, 81604378638n,
        120259084308n, 81604378630n,  111669149704n, 133143986182n, 103079215112n, 120259084296n,
        115964117015n, 64424509443n,  128849018892n, 167503724549n, 90194313227n,  150323855385n,
        167503724578n, 158913789962n, 150323855361n, 94489280525n,  60129542146n,  90194313223n,
        77309411343n,  154618822683n, 73014444038n,  111669149703n, 85899345923n,  124554051585n,
        77309411336n,  154618822673n, 115964117001n, 163208757273n, 73014444043n,  107374182416n,
        137438953472n, 111669149713n, 150323855365n, 98784247827n,  60129542150n,  73014444039n,
        150323855384n, 150323855388n, 115964116998n, 124554051588n, 107374182404n, 146028888076n,
        167503724561n, 85899345938n,  68719476747n,  133143986177n, 94489280520n,  8589934593n,
        42949672966n,  111669149697n, 150323855394n, 34359738371n,  167503724545n, 120259084298n,
        68719476743n,  47244640257n,  133143986185n, 124554051609n, 167503724557n, 133143986203n,
        150323855387n, 64424509450n,  55834574856n,  146028888071n, 73014444041n,  154618822658n,
        42949672963n,  12884901888n,  81604378626n,  38654705666n,  141733920779n, 150323855364n,
        103079215124n, 163208757264n, 120259084294n, 90194313232n,  146028888086n, 167503724551n,
        141733920789n, 163208757259n, 124554051605n, 158913789972n, 68719476740n,  150323855366n,
        150323855368n, 30064771073n,  115964117011n, 17179869185n,  73014444045n,  128849018885n,
        154618822664n, 133143986193n, 107374182408n, 137438953480n, 107374182417n, 85899345930n,
        103079215107n, 111669149709n, 120259084288n, 150323855373n, 42949672968n,  47244640260n,
        137438953492n, 141733920772n, 90194313233n,  124554051601n, 158913789952n, 30064771077n,
        158913789980n, 141733920769n, 30064771076n,  141733920797n, 167503724579n, 146028888072n,
        146028888065n, 103079215104n, 60129542152n,  137438953478n, 150323855372n, 158913789967n,
        141733920785n, 150323855363n, 98784247816n,  51539607560n,  167503724566n, 34359738375n,
        150323855369n, 25769803776n,  81604378632n,  25769803778n,  167503724574n, 90194313217n,
        98784247825n,  137438953487n, 111669149701n, 94489280524n,  38654705665n,  107374182407n,
        128849018906n, 124554051592n, 150323855386n, 68719476737n,  64424509440n,  60129542153n,
        77309411338n,  154618822670n, 137438953496n, 120259084291n, 51539607559n,  34359738373n,
        73014444046n,  137438953490n, 120259084303n, 163208757256n, 128849018881n, 158913789984n,
        94489280529n,  85899345920n,  150323855370n, 85899345926n,  115964117000n, 34359738372n,
        150323855392n, 81604378633n,  94489280513n,  128849018897n, 150323855371n, 103079215119n,
        150323855374n, 146028888069n, 154618822657n, 98784247822n,  141733920776n, 55834574855n,
        77309411334n,  163208757265n, 73014444034n,  150323855390n, 150323855382n, 158913789970n,
        98784247817n,  90194313220n,  77309411331n,  163208757283n, 98784247809n,  158913789958n,
        120259084312n, 167503724556n, 150323855367n, 154618822675n, 51539607553n,  38654705670n,
        150323855360n, 158913789960n, 150323855383n, 77309411328n,  150323855377n, 107374182421n,
        146028888081n, 163208757249n, 34359738368n,  73014444037n,  34359738370n,  38654705672n,
        163208757252n, 73014444033n,  163208757277n, 34359738374n,  167503724552n, 55834574853n,
        115964116993n, 34359738369n,  150323855389n, 103079215114n, 137438953482n, 94489280517n,
        150323855380n, 107374182411n, 47244640264n,  85899345935n,  150323855381n, 150323855393n,
        25769803777n,  137438953500n, 107374182401n, 154618822662n, 141733920793n, 150323855379n,
        42949672960n,  115964116994n, 133143986184n, 150323855375n, 150323855391n, 150323855378n,
        124554051595n, 163208757281n, 47244640263n,  25769803779n,  146028888077n, 154618822691n,
        98784247814n,  111669149708n, 111669149718n, 73014444040n,  137438953475n, 163208757269n,
        154618822665n, 146028888094n, 128849018893n, 51539607557n,  124554051591n, 81604378641n,
        85899345928n,  60129542145n,  154618822679n, 55834574860n,  158913789955n
      ]
    }),
    color: Series.new({
      type: new Uint64,
      data: [
        18393265610535579389n, 18393265610533503390n, 18393666202139738726n, 18420372695331627262n,
        18421343598454718165n, 18396992091669716395n, 18420372695333097310n, 18393265610533503390n,
        18414058887251331122n, 18428035002882195870n, 18420372695326879220n, 18393265610540040806n,
        18393265610539982251n, 18393265610533503390n, 18428035002883063509n, 18396992091665313533n,
        18414058887251492863n, 18393666202139512670n, 18420372695332484582n, 18396992091668078846n,
        18421343598460161886n, 18421343598453943796n, 18421343598454718165n, 18417741048613699583n,
        18420372695326785950n, 18396992091663330804n, 18396992091668078846n, 18420372695333264811n,
        18428035002884271869n, 18414058887244103381n, 18428035002888674731n, 18421092106648674558n,
        18421092106651928626n, 18428729675195875327n, 18396992091664105173n, 18428729675187711476n,
        18396992091668936166n, 18396992091671332914n, 18402181958349873406n, 18393265610535579389n,
        18393666202133294580n, 18421092106648674558n, 18393666202134068949n, 18396992091664105173n,
        18421092106643833246n, 18421343598454718165n, 18420372695327653589n, 18421343598458691838n,
        18421092106644700885n, 18414058887249714603n, 18421343598462107647n, 18428035002882289140n,
        18428035002890452991n, 18393265610539982251n, 18428729675187711476n, 18428729675194097067n,
        18428729675192459518n, 18417741048611921323n, 18396992091669716395n, 18420372695327653589n,
        18428035002882289140n, 18414058887245311741n, 18402181958345032094n, 18417741048611921323n,
        18420372695326785950n, 18428035002890452991n, 18396992091664105173n, 18428035002884271869n,
        18396992091668936166n, 18393265610538344702n, 18396992091671494655n, 18414058887243235742n,
        18414058887248934374n, 18393265610534371029n, 18396992091669716395n, 18393265610533596660n,
        18417741048605535732n, 18393265610540040806n, 18421343598461945906n, 18420372695326879220n,
        18396992091664105173n, 18402181958345899733n, 18417741048610283774n, 18402181958350730726n,
        18414058887248934374n, 18396992091668078846n, 18417741048605442462n, 18396992091665313533n,
        18402181958345032094n, 18396992091663330804n, 18428729675187618206n, 18428035002888507230n,
        18402181958345899733n, 18393265610533503390n, 18421343598458691838n, 18420372695326879220n,
        18421092106643833246n, 18393265610538344702n, 18421343598460387942n, 18414058887251492863n,
        18421092106651928626n, 18421343598454718165n, 18420372695335043071n, 18421343598462107647n,
        18421092106652090367n, 18421343598460329387n, 18421343598453943796n, 18428035002884271869n,
        18393265610533596660n, 18414058887245311741n, 18414058887245311741n, 18420372695333323366n,
        18420372695327653589n, 18421092106648674558n, 18428035002883063509n, 18396992091668078846n,
        18393666202139738726n, 18396992091669548894n, 18420372695331627262n, 18393666202133201310n,
        18420372695335043071n, 18396992091664105173n, 18420372695326879220n, 18420372695335043071n,
        18421343598461945906n, 18428729675187711476n, 18420372695326879220n, 18393265610534371029n,
        18396992091663237534n, 18420372695328861949n, 18393265610539202022n, 18421343598458691838n,
        18414058887249773158n, 18421092106643833246n, 18421092106643833246n, 18393265610541760511n,
        18421092106652090367n, 18428035002882289140n, 18402181958351569510n, 18393265610534371029n,
        18421092106650312107n, 18421092106650144606n, 18428035002882195870n, 18393265610534371029n,
        18421343598462107647n, 18393265610541760511n, 18420372695332484582n, 18396992091663237534n,
        18421343598455926525n, 18420372695327653589n, 18428729675194097067n, 18417741048605535732n,
        18396992091663330804n, 18417741048611979878n, 18393265610535579389n, 18393265610540040806n,
        18396992091665313533n, 18421343598459549158n, 18421092106650370662n, 18417741048610283774n,
        18396992091668936166n, 18421343598455926525n, 18396992091663330804n, 18428035002882289140n,
        18396992091663330804n, 18428729675187711476n, 18421092106650312107n, 18417741048605442462n,
        18428035002882289140n, 18428035002882195870n, 18396992091665313533n, 18420372695333323366n,
        18428035002882195870n, 18396992091668936166n, 18396992091669716395n, 18393265610539202022n,
        18428035002882195870n, 18420372695326785950n, 18421343598454718165n, 18396992091664105173n,
        18421092106645909245n, 18421343598454718165n, 18420372695326785950n, 18396992091671332914n,
        18421343598453943796n, 18420372695328861949n, 18428729675188485845n, 18396992091663237534n,
        18428729675187618206n, 18428035002890291250n, 18420372695331627262n, 18417741048610283774n,
        18428035002883063509n, 18428035002888674731n, 18428729675192459518n, 18420372695328861949n,
        18421092106652090367n, 18417741048607518461n, 18421343598455926525n, 18420372695332484582n,
        18421343598458691838n, 18393265610534371029n, 18421343598462107647n, 18428729675187618206n,
        18417741048613699583n, 18393265610535579389n, 18393265610534371029n, 18428035002888674731n,
        18428035002883063509n, 18421343598459549158n, 18420372695332484582n, 18396992091663237534n,
        18421092106644700885n, 18428729675195713586n, 18420372695326785950n, 18421092106644700885n,
        18396992091671332914n, 18414058887243235742n, 18421343598455926525n, 18393265610533503390n,
        18402181958345032094n, 18396992091665313533n, 18428035002882289140n, 18428729675192459518n,
        18414058887251492863n, 18420372695332484582n, 18428035002883063509n, 18396992091665313533n,
        18420372695328861949n, 18393265610539982251n, 18428729675187711476n, 18428729675192459518n,
        18420372695326785950n, 18417741048607518461n, 18396992091664105173n, 18414058887251331122n,
        18396992091663237534n, 18421092106649531878n, 18414058887251492863n, 18420372695327653589n,
        18393265610538344702n, 18421343598453850526n, 18396992091663330804n, 18428035002888733286n,
        18421092106645909245n, 18420372695333323366n, 18396992091663237534n, 18420372695326785950n,
        18396992091668078846n, 18428035002887037182n, 18396992091671494655n, 18428729675194155622n,
        18393265610534371029n, 18393265610533596660n, 18393666202134068949n, 18428035002890452991n,
        18396992091668936166n, 18417741048613699583n, 18428035002884271869n, 18396992091663237534n,
        18420372695333097310n, 18417741048611141094n, 18393265610533503390n, 18420372695331627262n,
        18421092106643926516n, 18428035002884271869n, 18421092106644700885n, 18421343598460161886n,
        18420372695331627262n, 18421343598453850526n, 18428035002887894502n, 18428035002887037182n,
        18428729675195875327n, 18428035002890452991n, 18396992091664105173n, 18421092106643833246n,
        18393265610541760511n, 18396992091665313533n, 18396992091663330804n, 18393265610533596660n,
        18421092106649531878n, 18428729675188485845n, 18421092106651928626n, 18417741048611921323n,
        18396992091668936166n, 18417741048610283774n, 18421343598454718165n, 18421092106644700885n,
        18428035002882195870n, 18417741048605442462n, 18396992091663330804n, 18428035002888733286n,
        18396992091668078846n
      ]
    }),
    bundle: Series.new({
      type: new Uint64,
      data: [
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
        4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n, 4294967296n,
      ]
    })
  });
}
