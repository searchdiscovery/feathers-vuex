/*
eslint
@typescript-eslint/no-explicit-any: 0
*/
import { computed, isRef, reactive, toRefs, watch } from '@vue/composition-api'
import debounce from 'lodash/debounce'
import { getItemsFromQueryInfo, getQueryInfo } from './utils'
const unwrapParams = (params) => (isRef(params) ? params.value : params)
export default function find(options) {
  const defaults = {
    model: null,
    params: null,
    qid: 'default',
    queryWhen: computed(() => true),
    local: false,
    immediate: true
  }
  const { model, params, queryWhen, qid, local, immediate } = Object.assign(
    {},
    defaults,
    options
  )
  if (!model) {
    throw new Error(
      `No model provided for useFind(). Did you define and register it with FeathersVuex?`
    )
  }
  const getFetchParams = (providedParams) => {
    const provided = unwrapParams(providedParams)
    if (provided) {
      return provided
    }
    const fetchParams = unwrapParams(options.fetchParams)
    // Returning null fetchParams allows the query to be skipped.
    if (fetchParams || fetchParams === null) {
      return fetchParams
    }
    const params = unwrapParams(options.params)
    return params
  }
  const state = reactive({
    qid,
    isPending: false,
    haveBeenRequested: false,
    haveLoaded: local,
    error: null,
    debounceTime: null,
    latestQuery: null,
    isLocal: local
  })
  const computes = {
    // The find getter
    items: computed(() => {
      const getterParams = unwrapParams(params)
      if (getterParams) {
        if (getterParams.paginate) {
          const serviceState = model.store.state[model.servicePath]
          const { defaultSkip, defaultLimit } = serviceState.pagination
          const skip = getterParams.query.$skip || defaultSkip
          const limit = getterParams.query.$limit || defaultLimit
          const pagination =
            computes.paginationData.value[getterParams.qid || state.qid] || {}
          const response = skip != null && limit != null ? { limit, skip } : {}
          const queryInfo = getQueryInfo(getterParams, response)
          const items = getItemsFromQueryInfo(
            pagination,
            queryInfo,
            serviceState.keyedById
          )
          return items
        } else {
          return model.findInStore(getterParams).data
        }
      } else {
        return []
      }
    }),
    paginationData: computed(() => {
      return model.store.state[model.servicePath].pagination
    }),
    servicePath: computed(() => model.servicePath)
  }
  function find(params) {
    params = unwrapParams(params)
    if (queryWhen.value && !state.isLocal) {
      state.isPending = true
      state.haveBeenRequested = true
      return model.find(params).then((response) => {
        // To prevent thrashing, only clear error on response, not on initial request.
        state.error = null
        state.haveLoaded = true
        if (!Array.isArray(response)) {
          const queryInfo = getQueryInfo(params, response)
          queryInfo.response = response
          queryInfo.isOutdated = false
          state.latestQuery = queryInfo
        }
        state.isPending = false
        return response
      })
    }
  }
  const methods = {
    findDebounced(params) {
      return find(params)
    }
  }
  function findProxy(params) {
    const paramsToUse = getFetchParams(params)
    if (paramsToUse && paramsToUse.debounce) {
      if (paramsToUse.debounce !== state.debounceTime) {
        methods.findDebounced = debounce(find, paramsToUse.debounce)
        state.debounceTime = paramsToUse.debounce
      }
      return methods.findDebounced(paramsToUse)
    } else if (paramsToUse) {
      return find(paramsToUse)
    } else {
      // Set error
    }
  }
  watch(
    () => getFetchParams(),
    () => {
      findProxy()
    },
    { immediate }
  )
  return Object.assign(
    Object.assign(Object.assign({}, computes), toRefs(state)),
    { find }
  )
}
