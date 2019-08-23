/**
 * @license Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const makeComputedArtifact = require('./computed-artifact.js');
const MainThreadTasks_ = require('../lib/tracehouse/main-thread-tasks.js');
const TraceOfTab = require('./trace-of-tab.js');

class MainThreadTasks {
  /**
   * @param {LH.Artifacts.TraceOfTab} traceOfTab
   * @param {Array<LH.Artifacts.TaskNode>} outputArray
   * @return {Promise<void>}
   */
  static async _coalesceChildFrameTasks(traceOfTab, outputArray) {
    for (const t of traceOfTab.childTraces) {
      const threadTasks =
        await MainThreadTasks_.getMainThreadTasks(t.mainThreadEvents, t.timestamps.traceEnd);
      outputArray.push(...threadTasks);
      this._coalesceChildFrameTasks(t, outputArray);
    }
  }

  /**
   * @param {LH.Trace} trace
   * @param {LH.Audit.Context} context
   * @return {Promise<Array<LH.Artifacts.TaskNode>>}
   */
  static async compute_(trace, context) {
    const traceOfTab = await TraceOfTab.request(trace, context);
    const tasks = await MainThreadTasks_.getMainThreadTasks(
      traceOfTab.mainThreadEvents, traceOfTab.timestamps.traceEnd);
    if (context.settings.pierceIframes) {
      this._coalesceChildFrameTasks(traceOfTab, tasks);
    }
    return tasks;
  }
}

module.exports = makeComputedArtifact(MainThreadTasks);
