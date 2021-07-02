/*
eslint
@typescript-eslint/explicit-function-return-type: 0,
@typescript-eslint/no-explicit-any: 0
*/
import sift from 'sift'
import { _ } from '@feathersjs/commons'
import { filterQuery, sorter, select } from '@feathersjs/adapter-commons'
import { globalModels as models } from './global-models'
import _get from 'lodash/get'
import _omit from 'lodash/omit'
import { isRef } from '@vue/composition-api'
const FILTERS = ['$sort', '$limit', '$skip', '$select']
const additionalOperators = ['$elemMatch']
const getCopiesById = ({
  keepCopiesInStore,
  servicePath,
  serverAlias,
  copiesById
}) => {
  if (keepCopiesInStore) {
    return copiesById
  } else {
    const Model = _get(models, [serverAlias, 'byServicePath', servicePath])
    return Model.copiesById
  }
}
export default function makeServiceGetters() {
  return {
    list(state) {
      return state.ids.map((id) => state.keyedById[id])
    },
    find: (state) => (params) => {
      if (isRef(params)) {
        params = params.value
      }
      params = Object.assign({}, params) || {}
      // Set params.temps to true to include the tempsById records
      params.temps = params.hasOwnProperty('temps') ? params.temps : false
      // Set params.copies to true to include the copiesById records
      params.copies = params.hasOwnProperty('copies') ? params.copies : false
      const { paramsForServer = [], whitelist, keyedById } = state
      const paramsForServerByValue = paramsForServer.filter((el) =>
        Array.isArray(el)
      )
      const q = paramsForServerByValue.reduce(
        (acc, [key, valueOrPredicate]) => {
          if (!acc[key] || (acc[key] && !valueOrPredicate)) return acc
          if (
            ((typeof valueOrPredicate === 'string' ||
              typeof valueOrPredicate === 'number') &&
              acc[key] === valueOrPredicate) ||
            (typeof valueOrPredicate === 'function' &&
              valueOrPredicate(acc[key]))
          ) {
            return _omit(acc, key)
          }
          return acc
        },
        _omit(
          params.query || {},
          paramsForServer.filter((el) => typeof el === 'string')
        )
      )
      const { query, filters } = filterQuery(q, {
        operators: additionalOperators.concat(whitelist)
      })
      let values = _.values(keyedById)
      if (params.temps) {
        values.push(..._.values(state.tempsById))
      }
      values = values.filter(sift(query))
      if (params.copies) {
        const { idField } = state
        const copiesById = getCopiesById(state)
        values.forEach((val, i, arr) => {
          const copy = copiesById[val[idField]]
          if (copy) {
            // replace keyedById value with existing clone value
            arr[i] = copy
          }
        })
      }
      const total = values.length
      if (filters.$sort) {
        values.sort(sorter(filters.$sort))
      }
      if (filters.$skip) {
        values = values.slice(filters.$skip)
      }
      if (typeof filters.$limit !== 'undefined') {
        values = values.slice(0, filters.$limit)
      }
      if (filters.$select) {
        values = values.map((value) =>
          _.pick(value, ...filters.$select.slice())
        )
      }
      return {
        total,
        limit: filters.$limit || 0,
        skip: filters.$skip || 0,
        data: values
      }
    },
    count: (state, getters) => (params) => {
      if (isRef(params)) {
        params = params.value
      }
      if (!params.query) {
        throw 'params must contain a query-object'
      }
      const cleanQuery = _omit(params.query, FILTERS)
      params.query = cleanQuery
      return getters.find(params).total
    },
    get:
      ({ keyedById, tempsById, idField, tempIdField }) =>
      (id, params = {}) => {
        if (isRef(id)) {
          id = id.value
        }
        if (isRef(params)) {
          params = params.value
        }
        const record = keyedById[id] && select(params, idField)(keyedById[id])
        if (record) {
          return record
        }
        const tempRecord =
          tempsById[id] && select(params, tempIdField)(tempsById[id])
        return tempRecord || null
      },
    getCopyById: (state) => (id) => {
      const copiesById = getCopiesById(state)
      return copiesById[id]
    },
    isCreatePendingById:
      ({ isIdCreatePending }) =>
      (id) =>
        isIdCreatePending.includes(id),
    isUpdatePendingById:
      ({ isIdUpdatePending }) =>
      (id) =>
        isIdUpdatePending.includes(id),
    isPatchPendingById:
      ({ isIdPatchPending }) =>
      (id) =>
        isIdPatchPending.includes(id),
    isRemovePendingById:
      ({ isIdRemovePending }) =>
      (id) =>
        isIdRemovePending.includes(id),
    isSavePendingById: (state, getters) => (id) =>
      getters.isCreatePendingById(id) ||
      getters.isUpdatePendingById(id) ||
      getters.isPatchPendingById(id),
    isPendingById: (state, getters) => (id) =>
      getters.isSavePendingById(id) || getters.isRemovePendingById(id)
  }
}
