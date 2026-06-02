// EMS Dashboard — API helper library
window.EmsApi = (function () {
  function getToken() { return localStorage.getItem('ems_token') || ''; }
  function getUser()  {
    try { return JSON.parse(localStorage.getItem('ems_user') || 'null'); } catch (_) { return null; }
  }
  function setSession(token, user) {
    localStorage.setItem('ems_token', token);
    localStorage.setItem('ems_user', JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem('ems_token');
    localStorage.removeItem('ems_user');
  }
  function isLoggedIn() { return !!getToken() && !!getUser(); }

  async function request(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res  = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 401 on an authenticated request means the session expired — redirect.
      // 401 on the login/setup endpoints means bad credentials — throw normally.
      if (res.status === 401 && getToken()) { clearSession(); window.location.href = '/'; return; }
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  function qs(params) { return new URLSearchParams(params).toString(); }

  // Authenticated file download: fetch with the Bearer token (a plain
  // window.open / anchor link cannot send the Authorization header, so the
  // server rejects it with 401). Streams the response into a Blob and saves it.
  async function downloadFile(path, filename) {
    const res = await fetch(path, {
      headers: { 'Authorization': 'Bearer ' + getToken() },
    });
    if (res.status === 401 && getToken()) { clearSession(); window.location.href = '/'; return; }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); if (j.error) msg = j.error; } catch (_) {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    getToken, getUser, setSession, clearSession, isLoggedIn,

    // Auth
    login:         (id, pw)   => request('POST',   '/api/auth/login',        { identifier: id, password: pw }),
    setup:         (body)     => request('POST',   '/api/auth/setup',         body),
    me:            ()         => request('GET',    '/api/auth/me'),
    loginHistory:  ()         => request('GET',    '/api/auth/login-history'),
    users:         ()         => request('GET',    '/api/auth/users'),
    createUser:    (body)     => request('POST',   '/api/auth/register',      body),
    updateUser:    (em, body) => request('PUT',    `/api/auth/users/${em}`,   body),
    deleteUser:    (em)       => request('DELETE', `/api/auth/users/${em}`),

    // Sensors
    sensors:        ()      => request('GET', '/api/sensors'),
    latestReadings: ()      => request('GET', '/api/sensors/latest'),
    getSensor:      (id)    => request('GET', `/api/sensors/${id}`),
    createSensor:   (body)  => request('POST',   '/api/sensors', body),
    updateSensor:   (id, b) => request('PUT',    `/api/sensors/${id}`, b),
    deleteSensor:   (id)    => request('DELETE', `/api/sensors/${id}`),

    // Readings
    readings: (p) => request('GET', '/api/readings?' + qs(p)),
    summary:  (p) => request('GET', '/api/readings/summary?' + qs(p)),

    // Alerts
    activeAlerts: ()      => request('GET', '/api/alerts/active'),
    alertHistory: (p)     => request('GET', '/api/alerts/history?' + qs(p)),
    acknowledge:  (id)    => request('PUT', `/api/alerts/${id}/acknowledge`, {}),
    alertRules:   ()      => request('GET', '/api/alerts/rules'),
    createRule:   (body)  => request('POST',   '/api/alerts/rules', body),
    updateRule:   (id, b) => request('PUT',    `/api/alerts/rules/${id}`, b),
    deleteRule:   (id)    => request('DELETE', `/api/alerts/rules/${id}`),

    // Reports
    csvUrl:         (p) => '/api/reports/csv?' + qs(p),
    alertsCsvUrl:   (p) => '/api/reports/alerts-csv?' + qs(p),
    reportSummary:  (p) => request('GET', '/api/reports/summary-json?' + qs(p)),
    downloadFile,

    // Settings
    settings:      ()      => request('GET', '/api/settings'),
    saveSetting:   (k, b)  => request('PUT', `/api/settings/${k}`, b),
    applyRetention: ()     => request('POST', '/api/settings/retention/apply', {}),

    health: () => request('GET', '/api/health'),
  };
})();
