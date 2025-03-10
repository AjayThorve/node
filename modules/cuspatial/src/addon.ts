/* eslint-disable @typescript-eslint/unbound-method */
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

import '@nvidia/rmm';

import {Column, FloatingPoint, Int32, Table, Uint32} from '@nvidia/cudf';
import {loadNativeModule} from '@nvidia/rapids-core';
import {MemoryResource} from '@nvidia/rmm';

export const {
  createQuadtree,
  findQuadtreeAndBoundingBoxIntersections,
  computePolygonBoundingBoxes,
  computePolylineBoundingBoxes,
  findPointsInPolygons,
  findPolylineNearestToEachPoint
} = loadNativeModule<{
  createQuadtree<T extends FloatingPoint>(xs: Column<T>,
                                          ys: Column<T>,
                                          xMin: number,
                                          xMax: number,
                                          yMin: number,
                                          yMax: number,
                                          scale: number,
                                          maxDepth: number,
                                          minSize: number,
                                          memoryResource?: MemoryResource):
    {keyMap: Column<Uint32>, table: Table, names: ['key', 'level', 'is_quad', 'length', 'offset']},
  findQuadtreeAndBoundingBoxIntersections(quadtree: Table,
                                          boundingBoxes: Table,
                                          xMin: number,
                                          xMax: number,
                                          yMin: number,
                                          yMax: number,
                                          scale: number,
                                          maxDepth: number,
                                          memoryResource?: MemoryResource):
    {table: Table, names: ['poly_offset', 'quad_offset']},
  computePolygonBoundingBoxes<T extends FloatingPoint>(poly_offsets: Column<Int32>,
                                                       ring_offsets: Column<Int32>,
                                                       xs: Column<T>,
                                                       ys: Column<T>,
                                                       memoryResource?: MemoryResource):
    {table: Table, names: ['x_min', 'y_min', 'x_max', 'y_max']},
  computePolylineBoundingBoxes<T extends FloatingPoint>(poly_offsets: Column<Int32>,
                                                        xs: Column<T>,
                                                        ys: Column<T>,
                                                        expansionRadius: number,
                                                        memoryResource?: MemoryResource):
    {table: Table, names: ['x_min', 'y_min', 'x_max', 'y_max']},
  findPointsInPolygons<T extends FloatingPoint>(intersections: Table,
                                                quadtree: Table,
                                                keyMap: Column<Uint32>,
                                                x: Column<T>,
                                                y: Column<T>,
                                                polygonOffsets: Column<Int32>,
                                                ringOffsets: Column<Int32>,
                                                polygonPointsX: Column<T>,
                                                polygonPointsY: Column<T>,
                                                memoryResource?: MemoryResource):
    {table: Table, names: ['polygon_index', 'point_index']},
  findPolylineNearestToEachPoint<T extends FloatingPoint>(intersections: Table,
                                                          quadtree: Table,
                                                          keyMap: Column<Uint32>,
                                                          x: Column<T>,
                                                          y: Column<T>,
                                                          polylineOffsets: Column<Int32>,
                                                          polylinePointsX: Column<T>,
                                                          polylinePointsY: Column<T>,
                                                          memoryResource?: MemoryResource):
    {table: Table, names: ['point_index', 'polyline_index', 'distance']},
}>(module, 'node_cuspatial');
