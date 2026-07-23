// PROJECTS.JS
let ALL_PROJECTS = [];
const updateModal = () => bootstrap.Modal.getOrCreateInstance(document.getElementById('update-modal'));

// ============================================================
// FORM: THÊM BÁO GIÁ
// ============================================================
document.getElementById('form-add-project').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const form = Object.fromEntries(formData.entries());

  // Nhóm khách hàng giờ là multi-select — gom tất cả giá trị đã chọn thành 1 chuỗi, phân tách bởi dấu phẩy.
  const selectedSegments = formData.getAll('customerType2');
  form.customerType2 = selectedSegments.join(', ');
  if (selectedSegments.length === 0) {
    toast('Vui lòng chọn ít nhất 1 Nhóm khách hàng!', 'danger');
    return;
  }

  // Gom chung thành 1 trường customerName tùy theo phân loại
  form.customerName = (form.customerType === 'Khách cũ') ? form.customerNameOld : form.customerNameNew;
  delete form.customerNameOld;
  delete form.customerNameNew;
  
  // KIỂM TRA CHÍNH TẢ KHÁCH HÀNG CŨ (Mặc dù Tom Select đã chặn rồi nhưng cứ phòng hờ)
  if (form.customerType === 'Khách cũ') {
    if (!form.customerName) {
      toast('Vui lòng chọn khách hàng cũ từ danh sách!', 'danger');
      return;
    }
    const found = ALL_CUSTOMERS.find(c => String(c.customerName).trim().toLowerCase() === form.customerName.trim().toLowerCase());
    if (!found) {
      toast('Vui lòng chọn đúng khách hàng có sẵn từ danh sách, hoặc đổi phân loại thành "Khách mới"!', 'danger');
      return;
    }
    form.customerName = found.customerName;
  } else {
    // Khách mới bắt buộc phải có Mã số thuế (thay cho tự generate mã như trước).
    if (!String(form.customerTaxCode || '').trim()) {
      toast('Vui lòng nhập Mã số thuế của khách hàng mới!', 'danger');
      return;
    }
  }
  
  // Lọc bỏ dấu chấm phân tách hàng nghìn trước khi gửi lên API
  if (form.amount) {
    form.amount = form.amount.replace(/\./g, '');
  }
  
  showLoading(true);
  try {
    const res = await callApi('createProject', form);
    toast((res && res.message) || 'Đã thêm báo giá mới.');
    e.target.reset();
    document.querySelector('[name="quoteDate"]').value = new Date().toISOString().slice(0, 10);
    document.getElementById('add-cadence-hint').textContent = '';
    applyReasonRequiredHint('', document.getElementById('add-note-label'), document.getElementById('add-note'));
    if (segmentTomSelect) segmentTomSelect.clear();
    const noteBox = document.getElementById('customer-note-box');
    if (noteBox) noteBox.style.display = 'none';
    await reloadAll();
    switchToTab('list');
  } catch (err) {
    toast('Lỗi: ' + err.message, 'danger');
  } finally {
    showLoading(false);
  }
});

// Gợi ý ngày follow up + đánh dấu ghi chú bắt buộc theo trạng thái đã chọn (form Thêm báo giá).
const addStatusSelect = document.getElementById('add-current-status');
if (addStatusSelect) {
  addStatusSelect.addEventListener('change', () => {
    suggestFollowUpDate(addStatusSelect.value, document.getElementById('add-next-followup'), document.getElementById('add-cadence-hint'));
    applyReasonRequiredHint(addStatusSelect.value, document.getElementById('add-note-label'), document.getElementById('add-note'));
  });
}

// Tự động định dạng hàng nghìn khi nhập số tiền (VNĐ)
const amountInput = document.querySelector('#form-add-project [name="amount"]');
if (amountInput) {
  amountInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value) {
      e.target.value = new Intl.NumberFormat('vi-VN').format(parseInt(value, 10));
    } else {
      e.target.value = '';
    }
  });
}

