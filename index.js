const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const cheerio = require('cheerio')

const app = express();
app.use(bodyParser.urlencoded({extended: false}));

const sign_flip = (delay) => {
    if(delay != ''){
        const int_delay = parseInt(delay);
        return (int_delay*(-1)).toString()
    }
    else{
        return '0'
    }
}

const delay_handler = (delay_str) => {
    if (delay_str == ''){
        return 0
    }
    else {
        return parseInt(delay_str);
    }
}

const convert_time = (time) => {
    const split_time = time.split(':');
    if (parseInt(split_time[0]) > 12 && parseInt(split_time[0]) <= 24){
        const new_time = parseInt(split_time[0])-12;
        const new_string = new_time.toString()+':'+split_time[1]+' PM'
        return new_string;
    }
    else{
        if(parseInt(split_time[0]) > 24){
            const new_time = parseInt(split_time[0])-24;
            const new_string = new_time.toString()+':'+split_time[1]
            return convert_time(new_string);
        }
        else {
            return time + ' AM';
        }
    }
}

const has_AC = (model) => {
    const buses = {
        "Alexander Dennis Enviro500": true,
        "Chevrolet 4500/Girardin G5": false,
        "Chevrolet 4500/ARBOC SOF 27": true,
        "Chevrolet 4500/ARBOC SOM 28": true,
        "New Flyer D40LF": false,
        "New Flyer D40LFR": false,
        "New Flyer D60LFR": false,
        "New Flyer DE60LFR": false,
        "New Flyer E40LFR": false,
        "New Flyer E60LFR": false,
        "New Flyer XD40": true,
        "New Flyer XDE60": true,
        "New Flyer XN40": true,
        "Nova Bus LFS": false,
        "Nova Bus LFS HEV": false,
        "Nova Bus LFS Suburban": true,
    };
    if(model === undefined){
        return 'undefined model';
    }
    const split_model = model.split(' ');
    if (parseInt(split_model[0]) >= 2012){
        return 1;
    }
    else{
        /*        split_model.shift();
                const new_string = split_model.join(' ');

                if(buses[new_string] == true){
                    return 'Yes!'
                }
                else{
                    return 'No!'
                }*/
        return 0;
    }
}

