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

  return self;
}(window.PPG || {}));