// ============================================================
// DANH SÁCH & FOLLOW UP
// ============================================================
async function loadProjectList() {
  ALL_PROJECTS = await callApi('getProjects');
  applyListFilters();
}

let CURRENT_LIST_PERIOD = 'week';

function applyListFilters() {
  const period = CURRENT_LIST_PERIOD;
  const q = document.getElementById('search-box').value.trim().toLowerCase();
  const qp = (document.getElementById('search-product-box') ? document.getElementById('search-product-box').value.trim().toLowerCase() : '');
  let rows = filterByPeriod(ALL_PROJECTS, period);
  if (q) rows = rows.filter((r) =>
    (r.customerName || '').toLowerCase().includes(q) ||
    (getCompanyNameByCustomer_(r.customerName) || '').toLowerCase().includes(q) ||
    (r.productFile || '').toLowerCase().includes(q)
  );
  if (qp) rows = rows.filter((r) =>
    (r.productName || '').toLowerCase().includes(qp)
  );
  renderProjectTable(rows);
  document.getElementById('list-count-label').textContent = rows.length + ' / ' + ALL_PROJECTS.length + ' báo giá';
}

function renderProjectTable(rows) {
  const tbody = document.getElementById('project-tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Không có báo giá nào khớp bộ lọc.</td></tr>';
    return;
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  tbody.innerHTML = rows.map((r) => {
    let rowClass = '';
    if (!r.finalStatus && r.nextFollowUpDate) {
      const due = new Date(r.nextFollowUpDate);
      const daysLeft = Math.round((due - today) / (1000 * 60 * 60 * 24));
      if (daysLeft < 0) rowClass = 'row-overdue';
      else if (daysLeft <= 2) rowClass = 'row-soon';
    }
    const isLink = r.productFile && (r.productFile.startsWith('http://') || r.productFile.startsWith('https://'));
    const fileLinkHtml = isLink 
      ? `<a href="${r.productFile}" target="_blank" onclick="event.stopPropagation()" class="btn-view-file ms-2" title="Xem file báo giá (Link Drive)"><i class="ti ti-brand-google-drive text-accent" style="font-size: 1.25rem;"></i></a>` 
      : (r.productFile ? `<span class="text-muted small ms-2" title="${r.productFile}"><i class="ti ti-file-description"></i></span>` : '');

    return `
      <tr class="${rowClass}" style="cursor:pointer" onclick="openUpdateModal('${r.quoteId}')">
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="min-w-0 flex-grow-1">
              ${buildCustomerNameLinesHtml_(r.customerName)}
              <div class="text-muted small text-truncate">${r.customerType || ''}</div>
            </div>
            ${fileLinkHtml}
          </div>
        </td>
        <td class="text-nowrap">${r.sales || ''}</td>
        <td class="text-nowrap">${formatVND(r.amount)}</td>
        <td><span class="status-badge ${statusClass(r.currentStatus)}">${r.currentStatus || ''}</span></td>
        <td class="text-nowrap">${formatPercent(r.probability)}</td>
        <td class="text-nowrap">${formatVND(r.expectedRevenue)}</td>
        <td class="text-nowrap">${r.followUp || 0} lần</td>
        <td class="text-nowrap">${r.nextFollowUpDate || '—'}</td>
        <td class="text-end"><i class="ti ti-edit btn-edit-row"></i></td>
      </tr>`;
  }).join('');
}

document.getElementById('search-box').addEventListener('input', applyListFilters);
const searchProductBox = document.getElementById('search-product-box');
if (searchProductBox) searchProductBox.addEventListener('input', applyListFilters);

// Xử lý chuyển đổi bộ lọc thời gian dạng phân đoạn (Segmented Control)
const listFilterSegmented = document.getElementById('list-period-filter-segmented');
if (listFilterSegmented) {
  listFilterSegmented.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    document.querySelectorAll('#list-period-filter-segmented .seg-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    CURRENT_LIST_PERIOD = btn.dataset.period;
    applyListFilters();
  });
}

