(function () {
  var script = document.currentScript;
  var page = script && script.getAttribute('data-page');
  if (page !== 'glo2' && page !== 'glo2b') return;

  var key = 'quiz-session-' + page;
  var session = sessionStorage.getItem(key);
  if (!session) {
    session = newId();
    sessionStorage.setItem(key, session);
  }
  var answers = { q1: null, q2: null };

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var chars = 'abcdef0123456789';
    var id = '';
    for (var i = 0; i < 32; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return id;
  }

  function send() {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: session,
        page: page,
        q1: answers.q1,
        q2: answers.q2
      }),
      keepalive: true
    }).catch(function () {});
  }

  document.addEventListener('click', function (event) {
    var btn = event.target.closest('button');
    if (!btn) return;
    if (page === 'glo2') {
      var q = btn.getAttribute('data-q');
      var value = btn.getAttribute('data-v');
      if ((q !== 'q1' && q !== 'q2') || (value !== 'yes' && value !== 'no')) return;
      answers[q] = value;
      send();
      return;
    }
    var answer = btn.getAttribute('data-answer');
    if (answer !== 'yes' && answer !== 'no') return;
    var screen = btn.closest('.screen');
    if (!screen) return;
    if (screen.id === 's1') answers.q1 = answer;
    else if (screen.id === 's2') answers.q2 = answer;
    else return;
    send();
  });
})();
