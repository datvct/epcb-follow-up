// API.JS
// Gọi Google Apps Script Web App bằng JSONP (thẻ <script> động) thay vì
// fetch() thông thường — vì frontend (Netlify) và backend (script.google.com)
// khác domain, và Apps Script Web App không set CORS header cho fetch().
// JSONP né được vấn đề này vì <script src="..."> không bị trình duyệt chặn CORS.
//
// Hệ quả: mọi request (kể cả tạo/sửa/xoá) đều là GET, dữ liệu ghi được gửi
// dưới dạng JSON trong query string (payload=...).

const PASSWORD_KEY = 'qd_api_password';

function getStoredPassword() {
  return sessionStorage.getItem(PASSWORD_KEY) || '';
}

function setStoredPassword(pass) {
  sessionStorage.setItem(PASSWORD_KEY, pass);
}

function clearStoredPassword() {
  sessionStorage.removeItem(PASSWORD_KEY);
}

let _callbackCounter = 0;

// Các action có thể phải mở/convert file trên Drive (PDF -> Google Doc rồi
// đọc bảng — xem QuoteParser.gs) nên chậm hơn nhiều so với các action đọc/ghi
// dữ liệu thông thường. Dùng timeout dài hơn riêng cho các action này để
// tránh báo lỗi/timeout ở phía trình duyệt trong khi Apps Script vẫn đang
// chạy (và vẫn sẽ lưu thành công) ở phía server.
const SLOW_ACTIONS_ = ['createProject', 'updateProject', 'reparseProjectQuoteFile'];
const DEFAULT_TIMEOUT_MS_ = 20000;
const SLOW_TIMEOUT_MS_ = 60000;

function callApi(action, payload) {
  return new Promise((resolve, reject) => {
    if (!API_URL || API_URL.indexOf('DAN_URL_WEB_APP') > -1) {
      reject(new Error('Chưa cấu hình API_URL trong js/config.js'));
      return;
    }

    const cbName = 'qd_cb_' + Date.now() + '_' + (_callbackCounter++);
    const params = new URLSearchParams();
    params.set('action', action);
    params.set('callback', cbName);
    params.set('password', getStoredPassword());
    if (payload !== undefined) params.set('payload', JSON.stringify(payload));

    const timeoutMs = SLOW_ACTIONS_.indexOf(action) > -1 ? SLOW_TIMEOUT_MS_ : DEFAULT_TIMEOUT_MS_;
    const timeout = setTimeout(() => {
      cleanup();
      const hint = SLOW_ACTIONS_.indexOf(action) > -1
        ? ' (đang đọc file Drive có thể mất nhiều thời gian — thử tải lại danh sách để kiểm tra xem đã lưu thành công chưa, sau đó bấm "Đọc lại file báo giá từ Drive" nếu cần)'
        : '';
      reject(new Error('Hết thời gian chờ phản hồi từ máy chủ.' + hint));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = (res) => {
      cleanup();
      if (!res || res.success === false) {
        reject(new Error((res && res.error) || 'Lỗi không xác định từ máy chủ.'));
      } else {
        resolve(res.data !== undefined ? res.data : res);
      }
    };

    const script = document.createElement('script');
    script.src = API_URL + '?' + params.toString();
    script.onerror = () => {
      cleanup();
      reject(new Error('Không kết nối được máy chủ Apps Script.'));
    };
    document.body.appendChild(script);
  });
}

// Gọi riêng để xác thực mật khẩu khi người dùng bấm "Vào hệ thống",
// không lẫn với các action đọc/ghi dữ liệu khác.
function verifyPassword(pass) {
  setStoredPassword(pass);
  return callApi('login').catch((err) => {
    clearStoredPassword();
    throw err;
  });
}