// ============================================================
// MODAL CẬP NHẬT
// ============================================================
function openUpdateModal(projectId) {
  const row = ALL_PROJECTS.filter((r) => r.quoteId === projectId)[0];
  if (!row) return;
  const form = document.getElementById('form-update-project');
  form.projectId.value = row.quoteId;
  form.currentStatus.value = row.currentStatus || '';
  form.finalStatus.value = row.finalStatus || '';
  form.nextFollowUpDate.value = row.nextFollowUpDate || '';
  form.note.value = row.note || '';
  form.productFile.value = row.productFile || '';
  document.getElementById('update-followup-count').textContent = row.followUp || 0;
  document.getElementById('update-cadence-hint').textContent = '';
  applyReasonRequiredHint(row.finalStatus || row.currentStatus, document.getElementById('update-note-label'), document.getElementById('update-note'));

  // Hiển thị tên khách hàng + tên công ty (nếu có) ngay đầu modal, và ghi
  // chú quan trọng của khách hàng (nếu có) — tra theo customerName trong
  // danh sách ALL_CUSTOMERS vì tên công ty chỉ lưu ở sheet "Customers".
  const customer = (typeof ALL_CUSTOMERS !== 'undefined' ? ALL_CUSTOMERS : [])
    .find(c => String(c.customerName).trim().toLowerCase() === String(row.customerName || '').trim().toLowerCase());

  const nameEl = document.getElementById('update-modal-customer-name');
  if (nameEl) nameEl.textContent = row.customerName || '';

  const companyBox = document.getElementById('update-modal-company-name');
  const companyText = document.getElementById('update-modal-company-name-text');
  if (companyBox && companyText) {
    if (customer && customer.companyName && String(customer.companyName).trim()) {
      companyText.textContent = customer.companyName;
      companyBox.style.display = 'block';
    } else {
      companyBox.style.display = 'none';
    }
  }

  // Nhóm khách hàng — dữ liệu lưu dạng 1 chuỗi nối bởi ", " (VD: "SI, OEM"),
  // tách ra thành mảng để set lại đúng các lựa chọn đã chọn trên TomSelect.
  const segmentValues = String(row.customerType2 || '').split(',').map(s => s.trim()).filter(Boolean);
  if (updateSegmentTomSelect) {
    updateSegmentTomSelect.clear(true);
    updateSegmentTomSelect.setValue(segmentValues, true);
  } else {
    const segmentSelect = document.getElementById('update-customer-segment');
    if (segmentSelect) {
      Array.from(segmentSelect.options).forEach(opt => { opt.selected = segmentValues.indexOf(opt.value) !== -1; });
    }
  }

  const noteBox = document.getElementById('update-modal-customer-note-box');
  const noteText = document.getElementById('update-modal-customer-note-text');
  if (noteBox && noteText) {
    if (customer && customer.note && String(customer.note).trim()) {
      noteText.textContent = customer.note;
      noteBox.style.display = 'block';
    } else {
      noteBox.style.display = 'none';
    }
  }

  // Hiển thị danh sách sản phẩm đọc tự động từ file Drive (nếu có) — mỗi
  // trường productName/productStatus/productQty/productPrice là 1 chuỗi
  // nhiều sản phẩm nối bởi " | " theo đúng thứ tự (xem QuoteParser.gs), nên
  // cần tách ra để render thành từng dòng trong bảng, thay vì gộp 1 dòng text.
  const productBox = document.getElementById('update-modal-product-box');
  if (productBox) {
    if (row.productName || row.productParseStatus) {
      const rowsHtml = buildProductRowsHtml_(row);
      document.getElementById('update-modal-product-rows').innerHTML = rowsHtml ||
        '<tr><td colspan="4" class="text-muted">Chưa có dữ liệu sản phẩm — nhập tay hoặc bấm nút đọc lại file.</td></tr>';
      const totalNum = Number(row.productTotal) || 0;
      document.getElementById('update-modal-product-grand-total').textContent = totalNum ? formatVND(totalNum) : '—';
      document.getElementById('update-modal-product-status').textContent = row.productParseStatus || '';
      productBox.style.display = 'block';
    } else {
      productBox.style.display = 'none';
    }
  }

  updateModal().show();
}

