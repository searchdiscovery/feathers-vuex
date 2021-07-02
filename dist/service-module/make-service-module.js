/*
eslint
@typescript-eslint/explicit-function-return-type: 0,
@typescript-eslint/no-explicit-any: 0
*/
import _pick from 'lodash/pick'
import _merge from 'lodash/merge'
import makeDefaultState from './service-module.state'
import makeGetters from './service-module.getters'
import makeMutations from './service-module.mutations'
import makeActions from './service-module.actions'
export default function makeServiceModule(service, options, store) {
  const defaults = {
    namespaced: true,
    state: makeDefaultState(options),
    getters: makeGetters(),
    mutations: makeMutations(),
    actions: makeActions({ service, options })
  }
  const fromOptions = _pick(options, [
    'state',
    'getters',
    'mutations',
    'actions'
  ])
  const merged = _merge({}, defaults, fromOptions)
  const extended = options.extend({ store, module: merged })
  const finalModule = _merge({}, merged, extended)
  return finalModule
}
