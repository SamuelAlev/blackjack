$(document).ready(function() {
  $('.delete-room').on('click', function(e){
    if (confirm('Êtes-vous sûr de vouloir supprimer cette salle ?')) {
      $target = $(e.target);
      const id = $target.attr('data-id');
      $.ajax({
        type : 'DELETE',
        url : '/admin/rooms/' + id,
        success : function (res) {
          window.location.href = '/admin/rooms/';
        },
        error: function (err) {
          throw err;
        }
      });
    }
  });
});

$(document).ready(function() {
  $('.delete-user').on('click', function(e){
    if (confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) {
      $target = $(e.target);
      const id = $target.attr('data-id');
      $.ajax({
        type : 'DELETE',
        url : '/admin/users/' + id,
        success : function (res) {
          window.location.href = '/admin/users/';
        },
        error: function (err) {
          throw err;
        }
      });
    }
  });
});

$(document).ready(function () {
  $('.delete-ad').on('click', function (e) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette publicité ?')) {
      $target = $(e.target);
      const id = $target.attr('data-id');
      $.ajax({
        type: 'DELETE',
        url: '/admin/ads/' + id,
        success: function (res) {
          window.location.href = '/admin/ads/';
        },
        error: function (err) {
          throw err;
        }
      });
    }
  });
});