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

import '../../jest-extensions';

import {BigIntArray, setDefaultAllocator, TypedArray, Uint8Buffer} from '@nvidia/cuda';
import {
  Bool8,
  Float32,
  Float64,
  Int16,
  Int32,
  Int64,
  Int8,
  Numeric,
  Series,
  Uint16,
  Uint32,
  Uint64,
  Uint8
} from '@nvidia/cudf';
import {DeviceBuffer} from '@nvidia/rmm';
import {BoolVector} from 'apache-arrow';

setDefaultAllocator((byteLength: number) => new DeviceBuffer(byteLength));

const makeNumbers = (length = 10) => Array.from({length}, (_, i) => Number(i));

const makeBigInts = (length = 10) => Array.from({length}, (_, i) => BigInt(i));

const makeBooleans = (length = 10) => Array.from({length}, (_, i) => Number(i % 2 == 0));

const float_with_NaN = Array.from([NaN, 1, 2, 3, 4, 5, 6, 7, 8, NaN]);

function test_values<T extends Numeric>(lhs: number|bigint|undefined, rhs: number, type: T) {
  if (['Float32', 'Float64', 'Bool'].includes(type.toString())) {
    expect(lhs).toEqual(rhs);
  } else {
    expect(lhs).toEqual(BigInt(rhs));
  }
}

function testNumberProduct<T extends Numeric, R extends TypedArray>(type: T, data: R) {
  const result = [...data].reduce((x, y) => {
    if (isNaN(y)) { y = 1; }
    if (isNaN(x)) { x = 1; }
    return x * y;
  });
  test_values(Series.new({type, data}).product(), result, type);
}

function testNumberProductSkipNA<T extends Numeric, R extends TypedArray>(
  type: T, data: R, mask_array: Array<number>) {
  const mask = new Uint8Buffer(BoolVector.from(mask_array).values);
  if (!data.includes(NaN)) {
    const result = [...data].reduce((x, y, i) => {
      if (mask_array[i] == 1) { return x * y; }
      return x;
    });
    // skipna=false
    test_values(Series.new({type, data, nullMask: mask}).product(false), result, type);
  } else {
    // skipna=false
    expect(Series.new({type, data, nullMask: mask}).product(false)).toEqual(NaN);
  }
}

function testBigIntProduct<T extends Numeric, R extends BigIntArray>(type: T, data: R) {
  expect(Series.new({type, data}).product()).toEqual([...data].reduce((x, y) => x * y));
}

function testBigIntProductSkipNA<T extends Numeric, R extends BigIntArray>(
  type: T, data: R, mask_array: Array<number>) {
  const mask = new Uint8Buffer(BoolVector.from(mask_array).values);
  // skipna=false
  expect(Series.new({type, data, nullMask: mask}).product(false)).toEqual([
    ...data
  ].reduce((x, y, i) => {
    if (mask_array[i] == 1) { return x * y; }
    return x;
  }));
}

describe('Series.product(skipna=true)', () => {
  test('Int8', () => { testNumberProduct(new Int8, new Int8Array(makeNumbers())); });
  test('Int16', () => { testNumberProduct(new Int16, new Int16Array(makeNumbers())); });
  test('Int32', () => { testNumberProduct(new Int32, new Int32Array(makeNumbers())); });
  test('Int64', () => { testBigIntProduct(new Int64, new BigInt64Array(makeBigInts())); });
  test('Uint8', () => { testNumberProduct(new Uint8, new Uint8Array(makeNumbers())); });
  test('Uint16', () => { testNumberProduct(new Uint16, new Uint16Array(makeNumbers())); });
  test('Uint32', () => { testNumberProduct(new Uint32, new Uint32Array(makeNumbers())); });
  test('Uint64', () => { testBigIntProduct(new Uint64, new BigUint64Array(makeBigInts())); });
  test('Float32', () => { testNumberProduct(new Float32, new Float32Array(makeNumbers())); });
  test('Float64', () => { testNumberProduct(new Float64, new Float64Array(makeNumbers())); });
  test('Bool8', () => { testNumberProduct(new Bool8, new Uint8ClampedArray(makeBooleans())); });
});

describe('Series.product(skipna=false)', () => {
  test('Int8',
       () => {testNumberProductSkipNA(new Int8, new Int8Array(makeNumbers()), makeBooleans())});
  test(
    'Int16',
    () => { testNumberProductSkipNA(new Int16, new Int16Array(makeNumbers()), makeBooleans()); });
  test(
    'Int32',
    () => { testNumberProductSkipNA(new Int32, new Int32Array(makeNumbers()), makeBooleans()); });
  test('Int64', () => {
    testBigIntProductSkipNA(new Int64, new BigInt64Array(makeBigInts()), makeBooleans());
  });
  test(
    'Uint8',
    () => { testNumberProductSkipNA(new Uint8, new Uint8Array(makeNumbers()), makeBooleans()); });
  test(
    'Uint16',
    () => { testNumberProductSkipNA(new Uint16, new Uint16Array(makeNumbers()), makeBooleans()); });
  test(
    'Uint32',
    () => { testNumberProductSkipNA(new Uint32, new Uint32Array(makeNumbers()), makeBooleans()); });
  test('Uint64', () => {
    testBigIntProductSkipNA(new Uint64, new BigUint64Array(makeBigInts()), makeBooleans());
  });
  test('Float32', () => {
    testNumberProductSkipNA(new Float32, new Float32Array(makeNumbers()), makeBooleans());
  });
  test('Float64', () => {
    testNumberProductSkipNA(new Float64, new Float64Array(makeNumbers()), makeBooleans());
  });
  test('Bool8', () => {
    testNumberProductSkipNA(new Bool8, new Uint8ClampedArray(makeBooleans()), makeBooleans());
  });
});

describe('Float type Series with NaN => Series.product(skipna=true)', () => {
  test('Float32', () => { testNumberProduct(new Float32, new Float32Array(float_with_NaN)); });
  test('Float64', () => { testNumberProduct(new Float64, new Float64Array(float_with_NaN)); });
});

describe('Float type Series with NaN => Series.product(skipna=false)', () => {
  test('Float32', () => {
    testNumberProductSkipNA(new Float32, new Float32Array(float_with_NaN), makeBooleans());
  });
  test('Float64', () => {
    testNumberProductSkipNA(new Float64, new Float64Array(float_with_NaN), makeBooleans());
  });
});
