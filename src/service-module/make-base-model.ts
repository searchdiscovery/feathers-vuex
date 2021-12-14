/*
eslint
@typescript-eslint/explicit-function-return-type: 0,
@typescript-eslint/no-explicit-any: 0
*/
import {
  FeathersVuexOptions,
  Id,
  ModelInstanceOptions,
  Model,
  ModelStatic,
  GlobalModels,
  StoreState,
  AnyData,
  PatchParams
} from './types'
import { globalModels, prepareAddModel } from './global-models'
import { mergeWithAccessors, checkNamespace, getId, Params } from '../utils'
import _merge from 'lodash/merge'
import _get from 'lodash/get'
import { EventEmitter } from 'events'
import { ModelSetupContext } from './types'
import { Store } from 'vuex'
import { GetterName } from './service-module.getters'

const defaultOptions = {
  clone: false,
  commit: true,
  merge: true
}

/** Ensures value has EventEmitter instance props */
function assertIsEventEmitter(val: unknown): asserts val is EventEmitter {
  if (
    !Object.keys(EventEmitter.prototype).every((eeKey) =>
      Object.prototype.hasOwnProperty.call(val, eeKey)
    )
  ) {
    throw new Error(`Expected EventEmitter, but got ${val}`)
  }
}

/**
 *
 * @param options
 */
