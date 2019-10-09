/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Gatherer = require('./gatherer.js');
const NetworkAnalyzer = require('../../lib/dependency-graph/simulator/network-analyzer.js');
const NetworkRequest = require('../../lib/network-request.js');
const getElementsInDocumentString = require('../../lib/page-functions.js').getElementsInDocumentString; // eslint-disable-line max-len
const pageFunctions = require('../../lib/page-functions.js');

/* global getNodePath */

/**
 * @return {LH.Artifacts['ScriptElements']}
 */
/* istanbul ignore next */
function collectAllScriptElements() {
  /** @type {HTMLScriptElement[]} */
  // @ts-ignore - getElementsInDocument put into scope via stringification
  const scripts = getElementsInDocument('script'); // eslint-disable-line no-undef

  return scripts.map(script => {
    return {
      type: script.type || null,
      src: script.src || null,
      async: script.async,
      defer: script.defer,
      source: /** @type {'head'|'body'} */ (script.closest('head') ? 'head' : 'body'),
      // @ts-ignore - getNodePath put into scope via stringification
      devtoolsNodePath: getNodePath(script),
      content: script.src ? null : script.text,
      requestId: null,
      nodeId: null,
    };
  });
}

let _nodeStackTracesSupported;
async function areNodeStackTracesSupported(driver) {
  if (_nodeStackTracesSupported === undefined) {
    // We do version sniffing here to prevent any errors from be logged to CLI users.
    const {product} = await driver.sendCommand('Browser.getVersion');
    _nodeStackTracesSupported = (product >= 'Chrome/79');
  }
  return _nodeStackTracesSupported;
}


/**
 * @fileoverview Gets JavaScript file contents.
 */
class ScriptElements extends Gatherer {
   /**
    * @param {LH.Gatherer.PassContext} passContext
    */
  async beforePass(passContext) {
    if (areNodeStackTracesSupported(passContext.driver)) {
      await passContext.driver.sendCommand('DOM.enable');
      await passContext.driver.sendCommand('DOM.setNodeStackTracesEnabled', {enable: true});
    }
  }

  /**
   * @param {LH.Gatherer.PassContext} passContext
   * @param {LH.Gatherer.LoadData} loadData
   * @return {Promise<LH.Artifacts['ScriptElements']>}
   */
  async afterPass(passContext, loadData) {
    const driver = passContext.driver;
    const mainResource = NetworkAnalyzer.findMainDocument(loadData.networkRecords, passContext.url);

    /** @type {LH.Artifacts['ScriptElements']} */
    const scripts = await driver.evaluateAsync(`(() => {
      ${getElementsInDocumentString}
      ${pageFunctions.getNodePathString};
      return (${collectAllScriptElements.toString()})();
    })()`, {useIsolation: true});

    for (const script of scripts) {
      if (script.content) {
        script.requestId = mainResource.requestId;
      }
      if (areNodeStackTracesSupported(passContext.driver)) {
        const element = await driver.querySelector(`script[src$="${script.src}"]`);
        if (!element) {
          continue;
        }
        script.nodeId = element.element.nodeId;
        const stackTraces =
          await driver.sendCommand('DOM.getNodeStackTraces', {nodeId: script.nodeId});
        script.nodeStackTraces = stackTraces;
      }
    }

    const scriptRecords = loadData.networkRecords
      // Ignore records from OOPIFs
      .filter(record => !record.sessionId)
      // Only get the content of script requests
      .filter(record => record.resourceType === NetworkRequest.TYPES.Script);

    for (const record of scriptRecords) {
      try {
        const content = await driver.getRequestContent(record.requestId);
        if (!content) continue;

        const matchedScriptElement = scripts.find(script => script.src === record.url);
        if (matchedScriptElement) {
          matchedScriptElement.requestId = record.requestId;
          matchedScriptElement.content = content;
        } else {
          scripts.push({
            devtoolsNodePath: '',
            type: null,
            src: record.url,
            async: false,
            defer: false,
            source: 'network',
            requestId: record.requestId,
            content,
          });
        }
      } catch (e) {}
    }

    return scripts;
  }
}

module.exports = ScriptElements;
