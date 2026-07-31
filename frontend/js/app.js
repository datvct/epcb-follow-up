// APP.JS
// Helpers dùng chung + màn hình đăng nhập mật khẩu + khởi động ứng dụng.

let FORM_OPTIONS = null;
let _autoRefreshTimer = null;
let ALL_CUSTOMERS = [];

function fillCustomerDatalist(customers) {
  const dl = document.getElementById('customer-datalist');
  if (!dl) return;
  dl.innerHTML = '';
  // Gom nhóm danh sách khách hàng để tránh trùng lặp hiển thị gợi ý
  const uniqueNames = [...new Set(customers.map(c => c.customerName).filter(Boolean))];
  uniqueNames.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    dl.appendChild(opt);
  });
}

const TAB_TITLES = {
  dashboard: 'Tổng quan',
  list: 'Danh sách',
  add: 'Thêm báo giá',
  reports: 'Báo cáo',
  'sales-activity': 'Hoạt động Sales',
  'closed-orders': 'Đơn hàng đã chốt',
  probability: 'Xác suất chốt'
};

function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('d-none', !show);
}

function toast(message, type) {
  const id = 't' + Date.now();
  const html = `
    <div id="${id}" class="toast align-items-center text-bg-${type || 'success'} border-0" role="alert">
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>`;
  document.getElementById('toast-container').insertAdjacentHTML('beforeend', html);
  const el = document.getElementById(id);
  new bootstrap.Toast(el, { delay: 3500 }).show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

function formatVND(value) {
  // Dùng khoảng trắng không ngắt dòng (\u00A0) trước "đ" để con số và đơn vị
  // tiền luôn dính liền nhau — tránh bị "rớt" chữ "đ" xuống dòng riêng khi
  // cột trong bảng bị hẹp lại.
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(value) || 0)) + '\u00A0đ';
}

function formatPercent(value) {
  return Math.round((Number(value) || 0) * 100) + '%';
}

function statusClass(status) {
  return 'status-' + String(status || '').trim().replace(/\s+/g, '-');
}

// Gợi ý Ngày follow up tiếp theo dựa theo nhịp follow-up của trạng thái
// (VD: Đang báo giá +3 ngày, Đang đàm phán +5 ngày, Đã đặt cọc +3 ngày — mục 3.1 docx).
// Chỉ tự điền khi ô ngày đang trống, không ghi đè ngày người dùng đã tự chọn.
function suggestFollowUpDate(statusValue, dateInput, hintEl) {
  const cadence = (FORM_OPTIONS && FORM_OPTIONS.followUpCadence) || {};
  const days = cadence[statusValue];
  if (!days) {
    if (hintEl) hintEl.textContent = '';
    return;
  }
  if (hintEl) hintEl.textContent = 'Gợi ý: trạng thái "' + statusValue + '" nên follow up lại sau ' + days + ' ngày.';
  if (dateInput && !dateInput.value) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    dateInput.value = d.toISOString().slice(0, 10);
  }
}

// Đánh dấu Ghi chú là bắt buộc trên giao diện khi trạng thái chuyển sang
// nhóm cần ghi lý do (VD: "Không chốt") — theo nguyên tắc bắt buộc mục 2 docx.
function applyReasonRequiredHint(statusValue, labelEl, textareaEl) {
  const reasonRequired = (FORM_OPTIONS && FORM_OPTIONS.reasonRequiredStatuses) || [];
  const isRequired = reasonRequired.indexOf(statusValue) !== -1;
  if (labelEl) labelEl.innerHTML = isRequired ? 'Ghi chú <span class="text-danger">* Bắt buộc ghi lý do</span>' : 'Ghi chú';
  if (textareaEl) textareaEl.toggleAttribute('required', isRequired);
}