// Tách 1 trường đã nối bởi " | " (xem QuoteParser.gs) thành mảng từng sản phẩm.
function splitJoinedField_(value) {
  return String(value || '').split(' | ').map(function (s) { return s.trim(); });
}

// Ghép 4 trường productName/productStatus/productQty/productPrice (mỗi
// trường 1 chuỗi nối " | ") thành các dòng <tr> hiển thị trong modal chi
// tiết báo giá — 1 dòng cho mỗi sản phẩm, đúng thứ tự trong file gốc.
function buildProductRowsHtml_(row) {
  const names = splitJoinedField_(row.productName);
  const statuses = splitJoinedField_(row.productStatus);
  const qtys = splitJoinedField_(row.productQty);
  const prices = splitJoinedField_(row.productPrice);
  const count = names.filter(function (n) { return n; }).length;

  let html = '';
  for (let i = 0; i < count; i++) {
    const qtyNum = Number(qtys[i]) || 0;
    const priceNum = Number(prices[i]) || 0;
    html += '<tr>' +
      '<td>' + escapeHtml_(names[i] || '') + '</td>' +
      '<td>' + escapeHtml_(statuses[i] || '') + '</td>' +
      '<td class="text-end">' + (qtyNum ? qtyNum.toLocaleString('vi-VN') : '') + '</td>' +
      '<td class="text-end">' + (priceNum ? formatVND(priceNum) : '') + '</td>' +
      '</tr>';
  }
  return html;
}

// Tránh lỗi hiển thị/HTML injection khi tên sản phẩm chứa ký tự đặc biệt.
function escapeHtml_(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.getElementById('btn-reparse-quote-file').addEventListener('click', async () => {
  const projectId = document.querySelector('#form-update-project [name="projectId"]').value;
  if (!projectId) return;
  showLoading(true);
  try {
    const res = await callApi('reparseProjectQuoteFile', { projectId });
    toast((res && res.message) || 'Đã đọc lại file báo giá.');
    await reloadAll();
    openUpdateModal(projectId);
  } catch (err) {
    toast('Lỗi: ' + err.message, 'danger');
  } finally {
    showLoading(false);
  }
});

// Gợi ý ngày follow up + đánh dấu ghi chú bắt buộc khi đổi trạng thái trong modal cập nhật.
const updateStatusSelect = document.getElementById('update-current-status');
const updateFinalStatusSelect = document.getElementById('update-final-status');
if (updateStatusSelect) {
  updateStatusSelect.addEventListener('change', () => {
    suggestFollowUpDate(updateStatusSelect.value, document.getElementById('update-next-followup'), document.getElementById('update-cadence-hint'));
    const effectiveStatus = updateFinalStatusSelect.value || updateStatusSelect.value;
    applyReasonRequiredHint(effectiveStatus, document.getElementById('update-note-label'), document.getElementById('update-note'));
  });
}
if (updateFinalStatusSelect) {
  updateFinalStatusSelect.addEventListener('change', () => {
    const effectiveStatus = updateFinalStatusSelect.value || updateStatusSelect.value;
    applyReasonRequiredHint(effectiveStatus, document.getElementById('update-note-label'), document.getElementById('update-note'));
  });
}

document.getElementById('btn-mark-followup').addEventListener('click', async () => {
  const projectId = document.querySelector('#form-update-project [name="projectId"]').value;
  if (!projectId) return;

  const currentDateVal = document.getElementById('update-next-followup').value;
  if (!confirmEarlyFollowUp(currentDateVal)) return;

  // Tự động dời "Ngày follow up tiếp theo" theo nhịp cố định của trạng thái đang chọn
  // (Đang báo giá +3 ngày, Đang đàm phán +5 ngày, Đã đặt cọc +3 ngày, mặc định +3 ngày).
  const statusVal = document.getElementById('update-current-status').value;
  const cadenceDays = ((FORM_OPTIONS && FORM_OPTIONS.followUpCadence) || {})[statusVal] || 3;
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + cadenceDays);
  const nextDateStr = nextDate.toISOString().slice(0, 10);

  showLoading(true);
  try {
    await callApi('markFollowUp', {
      projectId: projectId,
      nextFollowUpDate: nextDateStr,
      note: document.querySelector('#form-update-project [name="note"]').value
    });
    toast('Đã ghi nhận follow up — tự động dời hẹn tiếp theo sang ' + nextDateStr.split('-').reverse().join('/') + '.');
    document.getElementById('update-next-followup').value = nextDateStr;
    document.getElementById('update-cadence-hint').textContent = '';
    await reloadAll();
    const count = document.getElementById('update-followup-count');
    count.textContent = Number(count.textContent) + 1;
  } catch (err) {
    toast('Lỗi: ' + err.message, 'danger');
  } finally {
    showLoading(false);
  }
});

