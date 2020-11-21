// ------------------------------------------------------------------------------------- DATA

const reserved_data_name = ['begin_update', 'end_update']

// ------------------------------------------------------------------------------------- METHODS

// ------------------------------------------------ UTILS

let clone = (obj) => JSON.parse(JSON.stringify(obj))

let now = () => Date.now()

// ------------------------------------------------ TRACKER INIT

const update_time_ms = 1000
function init_tracker(tracker, history, end_update_cb) {

    // --- exception system
    let error = (error) => { throw error }

    const { image } = tracker

    // --- input data management
    let input_data = tracker.data ?? {}
    let missing_required_inputs = image.required_inputs.filter(input_name => !(input_name in input_data))
    if (missing_required_inputs.length > 0)
        error(`missing required inputs: ${missing_required_inputs.map(n => `"${n}"`).join(', ')}`)

    // --- updater system
    let update_tracker = async () => {
        // --- create data storer
        let data = clone(input_data)
        data.begin_update = now()
        const { pre_data, check_change, augment_data } = image

        // --- data registering system
        let register_data = async (data_map, data_name) => {
            if (reserved_data_name.includes(data_name)) error(`data name "${data_name}" is a reserved name`)
            if (data_name in data) return null
            let { dependencies, retriever } = data_map[data_name]
            let missing_dependencies = dependencies.filter(data_name => !(data_name in data))
            await Promise.all(missing_dependencies.map(async (data_name) => await register_data(data_map, data_name)))
            data[data_name] = await retriever(data)
        }

        // --- register all base data
        await Promise.all(Object.keys(pre_data).map(async data_name => await register_data(pre_data, data_name)))

        // --- check if update
        let last_data_point = history[history.length - 1] ?? null
        if (last_data_point == null || check_change(last_data_point, data)) {

            // --- register all augmenting data
            try {
                await Promise.all(Object.keys(augment_data).map(async data_name => await register_data(augment_data, data_name)))
            } catch (e) {
                console.log(e)
                if (!end_update_cb(data, history, e))
                    return
            }

            // --- save history
            data.end_update = now()
            history.push(clone(data))
            end_update_cb(data, history)
        }

    }

    // --- interval variables
    let last_update_time = now()
    let currently_updating = false
    const { min_ttu } = image

    // --- main updating system
    let update = async () => {
        // --- check time to update (updating is allowed ?)
        let this_time = now()
        if (currently_updating || (this_time - last_update_time) < min_ttu) return

        // --- update tracker data
        last_update_time = this_time
        currently_updating = true
        try {
            await update_tracker()
        } catch (e) {
            end_update_cb(null, history, e)
        }
        currently_updating = false
    }

    // --- updating interval
    let interval_int = setInterval(update, update_time_ms)
    update()

    return interval_int
}

module.exports = init_tracker