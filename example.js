const https = require('https')
const tracker_init = require('.')

// ------------------------------------------------------------------------------------- METHODS

async function api_call(url) {
    return new Promise((ok, err) => {
        https.get(url, (res) => {
            let body = ''
            res.on("data", (chunk) => body += chunk)
            res.on("end", () => {
                try {
                    let ret = JSON.parse(body)
                    ok(JSON.parse(body))
                }
                catch (e) {
                    err(ret)
                }
            })
        }).on("error", (error) => error(err));
    })
}

// ------------------------------------------------------------------------------------- TRACKER IMAGE

let weather_tracker_image = {
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

// ------------------------------------------------------------------------------------- TRACKER INSTANCES

// even if the used weather api allows for multiple city names in one request, we will assume for the sake
// of this example that the api only allows 1 city name per request.

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
// ------------------------------------------------------------------------------------- TRACKERS INIT

for (let tracker_name in all_trackers) {
    tracker_init(all_trackers[tracker_name], [], (data, err) => {
        if (err) {
            if (data) {
                console.log('augment failed on', tracker_name, err)
                return
            }
            console.log('error on', tracker_name, err)
            return
        }
        console.log('NEW DATA on', tracker_name, data)
    })
}

