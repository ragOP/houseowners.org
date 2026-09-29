(function () {
  var script = document.currentScript;
  var page = script && script.getAttribute('data-page');
  if (page !== 'glo2' && page !== 'glo2b' && page !== 'tobe' && page !== 'abc') return;

  var key = 'quiz-session-' + page;
  var session = sessionStorage.getItem(key);
  if (!session) {
    session = newId();
    sessionStorage.setItem(key, session);
  }

  var state = {
    q1: null,
    q2: null,
    q3: null,
    qualifyReached: false,
    disqualifyReached: false,
    debtReached: false,
    sleepReached: false,
    qualifyClick: false,
    disqualifyClick: false,
    debtClick: false,
    sleepClick: false
  };
  var CLICKS = { qualify: 'qualify', disqualify: 'disqualify', 'debt-yes': 'debt', 'debt-no': 'sleep' };

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
        q1: state.q1,
        q2: state.q2,
        q3: state.q3,
        qualifyReached: state.qualifyReached,
        disqualifyReached: state.disqualifyReached,
        debtReached: state.debtReached,
        sleepReached: state.sleepReached,
        qualifyClick: state.qualifyClick,
        disqualifyClick: state.disqualifyClick,
        debtClick: state.debtClick,
        sleepClick: state.sleepClick
      }),
      keepalive: true
    }).catch(function () {});
  }

  function markReached(kind) {
    var field = kind + 'Reached';
    if (state[field]) return;
    state[field] = true;
    send();
  }

  function watch(id, kind) {
    var el = document.getElementById(id);
    if (!el) return;
    var seen = function () {
      return el.classList.contains('show') || el.classList.contains('active');
    };
    if (seen()) markReached(kind);
    var obs = new MutationObserver(function () {
      if (seen()) markReached(kind);
    });
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
  }

  watch('yesResult', 'qualify');
  watch('sResult', 'qualify');
  watch('noResult', 'disqualify');
  watch('sIneligible', 'disqualify');
  watch('debtYesResult', 'debt');
  watch('sDebtYes', 'debt');
  watch('sleepStudyResult', 'sleep');
  watch('sSleepStudy', 'sleep');

  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[data-track]');
    if (link) {
      var kind = CLICKS[link.getAttribute('data-track')];
      if (kind) {
        state[kind + 'Click'] = true;
        state[kind + 'Reached'] = true;
        send();
      }
      return;
    }

    var btn = event.target.closest('button');
    if (!btn) return;
    if (page === 'glo2') {
      var q = btn.getAttribute('data-q');
      var value = btn.getAttribute('data-v');
      if ((q !== 'q1' && q !== 'q2' && q !== 'q3') || (value !== 'yes' && value !== 'no')) return;
      state[q] = value;
      send();
      return;
    }

    var answer = btn.getAttribute('data-answer');
    if (answer !== 'yes' && answer !== 'no') return;
    var screen = btn.closest('.screen');
    if (!screen) return;
    if (screen.id === 's1') state.q1 = answer;
    else if (screen.id === 's2') state.q2 = answer;
    else if (screen.id === 'sDebt') state.q3 = answer;
    else return;
    send();
  });

  send();
})();
