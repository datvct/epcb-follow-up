// SYNCQUEUE.JS
// Hàng đợi đồng bộ nền (Background Sync Queue)
// —————————————————————————————————————————————
// Cho phép ghi dữ liệu vào bộ nhớ JS trước (instant UI feedback),
// rồi gửi lên Google Apps Script ở nền (background) — không chặn UI.
//
// Flow:
//   1. Người dùng bấm "Thêm báo giá" → tạo object tạm (TEMP-xxx) → thêm vào
//      ALL_PROJECTS → render bảng ngay → đẩy task vào queue.
//   2. Queue tự chạy lần lượt, gọi callApi() cho từng task.
//   3. Thành công → cập nhật sync widget "Đã đồng bộ", gọi reloadAll() im lặng.
//   4. Thất bại → đánh dấu lỗi, cập nhật widget "Lỗi đồng bộ — Bấm thử lại".

const SyncQueue = (function () {
  'use strict';

  // Mỗi item trong queue có dạng:
  // { id, tempId, action, payload, status: 'pending'|'syncing'|'error', error: null, retries: 0 }
  const _queue = [];
  let _processing = false;

  // DOM references (lấy lười — chỉ query 1 lần)
  let _widget = null;
  let _textEl = null;

  function _getWidget() {
    if (!_widget) _widget = document.getElementById('sync-status-widget');
    if (!_textEl) _textEl = document.getElementById('sync-status-text');
    return _widget;
  }

  // Cập nhật widget hiển thị trạng thái đồng bộ trên topbar.
  function _updateWidget() {
    const w = _getWidget();
    if (!w) return;

    const pending = _queue.filter(function (t) { return t.status === 'pending' || t.status === 'syncing'; });
    const errors = _queue.filter(function (t) { return t.status === 'error'; });

    w.classList.remove('d-none');

    if (errors.length > 0) {
      w.className = 'sync-status sync-error';
      w.querySelector('i').className = 'ti ti-cloud-off';
      _textEl.textContent = 'Lỗi đồng bộ (' + errors.length + ') — Bấm thử lại';
      w.title = 'Có ' + errors.length + ' mục lỗi khi đồng bộ lên máy chủ. Bấm để thử lại.';
      w.onclick = retryAll;
    } else if (pending.length > 0) {
      w.className = 'sync-status sync-pending';
      w.querySelector('i').className = 'ti ti-cloud-upload';
      _textEl.textContent = 'Đang đồng bộ (' + pending.length + ')...';
      w.title = 'Đang gửi ' + pending.length + ' mục lên máy chủ...';
      w.onclick = null;
    } else if (_queue.length === 0) {
      // Tất cả đã đồng bộ xong → ẩn widget sau 3 giây
      w.className = 'sync-status sync-idle';
      w.querySelector('i').className = 'ti ti-cloud-check';
      _textEl.textContent = 'Đã đồng bộ';
      w.title = 'Tất cả dữ liệu đã được lưu lên máy chủ.';
      w.onclick = null;
      setTimeout(function () {
        // Chỉ ẩn nếu vẫn đang idle (chưa có task mới)
        if (_queue.length === 0) w.classList.add('d-none');
      }, 3000);
    }
  }

  // Xử lý queue: lấy task pending đầu tiên, gọi API, xử lý kết quả.
  async function _processQueue() {
    if (_processing) return;
    _processing = true;

    while (true) {
      const task = _queue.find(function (t) { return t.status === 'pending'; });
      if (!task) break;

      task.status = 'syncing';
      _updateWidget();

      try {
        const result = await callApi(task.action, task.payload);

        // Thành công → xoá task khỏi queue
        const idx = _queue.indexOf(task);
        if (idx !== -1) _queue.splice(idx, 1);

        // Gọi callback thành công nếu có
        if (typeof task.onSuccess === 'function') {
          task.onSuccess(result);
        }
      } catch (err) {
        task.status = 'error';
        task.error = err.message || 'Lỗi không xác định';
        task.retries = (task.retries || 0) + 1;

        // Gọi callback lỗi nếu có
        if (typeof task.onError === 'function') {
          task.onError(err);
        }

        // Hiển thị toast lỗi cho người dùng biết
        if (typeof toast === 'function') {
          toast('Lỗi đồng bộ: ' + task.error + ' — Bấm nút trên thanh công cụ để thử lại.', 'danger');
        }
      }
    }

    _processing = false;
    _updateWidget();

    // Nếu queue hoàn toàn rỗng (tất cả thành công), làm mới dữ liệu từ
    // server 1 lần im lặng để đảm bảo dữ liệu local khớp 100%.
    if (_queue.length === 0) {
      _silentReload();
    }
  }

  // Làm mới dữ liệu im lặng (không hiện loading overlay, không toast).
  async function _silentReload() {
    try {
      if (typeof reloadAll === 'function') await reloadAll();
    } catch (_e) {
      // Bỏ qua lỗi — dữ liệu sẽ tự đồng bộ ở lần auto-refresh tiếp theo.
    }
  }

  // ——— PUBLIC API ———

  // Đẩy 1 task mới vào queue và bắt đầu xử lý.
  // options: { tempId, action, payload, onSuccess, onError }
  function enqueue(options) {
    const task = {
      id: 'sync_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      tempId: options.tempId || null,
      action: options.action,
      payload: options.payload,
      status: 'pending',
      error: null,
      retries: 0,
      onSuccess: options.onSuccess || null,
      onError: options.onError || null
    };
    _queue.push(task);
    _updateWidget();

    // Bắt đầu xử lý bất đồng bộ (không await — UI không chờ)
    _processQueue();

    return task.id;
  }

  // Thử lại tất cả task bị lỗi.
  function retryAll() {
    _queue.forEach(function (t) {
      if (t.status === 'error') {
        t.status = 'pending';
        t.error = null;
      }
    });
    _updateWidget();
    _processQueue();
  }

  // Kiểm tra xem 1 tempId cụ thể có đang trong queue (pending/syncing/error) không.
  function isPending(tempId) {
    return _queue.some(function (t) { return t.tempId === tempId; });
  }

  // Trả về trạng thái của 1 tempId cụ thể.
  function getStatus(tempId) {
    var task = _queue.find(function (t) { return t.tempId === tempId; });
    return task ? task.status : null;
  }

  // Kiểm tra queue có đang rỗng không (tất cả đã đồng bộ).
  function isEmpty() {
    return _queue.length === 0;
  }

  return {
    enqueue: enqueue,
    retryAll: retryAll,
    isPending: isPending,
    getStatus: getStatus,
    isEmpty: isEmpty
  };
})();
