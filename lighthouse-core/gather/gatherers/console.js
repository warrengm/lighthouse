/**
 * @license Copyright 2017 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

/**
 * @fileoverview Gathers console deprecation and intervention warnings logged by Chrome.
 */

'use strict';

const Gatherer = require('./gatherer.js');

class Console extends Gatherer {
  constructor() {
    super();
    /** @type {LH.Artifacts.ConsoleMessage[]} */
    this._logEntries = [];

    this._onConsoleAPICalled = this.onConsoleAPICalled.bind(this);
    this._onExceptionThrown = this.onExceptionThrown.bind(this);
    this._onLogEntryEntryAdded = this.onLogEntryEntry.bind(this);
  }

  /**
   * @param {LH.Crdp.Runtime.ConsoleAPICalledEvent} event
   */
  onConsoleAPICalled(event) {
    console.log('CONSOLE',event)
    const level = event.type;
    if (level !== 'warning' && level !== 'error') {
      // Only gather warnings and errors for brevity.
      return;
    }
    const args = event.args || [];
    const text = args.map(a => a.value || a.description || '').filter(Boolean).join(' ');
    if (!text) {
      return;
    }
    /** @type {LH.Artifacts.ConsoleMessage} */
    const consoleMessage = {
      source: 'consoleAPI',
      event,
      level,
      text,
      stackTrace: event.stackTrace,
      timestamp: event.timestamp,
    };
    this._logEntries.push(consoleMessage);
  }

  /**
   * @param {LH.Crdp.Runtime.ExceptionThrownEvent} event
   */
  onExceptionThrown(event) {
    console.log('EXCETPTION', event)
  }

  /**
   * @param {LH.Crdp.Log.EntryAddedEvent} event
   */
  onLogEntryEntry(event) {
    console.log('LogENTRY', event)
  }

  /**
   * @param {LH.Gatherer.PassContext} passContext
   */
  async beforePass(passContext) {
    const driver = passContext.driver;

    driver.on('Log.entryAdded', this._onLogEntryEntryAdded);
    await driver.sendCommand('Log.enable');
    await driver.sendCommand('Log.startViolationsReport', {
      config: [{name: 'discouragedAPIUse', threshold: -1}],
    });

    driver.on('Runtime.consoleAPICalled', this._onConsoleAPICalled);
    driver.on('Runtime.exceptionThrown', this._onExceptionThrown);
    await driver.sendCommand('Runtime.enable');
  }

  /**
   * @param {LH.Gatherer.PassContext} passContext
   * @return {Promise<LH.Artifacts['Console']>}
   */
  async afterPass(passContext) {
    await passContext.driver.sendCommand('Log.stopViolationsReport');
    await passContext.driver.off('Log.entryAdded', this._onLogEntryEntryAdded);
    await passContext.driver.sendCommand('Log.disable');
    return this._logEntries;
  }
}

module.exports = Console;
