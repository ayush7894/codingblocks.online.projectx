import Component from '@ember/component';
import { action, set, computed } from '@ember/object';
import { alias } from '@ember/object/computed';
import { A } from '@ember/array';
import { task, taskGroup, restartableTask } from 'ember-concurrency-decorators';
import { inject as service } from '@ember/service';
import { later } from '@ember/runloop';

export default class CodeEditor extends Component {
  @service taskPoller
  @service currentUser
  @service api
  @service player
  @service store
  @service firepad

  @alias('judgeTaskGroup.lastSuccessful.value.judge-result') lastResult
  @alias('judgeTaskGroup.lastSuccessful.value.explanation') explanation
  @alias('firepad.connected') isCollaborating

  @computed('explanation')
  get headerForExplanation() {
    switch(this.explanation) {
      case "Perfect": return "Perfect";
      case "FailedTestcase": return "Failed Testcases";
      case "TimeLimitExceeded": return "Time Limit Exceeded";
      case "CompilationError": return "Compilation Error";
      case "ContestOver": return "Contest Over";
      case "TestcaseUnlocked": return "Testcase Unlocked";
      case "EditorialUnlocked": return "Editorial Unlocked";
    }
  }
  
  showExplanation = false
  customInputOpen = true
  customInputText = ''
  languageSpecs = A([
    {
      name: "C++",
      code: "cpp",
      mode: "cpp",
      source: ""
    },
    {
      name: "C",
      code: "c",
      mode: "c",
      source: ""
    },
    {
      name: "Python 2.7",
      code: "py2",
      mode: "python",
      source: ""
    },
    {
      name: "Python 3",
      code: "py3",
      mode: "python",
      source: ""
    },
    {
      name: "Node",
      code: "js",
      mode: "javascript",
      source: ""
    },
    {
      name: "Java 8",
      code: "java",
      mode: "java",
      source: ""
    },
    {
      name: "C#",
      code: "csharp",
      mode: "csharp",
      source: ""
    }
  ])

  setCodeStubs() {
    this.problem.solutionStubs.map(stub => {
      const languageSpec = this.languageSpecs.findBy('code', stub.language)
      if (languageSpec.source === '') {
        set(languageSpec, 'source', stub.body)
      }
    })
  }

  didReceiveAttrs() {
    this.set('selectedLanguage', this.languageSpecs[0])
    this.setCodeStubs()
  }

  didInsertElement () {
    this._super(...arguments)
    const monacoIframe = document.querySelector('iframe[src*="ember-monaco"]')
    monacoIframe.addEventListener('load', () => {
      const iframeWindow = monacoIframe.contentWindow
      
      // Get the editor reference and set monaco global
      this.editor = iframeWindow.editor
      window.monaco = iframeWindow.monaco

      const firepad = this.firepad
      firepad.set("editor", this.editor)

      // if we have a ref; connect to firebase
      if (this.ref) {
        firepad.connect(this.ref, false)
      } else {
        firepad.disconnect()
      }
    })
  }

  @taskGroup({drop: true}) judgeTaskGroup

  @task({group: 'judgeTaskGroup'}) runCodeTask = function *() {
    this.set('showExplanation', false)
    this.set('api.headers.hackJwt', this.get('currentUser.user.hackJwt'))
    const payload = yield this.api.request("code_challenges/submit", {
      method: "POST",
      data: {
        problemId: this.codeChallenge.get("hbProblemId"),
        custom_input: window.btoa(this.customInputText),
        source: window.btoa(this.selectedLanguage.source),
        language: this.selectedLanguage.code,
      },
    });

    const submissionId = payload.submissionId
    const status = yield this.taskPoller.performPoll(() => this.get("api").request("code_challenges/status/" + submissionId, {
        "method": "GET"
    }), submissionStatus => submissionStatus && submissionStatus['judge-result'] !== null);
    return status
  }

  @task({group: 'judgeTaskGroup'}) submitCodeTask = function *() {
    this.set('showExplanation', false)
    const runAttempt = this.store.peekRecord('run-attempt', this.player.runAttemptId)
    this.set('api.headers.hackJwt', this.get('currentUser.user.hackJwt'))
    const payload = yield this.get("api").request("code_challenges/submit", {
      method: "POST",
      data: {
        contestId: runAttempt.get("run.contestId"),
        problemId: this.codeChallenge.get("hbProblemId"),
        language: this.selectedLanguage.code,
        source: window.btoa(this.selectedLanguage.source)
      }
    });

    const submissionId = payload.submissionId
    const status = yield this.taskPoller.performPoll(() => this.get("api").request("code_challenges/status/" + submissionId, {
      "method": "GET"
    }), submissionStatus => submissionStatus && submissionStatus['judge-result'] !== null);

    this.get('api').request('code_challenges/problems',{
      data: {
        contest_id: runAttempt.get("run.contestId"),
        problem_id: this.codeChallenge.get("hbProblemId")
      },
    }).then(async result=>{
      this.set("problemJsonApiPayload", result);
      const payload = JSON.parse(JSON.stringify(result))
      this.get('store').unloadAll('problem')
      later(async() => {
        this.get('store').pushPayload(payload)
        const problem = await this.get('store').peekRecord('problem', this.codeChallenge.get('hbProblemId'))
        if (await problem.get('hasLatestSubmissionPassed') && await problem.get('mostSuccessfullSubmission.score') == 100) {
          const progress = await this.get('content.progress')
          debugger
          progress.set("status", 'DONE')
          return progress.save();
        }
      }, 0)
    })
  
    //invalidate leaderboard cache
    const runId = this.get('run.id')
    yield this.get('api').raw(`/runs/${runId}/leaderboard/invalidate`, {
      method: 'POST',
    })

    this.set('showExplanation', true)
    return status
  }

  @action
  toggleCustomInput() {
    this.toggleProperty('customInputOpen')
  }

  @action
  selectLanguage(code) {
    const language = this.languageSpecs.findBy('code', code)
    this.set('selectedLanguage', language)
  }

  @action
  onEditorReady (editor) {
    const monacoIframe = document.querySelector('iframe[src*="ember-monaco"]')
    
    // Get the editor reference and set monaco global
    
    this.set('editor', editor)
    window.monaco = monacoIframe.contentWindow.monaco

    const firepad = this.firepad
    firepad.set("editor", this.editor)

    // if we have a ref; connect to firebase
    if (this.ref) {
      firepad.connect(this.ref, false)
    } else {
      firepad.disconnect()
    }
  }

  @restartableTask setCollabModeTask = function *(value) {
    if (value) {
      yield this.firepad.connect()
    } else {
      this.firepad.disconnect()
    }
  }
}