// Follow up nhanh 1-chạm ngay trong danh sách nhắc nhở, không cần mở modal.
async function quickFollowUp(projectId) {
  const row = ALL_PROJECTS.find((r) => r.quoteId === projectId);
  if (row && !confirmEarlyFollowUp(row.nextFollowUpDate)) return;

  const cadenceDays = row ? ((FORM_OPTIONS && FORM_OPTIONS.followUpCadence) || {})[row.currentStatus] || 3 : 3;
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + cadenceDays);
  const nextDateStr = nextDate.toISOString().slice(0, 10);

  showLoading(true);
  try {
    await callApi('markFollowUp', { projectId: projectId, nextFollowUpDate: nextDateStr });
    toast('Đã ghi nhận follow up — hẹn tiếp theo ngày ' + nextDateStr.split('-').reverse().join('/') + '.');
    await reloadAll();
  } catch (err) {
    toast('Lỗi: ' + err.message, 'danger');
  } finally {
    showLoading(false);
  }
}

document.getElementById('form-update-project').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const form = Object.fromEntries(formData.entries());

  // Nhóm khách hàng là multi-select — Object.fromEntries chỉ giữ giá trị
  // cuối cùng nên phải gom lại bằng getAll() giống form Thêm báo giá.
  const selectedSegments = formData.getAll('customerType2');
  form.customerType2 = selectedSegments.join(', ');

  const projectId = form.projectId;
  delete form.projectId;
  showLoading(true);
  try {
    await callApi('updateProject', { projectId: projectId, form: form });
    toast('Đã lưu thay đổi.');
    updateModal().hide();
    await reloadAll();
  } catch (err) {
    toast('Lỗi: ' + err.message, 'danger');
  } finally {
    showLoading(false);
  }
});

document.getElementById('btn-delete-project').addEventListener('click', async () => {
  const projectId = document.querySelector('#form-update-project [name="projectId"]').value;
  if (!projectId) return;
  if (!confirm('Xoá báo giá này? Không thể hoàn tác.')) return;
  showLoading(true);
  try {
    await callApi('deleteProject', { projectId: projectId });
    toast('Đã xoá báo giá.');
    updateModal().hide();
    await reloadAll();
  } catch (err) {
    toast('Lỗi: ' + err.message, 'danger');
  } finally {
    showLoading(false);
  }
});

// ============================================================
// TOM SELECT: SELECT SEARCH KHÁCH HÀNG CŨ
// ============================================================
let tomSelectInstance = null;
let companyTomSelect = null;
// Cờ chống lặp vô hạn: khi 1 trong 2 ô (Tên công ty / Tên khách hàng) đang tự
// điền giá trị cho ô còn lại, tạm tắt xử lý onChange của ô kia để tránh 2 ô
// gọi qua gọi lại nhau liên tục.
let _isSyncingCustomerCompany = false;