// Chặn bấm nhầm "Đã follow up": nếu ngày hẹn follow up chưa tới, hỏi lại bằng
// modal xác nhận (thay cho confirm của trình duyệt) trước khi cho ghi nhận
// (đã tới hạn/quá hạn thì cho làm luôn, không hỏi).
// Trả về Promise<boolean> vì trả lời từ modal là bất đồng bộ.
let _confirmFollowUpResolver = null;
function confirmEarlyFollowUp(nextFollowUpDateStr) {
  return new Promise((resolve) => {
    if (!nextFollowUpDateStr) return resolve(true); // chưa có hẹn thì cho follow up bất cứ lúc nào
    const today = startOfDay_(new Date());
    const due = startOfDay_(new Date(nextFollowUpDateStr));
    const daysLeft = Math.round((due - today) / 86400000);
    if (daysLeft <= 0) return resolve(true);

    document.getElementById('confirm-followup-msg').textContent =
      'Còn ' + daysLeft + ' ngày nữa mới tới hẹn (ngày ' +
      nextFollowUpDateStr.split('-').reverse().join('/') +
      '). Bạn có chắc đã liên hệ khách và muốn ghi nhận follow up sớm không?';
    _confirmFollowUpResolver = resolve;
    new bootstrap.Modal(document.getElementById('confirm-followup-modal'), {
      backdrop: 'static',
    }).show();
  });
}

// Gắn sự kiện cho modal xác nhận follow up sớm (chạy 1 lần).
(function wireConfirmFollowUpModal() {
  const modalEl = document.getElementById('confirm-followup-modal');
  if (!modalEl) return;

  const finish = (result) => {
    if (_confirmFollowUpResolver) _confirmFollowUpResolver(result);
    _confirmFollowUpResolver = null;
    const inst = bootstrap.Modal.getInstance(modalEl);
    if (inst) inst.hide();
  };
  document.getElementById('btn-confirm-followup-ok').addEventListener('click', () => finish(true));
  document.getElementById('btn-confirm-followup-cancel').addEventListener('click', () => finish(false));
  // Đóng bằng X / phím ESC / bấm nền → coi như huỷ.
  modalEl.addEventListener('hidden.bs.modal', () => {
    if (_confirmFollowUpResolver) {
      _confirmFollowUpResolver(false);
      _confirmFollowUpResolver = null;
    }
  });
})();

function fillSelect(select, options, placeholder) {
  select.innerHTML = '';
  if (placeholder !== undefined) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    select.appendChild(opt);
  }
  options.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v || '(Chưa kết thúc)';
    select.appendChild(opt);
  });
}

// Gọi lại dữ liệu báo giá 1 lần duy nhất rồi vẽ lại cả Dashboard + Danh sách + Báo cáo.
// (Không gọi 2-3 API riêng lẻ như trước — giảm số lần JSONP round-trip.)
async function reloadAll() {
  ALL_PROJECTS = await callApi('getProjects');
  ALL_CUSTOMERS = await callApi('getCustomers').catch(() => []);
  fillCustomerDatalist(ALL_CUSTOMERS);
  applyListFilters();
  refreshDashboard();
  if (typeof initTomSelect === 'function') initTomSelect();
  if (!document.getElementById('tab-reports').classList.contains('d-none')) renderCurrentReport();
  if (typeof renderClosedOrders === 'function' && !document.getElementById('tab-closed-orders').classList.contains('d-none')) renderClosedOrders();
}

// ============================================================
// SIDEBAR / CHUYỂN TAB
// ============================================================
function switchToTab(tabName) {
  document.querySelectorAll('#main-tabs .side-link').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('d-none'));
  document.getElementById('tab-' + tabName).classList.remove('d-none');
  document.getElementById('page-title').textContent = TAB_TITLES[tabName] || '';
  closeMobileSidebar();
  if (tabName === 'reports') renderCurrentReport();
  if (tabName === 'sales-activity' && typeof renderSalesTimelineChart === 'function') renderSalesTimelineChart();
  if (tabName === 'closed-orders' && typeof renderClosedOrders === 'function') renderClosedOrders();
  if (tabName === 'probability') loadProbabilityTab();
}

document.getElementById('main-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  switchToTab(btn.dataset.tab);
});

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('show');
}

document.getElementById('btn-menu-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-backdrop').classList.add('show');
});
document.getElementById('sidebar-backdrop').addEventListener('click', closeMobileSidebar);

document.getElementById('btn-notifications').addEventListener('click', () => switchToTab('dashboard'));