app.get('/', function (req, res) {
    let stopID = //replace with your desired bus stop;
    const baseUrl = 'http://compat.sorrybusfull.com';
    const homepagePath = ('/stoprt/' + stopID.toString());

    const getDataFromMainPage = async () => {
        try {
            const response = await axios.get(`${baseUrl}${homepagePath}`);
            if (response.status === 200) {
                const mainPageHtml = response.data;
                const mainPage$ = cheerio.load(mainPageHtml);

                const title = mainPage$('head title').text().trim();
                const realtime = mainPage$('#realtime').text().trim();
                const scheduleData = [];
                const vehicleRequests = [];

                mainPage$('div.block #stop table tr').each((index, element) => {
                    const columns = mainPage$(element).find('td');
                    const rowData = {};

                    columns.each((i, col) => {
                        const columnName = ['Trip', 'Sched', 'Corr', 'Delay', 'Wait', 'Block', 'Vehicle'][i];
                        rowData[columnName.toLowerCase()] = mainPage$(col).text().trim();
                    });

                    const vehicleLink = mainPage$(element).find('td a[href^="/vehicle/"]');
                    if (vehicleLink.length > 0) {
                        const vehiclePageUrl = `${baseUrl}${vehicleLink.attr('href')}`;
                        const vehicleRequest = axios.get(vehiclePageUrl).then(vehiclePageResponse => {
                            const vehiclePageHtml = vehiclePageResponse.data;
                            const vehiclePage$ = cheerio.load(vehiclePageHtml);
                            const model = vehiclePage$('th:contains("Model")').next('td').text().trim();
                            rowData['model'] = model;
                        });

                        vehicleRequests.push(vehicleRequest);
                    }

                    scheduleData.push(rowData);
                });

                await Promise.all(vehicleRequests);

                const mainPageData = {
                    title,
                    realtime,
                    scheduleData,
                };

                let buses_at_this_stop = [];
                let to_list = [];

                for (let i = 1; i < mainPageData.scheduleData.length; i++) {
                    if (buses_at_this_stop.includes(mainPageData.scheduleData[i].trip) == false) {
                        buses_at_this_stop.push(mainPageData.scheduleData[i].trip)
                        to_list.push(mainPageData.scheduleData[i])
                    }
                }

                let formatted_message = `
                <html>
                    <head>
                        <title>${title}</title>
                        <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto&display=swap">
                        <style>
                            body {
                                font-family: 'Roboto', sans-serif;
                                font-size: 22px;
                                line-height: 1.4; /* Adjusted line spacing */
                                margin: 0;
                                padding: 0;
                                background-color: #f2f2f2;
                                color: #333;
                                text-align: left;
                                padding: 20px;
                            }
                            h1, h2 {
                                font-size: 30px;
                                margin-bottom: 20px;
                            }
                            p {
                                font-size: 28px;
                                margin-bottom: 20px;
                                margin-top: 10px; /* Adjusted margin for the first paragraph */
                            }
                            .bus-info {
                                border: 2px solid #ddd;
                                padding: 20px;
                                margin-bottom: 20px;
                                background-color: #fff;
                                border-radius: 20px;
                            }
                            .wait-time {
                                font-size: 32px;
                                font-weight: bold;
                                color: #000; /* Changed wait time color to black */
                            }
                        </style>
                    </head>
                    <body>`;


                if (to_list.length == 1) {
                    const scheduled_for = convert_time(to_list[0].sched);
                    const delay = sign_flip(to_list[0].delay);
                    let adjust_time = to_list[0].corr;

                    if (adjust_time === '') {
                        adjust_time = scheduled_for;
                    } else {
                        adjust_time = convert_time(adjust_time);
                    }

                    let delaymsg;

                    if (delay < 0) {
                        delaymsg = 'Early by: ' + (delay * -1).toString() + ' min'
                    } else {
                        delaymsg = 'Delayed by: ' + delay.toString() + ' min'
                    }

                    let wait_time = to_list[0].wait;

                    if (wait_time === '') {
                        wait_time = '>90 min'
                    }

                    let ACstatus;
                    let vehicle = to_list[0].model;

                    if (vehicle === undefined) {
                        vehicle = 'Not yet known.';
                        ACstatus = 'Not yet known.';
                    } else {
                        const ACbool = has_AC(vehicle);
                        if (ACbool == true) {
                            ACstatus = 'Yes.'
                        } else {
                            ACstatus = 'No.'
                        }
                    }

                    formatted_message += `<div class="bus-info">`;
                    formatted_message += `<h1>${to_list[0].trip} from ${title}</h1>`;
                    formatted_message += `<p><strong>Details:</strong></p>`;
                    formatted_message += `<p>Scheduled for: ${scheduled_for}</p>`;
                    formatted_message += `<p>${delaymsg}</p>`;
                    formatted_message += `<p>Adjusted arrival time: ${adjust_time}</p>`;
                    formatted_message += `<p>Wait: <span class="wait-time">${wait_time}</span></p>`;
                    formatted_message += `<p>Vehicle: ${vehicle}</p>`;
                    //formatted_message += `<p>Does this bus have AC? ${ACstatus}</p>`;
                    formatted_message += `</div>`;
                } else {
                    formatted_message += `<h1>The next departing buses for ${title} are:</h1>`;
                    for (let i = 0; i < to_list.length; i++) {
                        const scheduled_for = convert_time(to_list[i].sched);
                        const delay = delay_handler(to_list[i].delay);
                        let adjust_time = to_list[i].corr;

                        if (adjust_time === '') {
                            adjust_time = scheduled_for;
                        } else {
                            adjust_time = convert_time(adjust_time);
                        }

                        let delaymsg;

                        if (delay < 0) {
                            delaymsg = 'Early by: ' + (delay * -1).toString() + ' min'
                        } else {
                            delaymsg = 'Delayed by: ' + delay.toString() + ' min'
                        }

                        let wait_time = to_list[i].wait;

                        if (wait_time === '') {
                            wait_time = '>90 min'
                        }

                        let ACstatus;
                        let vehicle = to_list[i].model;

                        if (vehicle === undefined) {
                            vehicle = 'Not yet known.';
                            ACstatus = 'Not yet known.';
                        } else {
                            const ACbool = has_AC(vehicle);
                            if (ACbool == true) {
                                ACstatus = 'Yes.'
                            } else {
                                ACstatus = 'No.'
                            }
                        }

                        formatted_message += `<div class="bus-info">`;
                        formatted_message += `<h2>${to_list[i].trip}</h2>`;
                        formatted_message += `<p><strong>Details:</strong></p>`;
                        formatted_message += `<p>Scheduled for: ${scheduled_for}</p>`;
                        formatted_message += `<p>${delaymsg}</p>`;
                        formatted_message += `<p>Adjusted arrival time: ${adjust_time}</p>`;
                        formatted_message += `<p>Wait: <span class="wait-time">${wait_time}</span></p>`;
                        formatted_message += `<p>Vehicle: ${vehicle}</p>`;
                        formatted_message += `<p>Does this bus have AC? ${ACstatus}</p>`;
                        formatted_message += `</div>`;
                    }
                }
                formatted_message += `</body></html>`;
                res.send(formatted_message);
            }
        } catch (error) {
            let errorMsg;
            if (error.response && error.response.status == 404) {
                errorMsg = 'That stop does not exist!'
            } else {
                errorMsg = 'NextBus encountered an error, please try again.'
            }
            res.send(`<html><body><p>${errorMsg}</p></body></html>`);
        }
    };

    getDataFromMainPage();
});




var listener = app.listen(3000, function () {
    console.log('Your app is listening on port 3000');
});