// Điền SĐT/Email/Ghi chú theo đúng khách hàng đã chọn (dùng chung cho cả 2
// chiều: chọn từ ô Tên khách hàng, hoặc tự động chọn khi công ty chỉ có 1
// khách liên hệ duy nhất).
function fillCustomerContactFields_(found) {
  const noteBox = document.getElementById('customer-note-box');
  const noteText = document.getElementById('customer-note-text');
  const phoneInput = document.querySelector('#form-add-project [name="customerPhone"]');
  const emailInput = document.querySelector('#form-add-project [name="customerEmail"]');
  if (phoneInput) phoneInput.value = found.phone || '';
  if (emailInput) emailInput.value = found.email || '';
  if (noteBox && noteText) {
    if (found.note && found.note.trim()) {
      noteText.textContent = found.note;
      noteBox.style.display = 'block';
    } else {
      noteBox.style.display = 'none';
    }
  }
}

// Chọn đúng 1 khách hàng cụ thể + đồng bộ 2 chiều sang ô Tên công ty (nếu
// khách lẻ không có công ty thì để trống ô công ty).
function selectCustomerAndFill_(found) {
  _isSyncingCustomerCompany = true;
  try {
    if (tomSelectInstance) {
      restoreFullCustomerOptions_(false);
      tomSelectInstance.setValue(found.customerName, true); // silent, không bắn lại onChange
    }
    if (companyTomSelect) {
      const companyVal = (found.companyName || '').trim();
      if (companyVal) {
        if (!companyTomSelect.options[companyVal]) companyTomSelect.addOption({ value: companyVal, text: companyVal });
        companyTomSelect.setValue(companyVal, true);
      } else {
        companyTomSelect.clear(true);
      }
    }
    fillCustomerContactFields_(found);
  } finally {
    _isSyncingCustomerCompany = false;
  }
}

// Thu hẹp danh sách ô Tên khách hàng xuống chỉ còn các khách của 1 công ty
// (dùng khi công ty vừa chọn có NHIỀU khách liên hệ khác nhau).
function setCustomerOptions_(customers) {
  if (!tomSelectInstance) return;
  tomSelectInstance.clear(true);
  tomSelectInstance.clearOptions();
  customers.forEach((c) => {
    tomSelectInstance.addOption({ value: c.customerName, customerName: c.customerName, companyName: c.companyName || '' });
  });
  tomSelectInstance.refreshOptions(false);
}

// Trả lại đầy đủ danh sách khách hàng cho ô Tên khách hàng (bỏ lọc theo công ty).
function restoreFullCustomerOptions_(keepValue) {
  if (!tomSelectInstance) return;
  const current = keepValue ? tomSelectInstance.getValue() : null;
  tomSelectInstance.clearOptions();
  (ALL_CUSTOMERS || []).filter((c) => c.customerName).forEach((c) => {
    tomSelectInstance.addOption({ value: c.customerName, customerName: c.customerName, companyName: c.companyName || '' });
  });
  tomSelectInstance.refreshOptions(false);
  if (current) tomSelectInstance.setValue(current, true);
}