document.getElementById('btn-refresh-all').addEventListener('click', async () => {
  showLoading(true);
  try {
    await reloadAll();
    toast('Đã làm mới dữ liệu.');
  } catch (err) {
    toast('Lỗi: ' + err.message, 'danger');
  } finally {
    showLoading(false);
  }
});

// ============================================================
// ĐĂNG NHẬP MẬT KHẨU
// ============================================================
document.getElementById('login-submit').addEventListener('click', attemptLogin);
document.getElementById('login-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') attemptLogin();
});

async function attemptLogin() {
  const pass = document.getElementById('login-password').value.trim();
  const errorBox = document.getElementById('login-error');
  errorBox.classList.add('d-none');
  if (!pass) return;

  showLoading(true);
  try {
    await verifyPassword(pass);
    document.getElementById('login-overlay').classList.add('d-none');
    await init();
  } catch (err) {
    errorBox.textContent = err.message || 'Sai mật khẩu, vui lòng thử lại.';
    errorBox.classList.remove('d-none');
  } finally {
    showLoading(false);
  }
}

document.getElementById('btn-logout').addEventListener('click', () => {
  clearStoredPassword();
  if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
  document.getElementById('app-root').classList.add('d-none');
  document.getElementById('login-overlay').classList.remove('d-none');
  document.getElementById('login-password').value = '';
});

// ============================================================
// KHỞI ĐỘNG
// ============================================================
async function init() {
  showLoading(true);
  try {
    FORM_OPTIONS = await callApi('getFormOptions');
    fillSelect(document.querySelector('[name="source"]'), FORM_OPTIONS.source);
    fillSelect(document.querySelector('[name="customerType"]'), (FORM_OPTIONS.customerType || []).filter(v => v !== "Khách mới").sort((a, b) => a === "Khách quan tâm" ? -1 : b === "Khách quan tâm" ? 1 : 0));
    document.querySelector('[name="customerType"]').dispatchEvent(new Event("change"));
    fillSelect(document.querySelector('[name="currentStatus"]'), FORM_OPTIONS.currentStatus);
    fillSelect(document.getElementById('select-customer-segment'), FORM_OPTIONS.customerSegment);
    fillSelect(document.getElementById('update-customer-segment'), FORM_OPTIONS.customerSegment);
    fillSelect(document.getElementById('select-sales'), FORM_OPTIONS.sales, 'Chọn người phụ trách...');
    fillSelect(document.getElementById('update-current-status'), FORM_OPTIONS.currentStatus);
    fillSelect(document.getElementById('update-final-status'), FORM_OPTIONS.finalStatus, 'Chưa kết thúc');
    document.querySelector('[name="quoteDate"]').value = new Date().toISOString().slice(0, 10);
    if (typeof initSegmentTomSelect === 'function') initSegmentTomSelect();
    if (typeof initUpdateSegmentTomSelect === 'function') initUpdateSegmentTomSelect();

    ALL_PROJECTS = await callApi('getProjects');
    ALL_CUSTOMERS = await callApi('getCustomers').catch(() => []);
    fillCustomerDatalist(ALL_CUSTOMERS);
    applyListFilters();
    refreshDashboard();

    document.getElementById('app-root').classList.remove('d-none');

    requestNotificationPermissionOnce();
    if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
    // Tự động làm mới nhắc nhở/số liệu mỗi 5 phút trong lúc mở app, không cần bấm gì.
    _autoRefreshTimer = setInterval(() => { reloadAll().catch(() => {}); }, 5 * 60 * 1000);
  } catch (err) {
    toast('Lỗi tải dữ liệu: ' + err.message, 'danger');
    // Nếu lỗi do sai mật khẩu (hết hạn session), quay lại màn hình đăng nhập.
    document.getElementById('app-root').classList.add('d-none');
    document.getElementById('login-overlay').classList.remove('d-none');
  } finally {
    showLoading(false);
  }
}

// Nếu đã đăng nhập trong phiên này (sessionStorage còn mật khẩu), vào thẳng app.
(function bootstrapApp() {
  const savedPass = getStoredPassword();
  if (savedPass) {
    document.getElementById('login-overlay').classList.add('d-none');
    init();
  }
})();
