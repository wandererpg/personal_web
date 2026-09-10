(function AdminLogin() {
  function loginErrorMessage(error) {
    if (error?.code === 'LOGIN_RATE_LIMITED') return '尝试次数过多，请稍后再试。';
    if (error?.code === 'LOGIN_FAILED') return '账号或密码不正确。';
    if (error?.code === 'CSRF_TOKEN_INVALID') return '登录会话已过期，请刷新页面后重试。';
    if (!error?.status || error.status >= 500) return '后台服务暂时不可用，请确认网页服务已启动。';
    return '登录请求失败，请稍后重试。';
  }

  function init() {
    const form = document.querySelector('[data-admin-login]');
    const status = document.querySelector('[data-admin-login-status]');
    if (!form || !window.AdminApi) return;

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      status.textContent = '正在验证身份…';
      submit.disabled = true;
      try {
        const data = new FormData(form);
        await window.AdminApi.request('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: data.get('username'), password: data.get('password') })
        });
        status.textContent = '验证通过，正在进入内容站…';
        window.location.assign('/admin');
      } catch (error) {
        status.textContent = loginErrorMessage(error);
        submit.disabled = false;
      }
    });
  }

  window.AdminLogin = { init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