// TomSelect ô "Tên công ty" — đặt TRƯỚC ô chọn khách hàng theo yêu cầu:
// - Khách cũ: chọn/gõ đúng 1 công ty đã có -> nếu công ty đó chỉ có ĐÚNG 1
//   khách liên hệ, tự điền luôn Tên khách hàng + SĐT/Email/Ghi chú. Nếu công
//   ty có NHIỀU khách liên hệ, thu hẹp danh sách ô Tên khách hàng xuống chỉ
//   còn các khách của công ty đó để chọn tiếp cho đúng người.
// - Khách mới / khách lẻ không công ty: cho gõ tự do (create: true), không
//   tra cứu ngược, có thể bỏ trống.
function initCompanyTomSelect() {
  const selectEl = document.getElementById('select-customer-company');
  if (!selectEl) return;

  if (companyTomSelect) {
    companyTomSelect.destroy();
    companyTomSelect = null;
  }
  selectEl.innerHTML = '';

  if (typeof TomSelect === 'undefined') return;

  const companyNames = [...new Set(
    (ALL_CUSTOMERS || []).map((c) => (c.companyName || '').trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'vi'));

  companyTomSelect = new TomSelect(selectEl, {
    options: companyNames.map((name) => ({ value: name, text: name })),
    valueField: 'value',
    labelField: 'text',
    searchField: ['text'],
    create: true,
    createOnBlur: true,
    placeholder: 'Gõ hoặc chọn tên công ty (bỏ trống nếu khách lẻ)...',
    onChange: function (val) {
      if (_isSyncingCustomerCompany) return; // đang tự điền từ ô khách hàng, không tra cứu ngược lại
      if (!customerTypeSelect || customerTypeSelect.value !== 'Khách cũ') return; // khách mới: chỉ là chữ gõ tự do

      if (!val) {
        restoreFullCustomerOptions_(false);
        return;
      }

      const matches = (ALL_CUSTOMERS || []).filter(
        (c) => String(c.companyName || '').trim().toLowerCase() === String(val).trim().toLowerCase()
      );

      if (matches.length === 1) {
        selectCustomerAndFill_(matches[0]);
      } else if (matches.length > 1) {
        setCustomerOptions_(matches);
        if (tomSelectInstance) tomSelectInstance.clear(true);
        const noteBox = document.getElementById('customer-note-box');
        if (noteBox) noteBox.style.display = 'none';
      } else {
        restoreFullCustomerOptions_(false);
      }
    }
  });
}

// TomSelect chọn khách cũ — hỗ trợ gõ tìm theo Tên khách hàng HOẶC Tên công ty
// (searchField cả 2), hiển thị rõ cả 2 dòng trong danh sách gợi ý để dễ phân
// biệt khi nhiều khách hàng trùng tên. Khi chọn xong, các trường SĐT/Email/
// Tên công ty/Ghi chú tự điền theo đúng khách hàng vừa chọn (không cần gõ lại,
// và luôn phản ánh đúng dữ liệu khách hàng đang lưu — ghi đè giá trị cũ nếu có).
function initTomSelect() {
  const selectEl = document.getElementById('select-old-customer');
  if (!selectEl) return;

  if (tomSelectInstance) {
    tomSelectInstance.destroy();
    tomSelectInstance = null;
  }
  selectEl.innerHTML = '';

  if (typeof TomSelect === 'undefined') return;

  const customerOptions = (ALL_CUSTOMERS || [])
    .filter(function (c) { return c.customerName; })
    .map(function (c) {
      return { value: c.customerName, customerName: c.customerName, companyName: c.companyName || '' };
    });

  tomSelectInstance = new TomSelect(selectEl, {
    options: customerOptions,
    valueField: 'value',
    labelField: 'customerName',
    searchField: ['customerName', 'companyName'],
    create: false,
    sortField: [{ field: 'companyName', direction: 'asc' }, { field: 'customerName', direction: 'asc' }],
    placeholder: 'Gõ tên khách hàng hoặc tên công ty để tìm...',
    render: {
      option: function (data, escape) {
        return '<div class="py-1">' +
          '<div class="fw-semibold">' + escape(data.customerName) + '</div>' +
          (data.companyName ? '<div class="text-muted small">' + escape(data.companyName) + '</div>' : '') +
          '</div>';
      },
      item: function (data, escape) {
        const label = data.companyName ? (data.companyName + ' — ' + data.customerName) : data.customerName;
        return '<div>' + escape(label) + '</div>';
      },
      no_results: function (data, escape) {
        return '<div class="no-results px-2 py-1 text-muted small">Không tìm thấy khách hàng/công ty "' + escape(data.input) + '"</div>';
      }
    },
    onChange: function (val) {
      if (_isSyncingCustomerCompany) return; // đang được tự điền từ ô Tên công ty, tránh lặp lại
      const found = ALL_CUSTOMERS.find(function (c) {
        return String(c.customerName).trim().toLowerCase() === String(val).trim().toLowerCase();
      });
      if (found) {
        selectCustomerAndFill_(found);
      } else {
        const noteBox = document.getElementById('customer-note-box');
        if (noteBox) noteBox.style.display = 'none';
      }
    }
  });
}

// ============================================================
// TOM SELECT: MULTI-SELECT "NHÓM KHÁCH HÀNG" (Ở FORM THÊM BÁO GIÁ)
// ============================================================
let segmentTomSelect = null;

function initSegmentTomSelect() {
  const el = document.getElementById('select-customer-segment');
  if (!el || typeof TomSelect === 'undefined') return;

  if (segmentTomSelect) {
    segmentTomSelect.destroy();
    segmentTomSelect = null;
  }

  segmentTomSelect = new TomSelect(el, {
    plugins: ['remove_button'],
    placeholder: 'Chọn 1 hoặc nhiều nhóm khách hàng...',
    maxItems: null,
    sortField: { field: 'text', direction: 'asc' }
  });
}

// ============================================================
// TOM SELECT: MULTI-SELECT "NHÓM KHÁCH HÀNG" (Ở MODAL CẬP NHẬT BÁO GIÁ)
// ============================================================
let updateSegmentTomSelect = null;

function initUpdateSegmentTomSelect() {
  const el = document.getElementById('update-customer-segment');
  if (!el || typeof TomSelect === 'undefined') return;

  if (updateSegmentTomSelect) {
    updateSegmentTomSelect.destroy();
    updateSegmentTomSelect = null;
  }

  updateSegmentTomSelect = new TomSelect(el, {
    plugins: ['remove_button'],
    placeholder: 'Chọn 1 hoặc nhiều nhóm khách hàng...',
    maxItems: null,
    sortField: { field: 'text', direction: 'asc' }
  });
}

// Xử lý giao diện chọn Khách cũ / Khách mới
const customerTypeSelect = document.getElementById('select-customer-type');
const wrapperOld = document.getElementById('wrapper-customer-old');
const wrapperNew = document.getElementById('wrapper-customer-new');
const inputNew = document.getElementById('input-customer-new');
const wrapperTaxCode = document.getElementById('wrapper-customer-taxcode');
const inputTaxCode = document.getElementById('input-customer-taxcode');
const wrapperCustomerNote = document.getElementById('wrapper-customer-note');
const customerNoteBox = document.getElementById('customer-note-box');

if (customerTypeSelect && wrapperOld && wrapperNew) {
  customerTypeSelect.addEventListener('change', () => {
    if (!companyTomSelect) initCompanyTomSelect(); // ô Tên công ty dùng chung cho cả 2 loại, khởi tạo 1 lần

    if (customerTypeSelect.value === 'Khách cũ') {
      wrapperOld.style.display = 'block';
      wrapperNew.style.display = 'none';
      inputNew.removeAttribute('required');
      if (wrapperTaxCode) wrapperTaxCode.style.display = 'none';
      if (inputTaxCode) { inputTaxCode.removeAttribute('required'); inputTaxCode.value = ''; }
      if (wrapperCustomerNote) wrapperCustomerNote.style.display = 'none';
      if (!tomSelectInstance) initTomSelect();
      restoreFullCustomerOptions_(false); // bỏ lọc theo công ty nếu còn sót từ lần chọn trước
    } else {
      wrapperOld.style.display = 'none';
      wrapperNew.style.display = 'block';
      inputNew.setAttribute('required', 'true');
      if (wrapperTaxCode) wrapperTaxCode.style.display = 'block';
      if (inputTaxCode) inputTaxCode.setAttribute('required', 'true');
      if (wrapperCustomerNote) wrapperCustomerNote.style.display = 'block';
      if (customerNoteBox) customerNoteBox.style.display = 'none';

      // Xoá sđt/email/công ty cũ nếu chuyển sang khách mới (khách mới gõ tay lại từ đầu)
      document.querySelector('#form-add-project [name="customerPhone"]').value = '';
      document.querySelector('#form-add-project [name="customerEmail"]').value = '';
      if (companyTomSelect) companyTomSelect.clear();
      if (tomSelectInstance) restoreFullCustomerOptions_(false);
    }
  });
}