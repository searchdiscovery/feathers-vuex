/*
eslint
no-console: 0,
@typescript-eslint/explicit-function-return-type: 0,
@typescript-eslint/no-explicit-any: 0
*/
import inflection from 'inflection'
export default function makeFindMixin(options) {
  const {
    service,
    params,
    fetchParams,
    queryWhen,
    id,
    local = false,
    qid = 'default',
    item,
    debug
  } = options
  let { name, watch = [] } = options
  if (typeof watch === 'string') {
    watch = [watch]
  } else if (typeof watch === 'boolean' && watch) {
    watch = ['query']
  }
  if (
    !service ||
    (typeof service !== 'string' && typeof service !== 'function')
  ) {
    throw new Error(
      `The 'service' option is required in the FeathersVuex make-find-mixin and must be a string.`
    )
  }
  if (typeof service === 'function' && !name) {
    name = 'service'
  }
  const nameToUse = (name || service).replace(/-/g, '_')
  const singularized = inflection.singularize(nameToUse)
  const prefix = inflection.camelize(singularized, true)
  const capitalized = prefix.charAt(0).toUpperCase() + prefix.slice(1)
  const SERVICE_NAME = `${prefix}ServiceName`
  let ITEM = item || prefix
  if (typeof service === 'function' && name === 'service' && !item) {
    ITEM = 'item'
  }
  const IS_GET_PENDING = `isGet${capitalized}Pending`
  const PARAMS = `${prefix}Params`
  const FETCH_PARAMS = `${prefix}FetchParams`
  const WATCH = `${prefix}Watch`
  const QUERY_WHEN = `${prefix}QueryWhen`
  const ERROR = `${prefix}Error`
  const GET_ACTION = `get${capitalized}`
  const GET_GETTER = `get${capitalized}FromStore`
  const HAS_ITEM_BEEN_REQUESTED_ONCE = `has${capitalized}BeenRequestedOnce`
  const HAS_ITEM_LOADED_ONCE = `has${capitalized}LoadedOnce`
  const LOCAL = `${prefix}Local`
  const QID = `${prefix}Qid`
  const ID = `${prefix}Id`
  const data = {
    [IS_GET_PENDING]: false,
    [HAS_ITEM_BEEN_REQUESTED_ONCE]: false,
    [HAS_ITEM_LOADED_ONCE]: false,
    [WATCH]: watch,
    [QID]: qid,
    [ERROR]: null
  }
  const mixin = Object.assign(
    {
      data() {
        return data
      },
      computed: {
        [ITEM]() {
          return this[ID]
            ? this.$store.getters[`${this[SERVICE_NAME]}/get`](this[ID])
            : null
        },
        [QUERY_WHEN]() {
          return true
        },
        // Exposes `get<Item>FromStore`
        [GET_GETTER]() {
          return (id) => {
            const serviceName = this[SERVICE_NAME]
            return this.$store.getters[`${serviceName}/get`](id)
          }
        }
      },
      methods: {
        [GET_ACTION](id, params) {
          const paramsToUse = params || this[FETCH_PARAMS] || this[PARAMS]
          const idToUse = id || this[ID]
          if (this[QUERY_WHEN]) {
            this[IS_GET_PENDING] = true
            this[HAS_ITEM_BEEN_REQUESTED_ONCE] = true
            if (idToUse != null) {
              return this.$store
                .dispatch(`${this[SERVICE_NAME]}/get`, [idToUse, paramsToUse])
                .then((response) => {
                  // To prevent thrashing, only clear ERROR on response, not on initial request.
                  this[ERROR] = null
                  this[HAS_ITEM_LOADED_ONCE] = true
                  this[IS_GET_PENDING] = false
                  return response
                })
                .catch((error) => {
                  this[ERROR] = error
                  return error
                })
            }
          }
        }
      }
    },
    !local && {
      created() {
        if (debug) {
          console.log(
            `running 'created' hook in makeGetMixin for service "${service}" (using name ${nameToUse}")`
          )
          console.log(ID, this[ID])
          console.log(PARAMS, this[PARAMS])
          console.log(FETCH_PARAMS, this[FETCH_PARAMS])
        }
        const pType = Object.getPrototypeOf(this)
        if (
          this.hasOwnProperty(ID) ||
          pType.hasOwnProperty(ID) ||
          pType.hasOwnProperty(PARAMS) ||
          pType.hasOwnProperty(FETCH_PARAMS)
        ) {
          if (!watch.includes(ID)) {
            watch.push(ID)
          }
          watch.forEach((prop) => {
            if (typeof prop !== 'string') {
              throw new Error(`Values in the 'watch' array must be strings.`)
            }
            prop = prop.replace('query', PARAMS)
            if (pType.hasOwnProperty(FETCH_PARAMS)) {
              if (prop.startsWith(PARAMS)) {
                prop.replace(PARAMS, FETCH_PARAMS)
              }
            }
            this.$watch(prop, function () {
              return this[GET_ACTION]()
            })
          })
          return this[GET_ACTION]()
        } else {
          console.log(
            `No "${ID}", "${PARAMS}" or "${FETCH_PARAMS}" attribute was found in the makeGetMixin for the "${service}" service (using name "${nameToUse}").  No queries will be made.`
          )
        }
      }
    }
  )
  function hasSomeAttribute(vm, ...attributes) {
    return attributes.some((a) => {
      return vm.hasOwnProperty(a) || Object.getPrototypeOf(vm).hasOwnProperty(a)
    })
  }
  function setupAttribute(
    NAME,
    value,
    computedOrMethods = 'computed',
    returnTheValue = false
  ) {
    if (typeof value === 'boolean') {
      data[NAME] = !!value
    } else if (typeof value === 'string') {
      mixin.computed[NAME] = function () {
        // If the specified computed prop wasn't found, display an error.
        if (!returnTheValue) {
          if (!hasSomeAttribute(this, value, NAME)) {
            throw new Error(
              `Value for ${NAME} was not found on the component at '${value}'.`
            )
          }
        }
        return returnTheValue ? value : this[value]
      }
    } else if (typeof value === 'function') {
      mixin[computedOrMethods][NAME] = value
    }
  }
  setupAttribute(SERVICE_NAME, service, 'computed', true)
  setupAttribute(ID, id)
  setupAttribute(PARAMS, params)
  setupAttribute(FETCH_PARAMS, fetchParams)
  setupAttribute(QUERY_WHEN, queryWhen, 'computed')
  setupAttribute(LOCAL, local)
  return mixin
}
