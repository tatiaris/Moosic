var socket = io();

$('#convert-btn').click(function() {
    if ($('#song-input')[0].value != '') {
        var song_list = $('#song-input')[0].value.split(',');
        for (var i = 0; i < song_list.length; i++) {
            song_list[i] = song_list[i].trim();
            song_list[i] = song_list[i].replace(/[^A-Za-z0-9 ]/g, '');
        }
        socket.emit('convert_songs', {
            songs: song_list
        });
        hide_convert_btn();
        show_status();
    }
});

$('#download-btn').click(function() {
    hide_download_btn();
    show_convert_btn();
    $('#song-input')[0].value = '';
    socket.emit('download_complete', {});
    $('#log').html('');
});

function hide_convert_btn() {
    $('#convert_btn_container')[0].style.display = 'none';
}
function show_convert_btn() {
    $('#convert_btn_container')[0].style.display = 'flex';
}
function hide_download_btn() {
    $('#download_btn_container')[0].style.display = 'none';
}
function show_download_btn() {
    $('#download_btn_container')[0].style.display = 'flex';
}
function hide_status() {
    $('#status_container')[0].style.display = 'none';
}
function show_status() {
    $('#status_container')[0].style.display = 'flex';
}

socket.on('status_update', function(data) {
    var song_id = (data.song_name).replace(/ /g, '-');
    if ($('#s-' + song_id).length) {
        document.getElementById('s-' + song_id).innerHTML = data.status + ' ' + data.song_name;
    } else {
        $('#log').append('<div class="song-status" id="s-' + song_id + '">' + data.status + ' ' + data.song_name + '</div>');
    }
});

socket.on('download_complete', function(data) {
    $('#download-btn')[0].href = 'download/?id=' + data.user_id + '&turn=' + data.user_turn;
    hide_status();
    show_download_btn();
})

socket.on('generating_download_file', function(data) {
    $('#log').append('<div class="song-status"> generating download file, please wait <span style="color:red;">' + (data.eta).toString() + '</span> seconds')
})

$(document).ready(function() {
    show_convert_btn();
    hide_status();
    hide_download_btn();
});
