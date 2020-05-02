const axios = require('axios');
const cheerio = require('cheerio');
const YoutubeMp3Downloader = require("youtube-mp3-downloader");
const express = require('express');
const app = express();
const serv = require('http').Server(app);
const io = require('socket.io')(serv, {});
const archiver = require('archiver');
// const ffmpeg = require('@ffmpeg-installer/ffmpeg');

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/client/index.html');
});
app.use('/client', express.static(__dirname + '/client'));

serv.listen(2000);

var fs = require('fs');

function generate_id() { // min and max included
    return Math.floor(Math.random() * (100000 - 10000 + 1) + 10000);
}

var total_users = 0;
io.sockets.on('connection', function(socket) {
    total_users++;
    var downloaded_songs = 0;
    var to_be_downloaded = 0;
    var user_id = generate_id();
    var user_turn = 0;
    var user_dir = './client/files/' + user_id;
    var YD;
    var archive;

    app.get('/download/', (req, res) => {
        console.log('downloading', './client/files/' + req.query.id + '/songs' + req.query.turn + '.zip');
        res.download('./client/files/' + req.query.id + '/songs' + req.query.turn + '.zip');
    })

    function update_status(song_name, status) {
        socket.emit('status_update', {
            song_name: song_name,
            status: status
        });
    }

    async function yt2mp3(video_id, song_name) {
        update_status(song_name, 'converting');
        YD.download(video_id);
        YD.on("finished", function(err, data) {
            update_status(song_name, 'converted');
            downloaded_songs++;
            if (downloaded_songs == to_be_downloaded) {
                // zip the files
                socket.emit('generating_download_file', {
                    eta: to_be_downloaded*3
                });
                setTimeout(() => {
                    archive.directory(user_dir + '/songs' + user_turn.toString(), false);
                    archive.finalize();
                }, to_be_downloaded*3*1000);
            }
        });
        YD.on("error", function(error) {
            update_status(song_name, 'failed to convert');
            to_be_downloaded--;
            console.log('error downloading ' + song_name);
        });
    }

    async function download_song(song_name) {
        update_status(song_name, 'fetching');
        var search_url = "https://youtube.com/results?search_query=" + (song_name + " official").replace(' ', '+')
        axios.get(search_url).then(response => {
            const $ = cheerio.load(response.data)
            var href = $('.yt-lockup-title')[0].children[0].attribs.href;
            var vid_id = href.substr(href.indexOf('=') + 1)
            yt2mp3(vid_id, song_name)
        }), (error) => {
            console.log('error fetching', song_name);
            to_be_downloaded--;
        };
    }

    function download_all_songs(song_list) {
        to_be_downloaded += song_list.length;
        for (var i = 0; i < song_list.length; i++) {
            download_song(song_list[i]);
        }
    }

    console.log('new user: ', user_id);
    socket.on('convert_songs', function(data) {
        user_turn++;

        archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });
        archive.on('error', function(err) {
            console.log('error zipping files, please retry');
            throw err;
        });

        if (!fs.existsSync('./client/files/')){
            fs.mkdirSync('./client/files/');
        }
        if (!fs.existsSync(user_dir)){
            fs.mkdirSync(user_dir);
        }

        fs.mkdirSync(user_dir + '/songs' + user_turn.toString());
        var output = fs.createWriteStream(user_dir + '/songs' + user_turn.toString() + '.zip');
        output.on('close', function() {
            console.log('download complete for user', user_id);
            socket.emit('download_complete', {
                user_id: user_id,
                user_turn: user_turn
            })
        });

        archive.pipe(output);

        YD = new YoutubeMp3Downloader({ "ffmpegPath": "/usr/local/bin/ffmpeg", "outputPath": user_dir + '/songs' + user_turn.toString(), "youtubeVideoQuality": "highest", "queueParallelism": 2, "progressTimeout": 5000 });

        download_all_songs(data.songs);
    });
});