export default function makeBaseModel(options: FeathersVuexOptions) {
  const addModel = prepareAddModel(options)
  const { serverAlias } = options

  // If this serverAlias already has a BaseModel, return it
  const ExistingBaseModel = _get(globalModels, [serverAlias, 'BaseModel'])
  if (ExistingBaseModel) {
    return ExistingBaseModel as ModelStatic
  }

  abstract class BaseModel implements Model {
    // Think of these as abstract static properties
    public static servicePath: string
    public static namespace: string
    public static keepCopiesInStore = options.keepCopiesInStore
    // eslint-disable-next-line
    public static instanceDefaults(data: AnyData, ctx: ModelSetupContext) {
      return data
    }
    // eslint-disable-next-line
    public static setupInstance(data: AnyData, ctx: ModelSetupContext) {
      return data
    }
    public static diffOnPatch(data: AnyData) {
      return data
    }

    // Monkey patched onto the Model class in `makeServicePlugin()`
    public static store: Store<StoreState>

    public static idField: string = options.idField
    public static tempIdField: string = options.tempIdField
    public static preferUpdate: boolean = options.preferUpdate
    public static serverAlias: string = options.serverAlias

    public static readonly models = globalModels as GlobalModels // Can access other Models here

    public static readonly copiesById: {
      [key: string]: Model | undefined
      [key: number]: Model | undefined
    } = {}

    public __id: string
    public __isClone: boolean
    public __isTemp: boolean

    public static merge = mergeWithAccessors
    public static modelName = 'BaseModel'

    public constructor(data: AnyData, options: ModelInstanceOptions) {
      // You have to pass at least an empty object to get a tempId.
      data = data || {}
      options = Object.assign({}, defaultOptions, options)

      const {
        store,
        keepCopiesInStore,
        copiesById: copiesByIdOnModel,
        models,
        instanceDefaults,
        idField,
        tempIdField,
        setupInstance,
        getFromStore,
        namespace,
        _commit
      } = this.constructor as typeof BaseModel
      const id = getId(data, idField)
      const hasValidId = id !== null && id !== undefined
      const tempId =
        data && data.hasOwnProperty(tempIdField) ? data[tempIdField] : undefined
      const hasValidTempId = tempId !== null && tempId !== undefined
      const copiesById = keepCopiesInStore
        ? store?.state[namespace].copiesById
        : copiesByIdOnModel

      if (store?.state?.[namespace]?.replaceItems !== true) {
        const existingItem =
          hasValidId && !options.clone
            ? getFromStore.call(this.constructor, id)
            : null

        // If it already exists, update the original and return
        if (existingItem) {
          data = setupInstance.call(this, data, { models, store }) || data
          _commit.call(this.constructor, 'mergeInstance', data)
          return existingItem
        }
      }

      // If cloning and a clone already exists, update and return the original clone. Only one clone is allowed.
      const existingClone =
        (hasValidId || hasValidTempId) && options.clone
          ? copiesById[id] || copiesById[tempId]
          : null
      if (existingClone) {
        // This must be done in a mutation to avoid Vuex errors.
        _commit.call(this.constructor, 'merge', {
          dest: existingClone,
          source: data
        })
        return existingClone
      }

      // Mark as a clone
      if (options.clone) {
        Object.defineProperty(this, '__isClone', {
          value: true,
          enumerable: false
        })
      }

      // Setup instanceDefaults
      if (instanceDefaults && typeof instanceDefaults === 'function') {
        const defaults =
          instanceDefaults.call(this, data, { models, store }) || data
        mergeWithAccessors(this, defaults)
      }

      // Handles Vue objects or regular ones. We can't simply assign or return
      // the data due to how Vue wraps everything into an accessor.
      if (options.merge !== false) {
        mergeWithAccessors(
          this,
          setupInstance.call(this, data, { models, store }) || data
        )
      }

      // Add the item to the store
      if (!options.clone && options.commit !== false && store) {
        _commit.call(this.constructor, 'addItem', this)
      }
      return this
    }

    /**
     * Calls `getter`, passing this model's ID as the parameter
     * @param getter name of getter to call
     */
    private getGetterWithId(getter: GetterName): unknown {
      const { _getters, idField, tempIdField } = this
        .constructor as typeof BaseModel
      const id =
        getId(this, idField) != null ? getId(this, idField) : this[tempIdField]
      return _getters.call(this.constructor, getter, id)
    }

    get isCreatePending(): boolean {
      return this.getGetterWithId('isCreatePendingById') as boolean
    }
    get isUpdatePending(): boolean {
      return this.getGetterWithId('isUpdatePendingById') as boolean
    }
    get isPatchPending(): boolean {
      return this.getGetterWithId('isPatchPendingById') as boolean
    }
    get isRemovePending(): boolean {
      return this.getGetterWithId('isRemovePendingById') as boolean
    }
    get isSavePending(): boolean {
      return this.getGetterWithId('isSavePendingById') as boolean
    }
    get isPending(): boolean {
      return this.getGetterWithId('isPendingById') as boolean
    }

    public static getId(record: Record<string, any>): string {
      const { idField } = this.constructor as typeof BaseModel
      return getId(record, idField)
    }

    public static find(params?: Params) {
      return this._dispatch('find', params)
    }

    public static findInStore(params?: Params) {
      return this._getters('find', params)
    }

    public static count(params?: Params) {
      return this._dispatch('count', params)
    }

    public static countInStore(params?: Params) {
      return this._getters('count', params)
    }

    public static get(id: Id, params?: Params) {
      if (params) {
        return this._dispatch('get', [id, params])
      } else {
        return this._dispatch('get', id)
      }
    }

    public static getFromStore(id: Id, params?: Params) {
      return this._getters('get', id, params)
    }

    /**
     * An alias for store.getters. Can only call function-based getters, since
     * it's meant for only `find` and `get`.
     * @param method the vuex getter name without the namespace
     * @param payload if provided, the getter will be called as a function
     */
    public static _getters(name: GetterName, idOrParams?: any, params?: any) {
      const { namespace, store } = this

      if (checkNamespace(namespace, this, options.debug)) {
        if (!store.getters.hasOwnProperty(`${namespace}/${name}`)) {
          throw new Error(`Could not find getter named ${namespace}/${name}`)
        }
        return store.getters[`${namespace}/${name}`](idOrParams, params)
      }
    }
    /**
     * An alias for store.commit
     * @param method the vuex mutation name without the namespace
     * @param payload the payload for the mutation
     */
    public static _commit(method: string, payload: any): void {
      const { namespace, store } = this

      if (checkNamespace(namespace, this, options.debug)) {
        store.commit(`${namespace}/${method}`, payload)
      }
    }
    /**
     * An alias for store.dispatch
     * @param method the vuex action name without the namespace
     * @param payload the payload for the action
     */
    public static _dispatch(method: string, payload: any) {
      const { namespace, store } = this

      if (checkNamespace(namespace, this, options.debug)) {
        return store.dispatch(`${namespace}/${method}`, payload)
      }
    }

    /**
     * make the server side documents hydrated on client a FeathersVuexModel
     */
    public static hydrateAll() {
      const { namespace, store } = this
      const state = store.state[namespace]
      const commit = store.commit
      // Replace each plain object with a model instance.
      Object.keys(state.keyedById).forEach((id) => {
        const record = state.keyedById[id]
        commit(`${namespace}/removeItem`, record)
        commit(`${namespace}/addItem`, record)
      })
    }

    /**
     * clone the current record using the `createCopy` mutation
     */
    public clone(data: AnyData): this {
      const { idField, tempIdField } = this.constructor as typeof BaseModel
      if (this.__isClone) {
        throw new Error('You cannot clone a copy')
      }
      const id =
        getId(this, idField) != null ? getId(this, idField) : this[tempIdField]
      return this._clone(id, data)
    }

    private _clone(id, data = {}) {
      const { store, namespace, _commit, _getters } = this
        .constructor as typeof BaseModel
      const { keepCopiesInStore } = store.state[namespace]

      _commit.call(this.constructor, `createCopy`, id)

      if (keepCopiesInStore) {
        return Object.assign(
          _getters.call(this.constructor, 'getCopyById', id),
          data
        )
      } else {
        // const { copiesById } = this.constructor as typeof BaseModel
        return Object.assign(
          (this.constructor as typeof BaseModel).copiesById[id],
          data
        )
      }
    }
    /**
     * Reset a clone to match the instance in the store.
     */
    public reset(): this {
      const { idField, tempIdField, _commit } = this
        .constructor as typeof BaseModel

      if (this.__isClone) {
        const id =
          getId(this, idField) != null
            ? getId(this, idField)
            : this[tempIdField]
        _commit.call(this.constructor, 'resetCopy', id)
        return this
      } else {
        throw new Error('You cannot reset a non-copy')
      }
    }

    /**
     * Update a store instance to match a clone.
     */
    public commit(): this {
      const { idField, tempIdField, _commit, _getters } = this
        .constructor as typeof BaseModel
      if (this.__isClone) {
        const id =
          getId(this, idField) != null
            ? getId(this, idField)
            : this[tempIdField]
        _commit.call(this.constructor, 'commitCopy', id)

        return _getters.call(this.constructor, 'get', id)
      } else {
        throw new Error('You cannot call commit on a non-copy')
      }
    }

    /**
     * A shortcut to either call create or patch/update
     * @param params
     */
    public save(params?: Params): Promise<this> {
      const { idField, preferUpdate } = this.constructor as typeof BaseModel
      const id = getId(this, idField)
      if (id != null) {
        return preferUpdate ? this.update(params) : this.patch(params)
      } else {
        return this.create(params)
      }
    }
    /**
     * Calls service create with the current instance data
     * @param params
     */
    public create(params?: Params): Promise<this> {
      const { _dispatch } = this.constructor as typeof BaseModel
      const data = Object.assign({}, this)
      if (data[options.idField] === null) {
        delete data[options.idField]
      }
      return _dispatch.call(this.constructor, 'create', [data, params])
    }

    /**
     * Calls service patch with the current instance data
     * @param params
     */
    public patch<D extends {} = AnyData>(
      params?: PatchParams<D>
    ): Promise<this> {
      const { idField, _dispatch } = this.constructor as typeof BaseModel
      const id = getId(this, idField)

      if (id == null) {
        const error = new Error(
          `Missing ${idField} property. You must create the data before you can patch with this data`
        )
        return Promise.reject(error)
      }
      return _dispatch.call(this.constructor, 'patch', [id, this, params])
    }

    /**
     * Calls service update with the current instance data
     * @param params
     */
    public update(params?: Params): Promise<this> {
      const { idField, _dispatch } = this.constructor as typeof BaseModel
      const id = getId(this, idField)

      if (id !== 0 && !id) {
        const error = new Error(
          `Missing ${idField} property. You must create the data before you can update with this data`
        )
        return Promise.reject(error)
      }
      return _dispatch.call(this.constructor, 'update', [id, this, params])
    }

    /**
     * Calls service remove with the current instance id
     * @param params
     */
    public remove(params?: Params): Promise<this> {
      const { idField, tempIdField, _dispatch, _commit } = this
        .constructor as typeof BaseModel
      const id = getId(this, idField)

      if (id != null) {
        if (params && params.eager) {
          _commit.call(this.constructor, 'removeItem', id)
        }
        return _dispatch.call(this.constructor, 'remove', [id, params])
      } else {
        // is temp
        _commit.call(this.constructor, 'removeTemps', [this[tempIdField]])
        _commit.call(this.constructor, 'clearCopy', [this[tempIdField]])
        return Promise.resolve(this)
      }
    }

    public toJSON() {
      return _merge({}, this)
    }
  }
  for (const n in EventEmitter.prototype) {
    BaseModel[n] = EventEmitter.prototype[n]
  }

  addModel(BaseModel)

  const BaseModelEventEmitter = BaseModel
  assertIsEventEmitter(BaseModelEventEmitter)
  return BaseModelEventEmitter as ModelStatic
}
