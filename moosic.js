const axios = require('axios');
const cheerio = require('cheerio');
const YoutubeMp3Downloader = require("youtube-mp3-downloader");
const express = require('express');
const app = express();
const serv = require('http').Server(app);
const io = require('socket.io')(serv, {});
const archiver = require('archiver');
const rimraf = require('rimraf')
var fs = require('fs');
// const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const ffmpeg_path = '/usr/local/bin/ffmpeg';

serv.listen(2000);

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/client/index.html');
});
app.use('/client', express.static(__dirname + '/client'));

function generate_id() {
    return Math.floor(Math.random() * (100000 - 10000 + 1) + 10000);
}

function reformat_query(q) {
    q.replace(/[^A-Za-z0-9 ]/g, ' ');
    return q;
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

    function notify_user(message, type) {
        socket.emit('notification', {
            message: message,
            type: type
        })
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
            console.log('error downloading ' + song_name);
        });
    }

    async function download_song(song_name) {
        update_status(song_name, 'fetching');
        var search_url = "https://youtube.com/results?search_query=" + song_name.replace(/ /g, '+') + '&sp=EgIQAQ%253D%253D';
        axios.get(search_url).then(response => {
            const $ = cheerio.load(response.data)
            try {
                var href = $('.yt-lockup-title')[0].children[0].attribs.href;
                var vid_id = href.substr(href.indexOf('=') + 1)
                yt2mp3(vid_id, song_name)
            } catch (e) {
                to_be_downloaded++;
                update_status(song_name, '<span style="color:red">error</span> fetching')
                console.log('retrying fetching', song_name);
                download_song(song_name);
            }
        }), (error) => {
            console.log('error fetching', song_name);
        };
    }

    function download_all_songs(song_list) {
        if (song_list.length > 10) {
            to_be_downloaded += 10;
        } else {
            to_be_downloaded += song_list.length;
        }
        for (var i = 0; i < song_list.length; i++) {
            if (i < 10) download_song(song_list[i]);
            else break;
        }
    }

    function convert_songs(song_list) {
        user_turn++;
        archive = archiver('zip', {zlib: { level: 9 }});
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
            notify_user('Congratulations! Your download is ready!', 'pos');
            console.log('download complete for user', user_id);
            socket.emit('download_complete', {
                user_id: user_id,
                user_turn: user_turn
            })
            setTimeout(() => {
                rimraf(user_dir, function () { console.log("deleted folder", user_dir); });
                socket.emit('files_deleted')
            }, 100000);
        });
        archive.pipe(output);

        YD = new YoutubeMp3Downloader({ "ffmpegPath": ffmpeg_path, "outputPath": user_dir + '/songs' + user_turn.toString(), "youtubeVideoQuality": "highest", "queueParallelism": 2, "progressTimeout": 5000 });

        download_all_songs(song_list);
    }

    console.log('new user: ', user_id);

    socket.on('convert_songs', function(data) {
        convert_songs(data.songs);
    });

    socket.on('convert_spotify_playlist', function(data) {
        scrape_spotify_playlist(data.url);
    });

    function scrape_spotify_playlist(spotify_url) {
        var song_list = [];
        axios.get(spotify_url).then(response => {
            const $ = cheerio.load(response.data)
            var elems = $('.track-name-wrapper');

            for (var i = 0; i < elems.length; i++) {
                var song_name = elems[i].children[0].children[0].data;
                var song_artist = elems[i].children[1].children[0].children[0].children[0].data;
                var song_query = song_name + ' ' + song_artist;
                song_list.push(reformat_query(song_query));
            }

            convert_songs(song_list);

        }), (error) => {
            console.log('error fetching', spotify_url);
        };
    }
});
