# BadTracker
bad tracker by Hugo Castaneda

This tracking system make it easy to keep track of unpushed data (especially REST API data)

## Principles

Today, most of the updated data is provided to customers via rudimentary push systems (websockets, push notifications, etc.). Nevertheless, it is still possible to find systems whose updated data are not pushed to users (due to a lack of knowledge or technical means). These data are (most of the time) only accessible via the REST APIs made available by these service providers.

To alleviate this problem, this system allows the automatic consultation of these data and the detection of their update in order to provide them to personalized callbacks.

To do so, a tracker instance is composed of an image indicating the tracking configuration and the parameters specific to this instance.

### Tracker image

A tracker image represents the tracking configuration to assist the system in loading pre_data, verifying data changes and loading larger data if necessary.

A tracker image is defined as follow.
 * **required_inputs** all requierd "input" data names necessary to load all new data
 * **min_ttu** minimum "Time To Update" before a new update is checked (plus time to execute)
 * **pre_data** all pre data needed to check id an update occured
   * **data loading object**
     * **dependencies** all data names needed before loading the current data object
     * **retriever** asynchronous method used to load the data object
 * **check_change** method used to check if an update occured compared to the last data point
 * **augment_data** all data loaded after a change has been detected (made of **data loading object**)


Here is a tracker image example (weather change tracker)
```js
{
    required_inputs: ['api_key', 'city_name'],
    min_ttu: 1000,
    pre_data: {
        'weather_data': {
            dependencies: [],
            retriever: async (data) => {
                const { api_key, city_name } = data
                let url = `https://api.openweathermap.org/data/2.5/weather?q=${city_name}&appid=${api_key}`
                return await api_call(url)
            }
        }
    },
    check_change: (previous_data, data) => data.weather_data.dt > previous_data.weather_data.dt,
    augment_data: {
        'forecast': {
            dependencies: [],
            retriever: async (data) => {
                const { api_key, city_name } = data
                let url = `https://api.openweathermap.org/data/2.5/forecast/daily?${city_name}&appid=${api_key}`
                return await api_call(url)
            }
        }
    }
}
```

In this example, the tracker retrieves the weather data available at the time of the request (pre_data). In `check_change`, we can see that the `dt` property allows to check if the weather data points is different from the last one (update date time). If this is the case, the tracker retrieves more information available in `augment_data`.

### Tracker instance

A tracker instance is used to launch a tracking from an image but using custom parameters.

A tracker instance is defined as follow.
 * **image** the tracker image used to configure the tracking
 * **data** input data used to initiate the `pre_data` values of the tracking image

Here is a tracker instance example (weather change tracker for the Lyon city in France)
```js
{
    image: weather_tracker_image,
    data: {
        api_key: process.env.APIKEY,
        city_name: 'lyon',
    }
}
```

Here, as described in the `required_inputs` property of the used image (weather_tracker_image), the instance provides two input data to the image allowing it to initialize the search for changes.

### Tracker Launch

Launching a tracker requires the use of a tracker instance and additional information useful for the decisions of the update system.

Initialisation method head
```js
init_tracker(tracker, history, end_update_cb)
```
 * **tracker** the tracker instance
 * **history** the past data point array history of the tracker (can be loaded/saved from a json file)
 * **end_update_cb** a call back used to inform the end user about data updates and errors

Data/Error callback head
```js
<anonymous>(data, history, error)
```
 * **data** new data retrieved from the tracker job
 * **history** the currently been updated tracker's history
 * **error** error event

The callback can be called when one of these three events occurs:
 * **data updated** the normal behavior. When new data is detected and the whole data (`pre_data` + `augment_data`) is loaded
 * **augment data load failed** an update has been detected but he augment_data retrieval failed (`data = pre_data`)
   * In this case, the system awaits a boolean return. It uses this boolean to know wether to save the `pre_data` to history anyway or not (if `false` it stops the update)
 * **pre data load failed** the pre_data loading failed (`data = null`)

## Usage

For the sake of demonstration, a simple [example.js](./example.js) script is given to help understand how relatively complex trackers can be setup using this system.

First setup the tracker(s) image(s)
```js
const https = require('https')

let weather_tracker_image = {
    required_inputs: ['api_key', 'city_name'],
    min_ttu: 1000,
    pre_data: {
        'weather_data': {
            dependencies: [],
            retriever: async (data) => {
                const { api_key, city_name } = data
                let url = `https://api.openweathermap.org/data/2.5/weather?q=${city_name}&appid=${api_key}`
                return new Promise((ok, err) => {
                    https.get(url, (res) => {
                        let body = ''
                        res.on("data", (chunk) => body += chunk)
                        res.on("end", () => {
                            let ret = JSON.parse(body)
                            if (ret.cod != 200) err(ret)
                            ok(JSON.parse(body))
                        })
                    }).on("error", (error) => error(err));
                })
            }
        },
    },
    check_change: (previous_data, data) => data.weather_data.dt > previous_data.weather_data.dt,
    augment_data: {
        'forecast': {
            dependencies: ['weather_data'],
            retriever: async (data) => {
                const { api_key } = data
                const { lat, lon } = data.weather_data.coord
                let url = `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&exclude=current,minutely,hourly,alerts&lon=${lon}&appid=${api_key}`
                return await api_call(url)
            }
        }
    }
}
```

Next create the tracker instances
```js
let all_trackers = {}

let all_cities_name = ['lyon', 'dijon', 'albi']

all_cities_name.forEach(city_name => {

    // --- create tracker instance
    let weather_tracker = {
        image: weather_tracker_image,
        data: {
            api_key: process.env.APIKEY,
            city_name: city_name,
        }
    }

    // --- mem tracker instance
    let tracker_name = `${city_name}_weather_tracker`
    all_trackers[tracker_name] = weather_tracker
})
```

And finaly initiate all the trackers
```js
for (let tracker_name in all_trackers) {
    tracker_init(all_trackers[tracker_name], [], (data, hist, err) => {
        if (err) {
            if (data) {
                console.log('augment failed on', tracker_name, err)
                return false
            }
            console.log('error on', tracker_name, err)
            return
        }
        console.log('NEW DATA on', tracker_name, data)
    })
}
```