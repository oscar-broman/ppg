'use strict';

window.PPG = (function (self) {
  var reCacheKey = /^ppgGist-/;

  self.gistLoad = function(id) {
    var dfd = new jQuery.Deferred();
    var cached = self.gistCacheGet(id);

    if (cached) {
      dfd.resolve(cached);

      return dfd.promise();
    }

    $.ajax({
      type: 'GET',
      crossDomain : true,
      data: {

      },
      url: 'https://api.github.com/gists/' + id
    }).done(function(data) {
      self.gistCacheAdd(id, data);

      dfd.resolve(data);
    }).fail(function(error) {
      dfd.reject(error);
    });

    return dfd.promise();
  };

  self.gistCacheAdd = function(id, data) {
    localStorage['ppgGist-' + id] = JSON.stringify(data);
  };

  self.gistCacheGet = function(id) {
    var data = localStorage['ppgGist-' + id];

    return data ? JSON.parse(data) : null;
  }

  self.gistCacheClear = function() {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);

      if (reCacheKey.test(key)) {
        localStorage.removeItem(key);
      }
    }
  };

  var GHAccessToken = null;

  OAuth.initialize('829L698cmvBJTonf9Tsje6iUqCM', {
    cache: true
  });

  $('#github-signin').on({
    click: function() {
      OAuth.popup('github', function (err, result) {
        if (err) {
          alert('GitHub authentication failed.');

          OAuth.clearCache();

          return;
        }

        $('.github-signin').hide();

        GHAccessToken = result.access_token;
        window.GHAccessToken=GHAccessToken;

        localStorage.ppgGHAccessToken = GHAccessToken;

        loadGists();
      });
    }
  });

  if (localStorage.ppgGHAccessToken) {
    GHAccessToken = localStorage.ppgGHAccessToken;

    $('.github-signin').hide();

    loadGists();
  }

  function loadGists() {
    $('.github-gists')
      .empty()
      .text('Loading gists..');

    $.ajax({
      url: 'https://api.github.com/gists',
      dataType: 'json',
      beforeSend: function(xhr) {
        xhr.setRequestHeader('Authorization', 'Bearer ' + GHAccessToken);
      }
    }).done(function(data) {
      $('.github-gists').text('');

      data.forEach(function(gist, idx) {
        var files = Object.keys(gist.files);

        if (files.length !== 1) {
          return;
        }

        if (!gist.files[files[0]].filename.match(/\.(inc|pwn)$/i)) {
          return;
        }

        $('.github-gists').append(
          $('<a class="list-group-item" href="#"/>')
            .text(gist.description || gist.files[files[0]].filename)
            .data('gist-idx', idx)
        );
      });

      console.log(data)
    }).fail(function(err) {
      console.log(err);
    });
  }

  return self;
}(window.PPG || {}));