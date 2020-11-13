/**
* @license Copyright 2017 The Lighthouse Authors. All Rights Reserved.
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/* eslint-env jest */

const ConsoleGatherer = require('../../../gather/gatherers/console.js');
const assert = require('assert').strict;

class MockDriver {
  constructor() {
    this.listeners = new Map();
  }

  on(command, cb) {
    this.listeners.set(command, cb);
  }

  off() {}

  sendCommand() {
    return Promise.resolve();
  }

  fireForTest(command, event) {
    this.listeners.get(command)(event);
  }
}

describe('Console', () => {
  it('captures the exceptions raised', async () => {
    const consoleGatherer = new ConsoleGatherer();
    const runtimeEx =
      {
        'timestamp': 1506535813608.003,
        'exceptionDetails': {
          'url': 'http://www.example.com/fancybox.js',
          'lineNumber': 28,
          'columnNumber': 20,
          'stackTrace': {
            'callFrames': [
              {
                'url': 'http://www.example.com/fancybox.js',
                'lineNumber': 28,
                'columnNumber': 20,
              },
            ],
          },
          'exception': {
            'className': 'TypeError',
            'description': 'TypeError: Cannot read property \'msie\' of undefined',
          },
          'executionContextId': 3,
        },
      };

    const driver = new MockDriver();
    const options = {driver};

    await consoleGatherer.beforePass(options);
    driver.fireForTest('Runtime.exceptionThrown', runtimeEx);

    const artifact = await consoleGatherer.afterPass(options);

    assert.equal(artifact.length, 1);
    assert.equal(artifact[0].source, 'exception');
    assert.equal(artifact[0].level, 'exception');
    assert.equal(artifact[0].text,
      `TypeError: Cannot read property 'msie' of undefined`);
    assert.equal(artifact[0].url,
      'http://www.example.com/fancybox.js');
    assert.equal(artifact[0].lineNumber, 28);
    assert.equal(artifact[0].columnNumber, 20);
  });
});
