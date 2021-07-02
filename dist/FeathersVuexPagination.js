import {
  // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
  // @ts-ignore
  createElement as baseCreateElement,
  // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
  // @ts-ignore
  h,
  computed,
  watch
} from '@vue/composition-api'
/**
 * Allow for usage with newer (^1.0.0) @vue/composition-api releases
 * See: https://github.com/feathersjs-ecosystem/feathers-vuex/issues/504
 */
const createElement = baseCreateElement || h
export default {
  name: 'FeathersVuexPagination',
  props: {
    /**
     * An object containing { $limit, and $skip }
     */
    value: {
      type: Object,
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      default: () => null
    },
    /**
     * The `latestQuery` object from the useFind data
     */
    latestQuery: {
      type: Object,
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      default: () => null
    }
  },
  // eslint-disable-next-line
  setup(props, context) {
    /**
     * The number of pages available based on the results returned in the latestQuery prop.
     */
    const pageCount = computed(() => {
      const q = props.latestQuery
      if (q && q.response) {
        return Math.ceil(q.response.total / props.value.$limit)
      } else {
        return 1
      }
    })
    /**
     * The `currentPage` is calculated based on the $limit and $skip values provided in
     * the v-model object.
     *
     * Setting `currentPage` to a new numeric value will emit the appropriate values out
     * the v-model. (using the default `input` event)
     */
    const currentPage = computed({
      set(pageNumber) {
        if (pageNumber < 1) {
          pageNumber = 1
        } else if (pageNumber > pageCount.value) {
          pageNumber = pageCount.value
        }
        const $limit = props.value.$limit
        const $skip = $limit * (pageNumber - 1)
        context.emit('input', { $limit, $skip })
      },
      get() {
        const params = props.value
        if (params) {
          return pageCount.value === 0 ? 0 : params.$skip / params.$limit + 1
        } else {
          return 1
        }
      }
    })
    watch(
      () => pageCount.value,
      () => {
        const lq = props.latestQuery
        if (lq && lq.response && currentPage.value > pageCount.value) {
          currentPage.value = pageCount.value
        }
      }
    )
    const canPrev = computed(() => {
      return currentPage.value - 1 > 0
    })
    const canNext = computed(() => {
      return currentPage.value < pageCount.value
    })
    function toStart() {
      currentPage.value = 1
    }
    function toEnd() {
      currentPage.value = pageCount.value
    }
    function toPage(pageNumber) {
      currentPage.value = pageNumber
    }
    function next() {
      currentPage.value++
    }
    function prev() {
      currentPage.value--
    }
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    return () => {
      if (context.slots.default) {
        return context.slots.default({
          currentPage: currentPage.value,
          pageCount: pageCount.value,
          canPrev: canPrev.value,
          canNext: canNext.value,
          toStart,
          toEnd,
          toPage,
          prev,
          next
        })
      } else {
        return createElement('div', {}, [
          createElement('p', `FeathersVuexPagination uses the default slot:`),
          createElement('p', `#default="{ currentPage, pageCount }"`)
        ])
      }
    }
  }
}
