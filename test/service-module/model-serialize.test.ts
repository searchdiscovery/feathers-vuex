/*
eslint
@typescript-eslint/explicit-function-return-type: 0,
@typescript-eslint/no-explicit-any: 0
*/
import { assert } from 'chai'
import feathersVuex from '../../src/index'
import { feathersRestClient as feathersClient } from '../fixtures/feathers-client'
import { clearModels } from '../../src/service-module/global-models'
import _omit from 'lodash/omit'
import Vuex from 'vuex'

describe('Models - Serialize', function () {
  beforeEach(() => {
    clearModels()
  })

  it('allows customizing toJSON', function () {
    const { BaseModel, makeServicePlugin } = feathersVuex(feathersClient, {
      serverAlias: 'myApi'
    })

    class Task extends BaseModel {
      public static modelName = 'Task'
      public static instanceDefaults() {
        return {
          id: null,
          description: '',
          isComplete: false
        }
      }
      public toJSON() {
        return _omit(this, ['isComplete'])
      }
      public constructor(data, options?) {
        super(data, options)
      }
    }

    const servicePath = 'thingies'
    const plugin = makeServicePlugin({
      servicePath: 'thingies',
      Model: Task,
      service: feathersClient.service(servicePath)
    })

    new Vuex.Store({ plugins: [plugin] })

    const task = new Task({
      description: 'Hello, World!',
      isComplete: true
    })

    assert(!task.toJSON().hasOwnProperty('isComplete'), 'custom toJSON worked')
  })
})
