/**
 * @license Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/* eslint-env jest */

const testServer = require('../fixtures/static-server.js').server;
const run = require('../../run.js');
const getFlags = require('../../cli-flags').getFlags;

/** @type {Array<keyof LH.Artifacts>} */
const ARTIFACTS_TO_ASSERT = [
  'AnchorElements',
  'ImageElements',
  'LinkElements',
  'MetaElements',
  'ScriptElements',
];

/** @type {Array<[(path: string[], value: any) => boolean, (value: any) => any]>} */
const cleaningFunctions = [
  [path => path[0] === 'requestId', () => '<requestId>'],
  [path => path[0] === 'content', value => value && value.slice(0, 100)],
  [(_, value) => /localhost:\d+/.test(value), value => value.replace(/localhost:\d+/, 'localhost')],
  [(_, value) => /^blob:/.test(value), () => '<blob url>'],
];

/**
 *
 * @param {*} value
 * @param {string[]} pathToValue
 */
function cleanArtifactsForSnapshot(value, pathToValue) {
  cleaningFunctions.forEach(([testFn, replaceFn]) => {
    if (testFn(pathToValue, value)) value = replaceFn(value);
  });

  if (Array.isArray(value)) {
    value = value.map((childValue, index) => {
      const childKey = index.toString();
      return cleanArtifactsForSnapshot(childValue, [childKey, ...pathToValue]);
    });
  } else if (typeof value === 'object' && value !== null) {
    Object.entries(value).forEach(([childKey, childValue]) => {
      value[childKey] = cleanArtifactsForSnapshot(childValue, [childKey, ...pathToValue]);
    });
  }

  return value;
}

describe('Artifacts Tests', function() {
  /** @type {LH.RunnerResult} */
  let result;

  beforeAll(async () => {
    await new Promise(resolve => {
      testServer.listen(0, 'localhost', resolve);
    });

    const address = testServer.address();
    const runnerResult = await run.runLighthouse(
      `http://localhost:${address.port}/dobetterweb/dbw_tester.html`,
      getFlags(`--chrome-flags="--headless --no-sandbox" <url>`),
      undefined
    );

    if (!runnerResult) throw new Error('Run failed');
    result = runnerResult;
  }, 30000);

  afterAll(async () => {
    await new Promise(resolve => testServer.close(resolve));
  });

  it('should have created artifacts', () => {
    expect(result).toBeDefined();

    /** @type {Partial<LH.Artifacts>} */
    const artifacts = {};
    ARTIFACTS_TO_ASSERT.forEach(key => (artifacts[key] = result.artifacts[key]));
    expect(cleanArtifactsForSnapshot(artifacts, [])).toMatchSnapshot();
  });
});
