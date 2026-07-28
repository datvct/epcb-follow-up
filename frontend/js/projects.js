// PROJECTS.JS
let ALL_PROJECTS = [];
const updateModal = () =>
  bootstrap.Modal.getOrCreateInstance(document.getElementById("update-modal"));

// ============================================================
// FORM: THÊM BÁO GIÁ (Background Sync)
// ============================================================
document
  .getElementById("form-add-project")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const form = Object.fromEntries(formData.entries());

    // Nhóm khách hàng giờ là multi-select — gom tất cả giá trị đã chọn thành 1 chuỗi, phân tách bởi dấu phẩy.
    const selectedSegments = formData.getAll("customerType2");
    form.customerType2 = selectedSegments.join(", ");
    if (selectedSegments.length === 0) {
      toast("Vui lòng chọn ít nhất 1 Nhóm khách hàng!", "danger");
      return;
    }

    // Gom chung thành 1 trường customerName tùy theo phân loại
    form.customerName =
      form.customerType === "Khách cũ"
        ? String(form.customerContactNameOld || form.customerNameOld || "").trim()
        : form.customerNameNew;
    delete form.customerNameOld;
    delete form.customerNameNew;
    delete form.customerContactNameOld;

    // KIỂM TRA KHÁCH HÀNG CŨ — cho phép cả khách có sẵn lẫn tên tự nhập mới.
    if (form.customerType === "Khách cũ") {
      if (!form.customerName || !String(form.customerName).trim()) {
        toast("Vui lòng chọn hoặc nhập tên khách hàng / công ty!", "danger");
        return;
      }
      // Nếu tên trùng khớp khách cũ, dùng đúng tên đã lưu (tránh lỗi chính tả)
      const found = ALL_CUSTOMERS.find(
        (c) =>
          String(c.customerName).trim().toLowerCase() ===
          form.customerName.trim().toLowerCase(),
      );
      if (found) {
        form.customerName = found.customerName;
      }
      // Nếu không tìm thấy → vẫn cho phép gửi lên (tên mới do user tự nhập)
    } else {
      // Khách mới bắt buộc phải có Mã số thuế (thay cho tự generate mã như trước).
      if (!String(form.customerTaxCode || "").trim()) {
        toast("Vui lòng nhập Mã số thuế của khách hàng mới!", "danger");
        return;
      }
    }

    // Lọc bỏ dấu chấm phân tách hàng nghìn trước khi gửi lên API
    if (form.amount) {
      form.amount = form.amount.replace(/\./g, "");
    }

    // ——— BACKGROUND SYNC: Tạo project tạm, render ngay, gửi API ở nền ———
    const tempId = 'TEMP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const amount = Number(form.amount) || 0;
    // Dùng probability cache nếu có, mặc định 0
    const probMap = (typeof PROBABILITY_MAP_CACHE !== 'undefined' ? PROBABILITY_MAP_CACHE : []);
    const probEntry = probMap.find(function (m) { return m.status === form.currentStatus; });
    const probability = probEntry ? Number(probEntry.probability) : 0;
    const companyOrFallback = String(form.companyName || '').trim() || String(form.customerName || '').trim();

    const tempProject = {
      quoteId: tempId,
      week: '',
      quoteDate: form.quoteDate || new Date().toISOString().slice(0, 10),
      source: form.source,
      customerName: companyOrFallback,
      customerContactName: form.customerName,
      customerType: form.customerType,
      productFile: form.productFile || '',
      amount: amount,
      currentStatus: form.currentStatus,
      followUp: 0,
      nextFollowUpDate: form.nextFollowUpDate || '',
      finalStatus: '',
      customerType2: form.customerType2 || '',
      sales: form.sales,
      note: form.note || '',
      probability: probability,
      expectedRevenue: amount * probability,
      _pendingSync: true  // Đánh dấu là chưa đồng bộ
    };

    // Thêm vào đầu danh sách và render ngay lập tức
    ALL_PROJECTS.unshift(tempProject);
    //乐观地 thêm khách hàng mới vào ALL_CUSTOMERS (nếu chưa có) — giúp TomSelect
    // ngay lập tức hiển thị khách vừa tạo, không cần chờ server đồng bộ.
    if (form.customerType === "Khách cũ" && form.customerName) {
      const _exists = ALL_CUSTOMERS.some(
        (c) => String(c.customerName).trim().toLowerCase() === form.customerName.trim().toLowerCase()
      );
      if (!_exists) {
        ALL_CUSTOMERS.push({
          customerName: form.customerName,
          companyName: form.companyName || '',
          phone: form.customerPhone || '',
          email: form.customerEmail || '',
          note: '',
        });
        if (typeof initTomSelect === 'function') initTomSelect();
      }
    }
    applyListFilters();
    refreshDashboard();

    // Reset form
    e.target.reset();
    document.querySelector('[name="quoteDate"]').value = new Date()
      .toISOString()
      .slice(0, 10);
    document.getElementById("add-cadence-hint").textContent = "";
    applyReasonRequiredHint(
      "",
      document.getElementById("add-note-label"),
      document.getElementById("add-note"),
    );
    if (segmentTomSelect) segmentTomSelect.clear();
    const noteBox = document.getElementById("customer-note-box");
    if (noteBox) noteBox.style.display = "none";
    if (tomSelectInstance) tomSelectInstance.clear(true);

    // Chuyển sang tab danh sách và thông báo
    switchToTab("list");
    toast("Đã thêm báo giá — đang đồng bộ lên máy chủ...");

    // Đẩy vào hàng đợi đồng bộ nền
    SyncQueue.enqueue({
      tempId: tempId,
      action: 'createProject',
      payload: form,
      onSuccess: function (_res) {
        // Xoá project tạm — dữ liệu thực sẽ được tải lại bởi _silentReload
        const idx = ALL_PROJECTS.findIndex(function (p) { return p.quoteId === tempId; });
        if (idx !== -1) ALL_PROJECTS.splice(idx, 1);
        toast('Đã lưu báo giá thành công lên máy chủ.');
      },
      onError: function (err) {
        // Đánh dấu project tạm là lỗi sync (để render khác biệt)
        const proj = ALL_PROJECTS.find(function (p) { return p.quoteId === tempId; });
        if (proj) proj._syncError = true;
        applyListFilters();
      }
    });
  });

// Gợi ý ngày follow up + đánh dấu ghi chú bắt buộc theo trạng thái đã chọn (form Thêm báo giá).
const addStatusSelect = document.getElementById("add-current-status");
if (addStatusSelect) {
  addStatusSelect.addEventListener("change", () => {
    suggestFollowUpDate(
      addStatusSelect.value,
      document.getElementById("add-next-followup"),
      document.getElementById("add-cadence-hint"),
    );
    applyReasonRequiredHint(
      addStatusSelect.value,
      document.getElementById("add-note-label"),
      document.getElementById("add-note"),
    );
  });
}

// Tự động định dạng hàng nghìn khi nhập số tiền (VNĐ)
const amountInput = document.querySelector('#form-add-project [name="amount"]');
if (amountInput) {
  amountInput.addEventListener("input", (e) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value) {
      e.target.value = new Intl.NumberFormat("vi-VN").format(
        parseInt(value, 10),
      );
    } else {
      e.target.value = "";
    }
  });
}

// ============================================================
// DANH SÁCH & FOLLOW UP
// ============================================================
async function loadProjectList() {
  ALL_PROJECTS = await callApi("getProjects");
  applyListFilters();
}

let CURRENT_LIST_PERIOD = "week";
let CURRENT_AMOUNT_SORT = null; // null | "asc" | "desc"
let CURRENT_FOLLOWUP_SORT = null; // null | "asc" | "desc"

document.getElementById("sort-amount-btn").addEventListener("click", function () {
  if (CURRENT_AMOUNT_SORT === null) CURRENT_AMOUNT_SORT = "desc";
  else if (CURRENT_AMOUNT_SORT === "desc") CURRENT_AMOUNT_SORT = "asc";
  else CURRENT_AMOUNT_SORT = null;
  const icon = this.querySelector("i");
  icon.className = CURRENT_AMOUNT_SORT === "desc" ? "ti ti-arrow-down" : CURRENT_AMOUNT_SORT === "asc" ? "ti ti-arrow-up" : "ti ti-arrows-sort";
  this.title = CURRENT_AMOUNT_SORT === "desc" ? "Đang giảm dần — bấm để chuyển tăng dần" : CURRENT_AMOUNT_SORT === "asc" ? "Đang tăng dần — bấm để tắt sắp xếp" : "Sắp xếp theo giá trị đơn";
  applyListFilters();
});

document.getElementById("sort-followup-btn").addEventListener("click", function () {
  if (CURRENT_FOLLOWUP_SORT === null) CURRENT_FOLLOWUP_SORT = "asc";
  else if (CURRENT_FOLLOWUP_SORT === "asc") CURRENT_FOLLOWUP_SORT = "desc";
  else CURRENT_FOLLOWUP_SORT = null;
  const icon = this.querySelector("i");
  icon.className = CURRENT_FOLLOWUP_SORT === "asc" ? "ti ti-arrow-up" : CURRENT_FOLLOWUP_SORT === "desc" ? "ti ti-arrow-down" : "ti ti-arrows-sort";
  this.title = CURRENT_FOLLOWUP_SORT === "asc" ? "Đang tăng dần — bấm để chuyển giảm dần" : CURRENT_FOLLOWUP_SORT === "desc" ? "Đang giảm dần — bấm để tắt sắp xếp" : "Sắp xếp theo ngày follow up";
  applyListFilters();
});

function applyListFilters() {
  const period = CURRENT_LIST_PERIOD;
  const q = document.getElementById("search-box").value.trim().toLowerCase();
  const qp = document.getElementById("search-product-box")
    ? document.getElementById("search-product-box").value.trim().toLowerCase()
    : "";
  let rows = filterByPeriod(ALL_PROJECTS, period);
  if (q)
    rows = rows.filter(
      (r) =>
        (r.customerName || "").toLowerCase().includes(q) ||
        (r.customerContactName || "").toLowerCase().includes(q) ||
        (r.productFile || "").toLowerCase().includes(q),
    );
  if (qp)
    rows = rows.filter((r) => (r.productName || "").toLowerCase().includes(qp));
  if (CURRENT_AMOUNT_SORT) {
    rows.sort((a, b) => {
      const va = Number(a.amount) || 0;
      const vb = Number(b.amount) || 0;
      return CURRENT_AMOUNT_SORT === "asc" ? va - vb : vb - va;
    });
  }
  if (CURRENT_FOLLOWUP_SORT) {
    rows.sort((a, b) => {
      const da = a.nextFollowUpDate ? new Date(a.nextFollowUpDate).getTime() : Infinity;
      const db = b.nextFollowUpDate ? new Date(b.nextFollowUpDate).getTime() : Infinity;
      return CURRENT_FOLLOWUP_SORT === "asc" ? da - db : db - da;
    });
  }
  renderProjectTable(rows);
  document.getElementById("list-count-label").textContent =
    rows.length + " / " + ALL_PROJECTS.length + " báo giá";
}

function renderProjectTable(rows) {
  const tbody = document.getElementById("project-tbody");
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="9" class="text-center text-muted py-4">Không có báo giá nào khớp bộ lọc.</td></tr>';
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  tbody.innerHTML = rows
    .map((r) => {
      let rowClass = "";
      if (r._syncError) {
        rowClass = "row-sync-error";
      } else if (r._pendingSync) {
        rowClass = "row-pending-sync";
      } else if (!r.finalStatus && r.nextFollowUpDate) {
        const due = new Date(r.nextFollowUpDate);
        const daysLeft = Math.round((due - today) / (1000 * 60 * 60 * 24));
        if (daysLeft < 0) rowClass = "row-overdue";
        else if (daysLeft <= 2) rowClass = "row-soon";
      }

      // Tên công ty — luôn hiển thị ở cột đầu tiên
      const companyName = r.customerName || "";
      // Tên người liên hệ — cột phụ (hiển thị sau nếu khác tên công ty)
      const contactName = r.customerContactName || "";

      // Link drive
      const isLink =
        r.productFile &&
        (r.productFile.startsWith("http://") ||
          r.productFile.startsWith("https://"));
      const fileLinkHtml = isLink
        ? `<a href="${r.productFile}" target="_blank" onclick="event.stopPropagation()" class="btn-view-file" title="Xem file báo giá"><i class="ti ti-brand-google-drive text-accent" style="font-size:1.2rem;"></i></a>`
        : r.productFile
          ? `<span class="text-muted small" title="${r.productFile}"><i class="ti ti-file-description"></i></span>`
          : '<span class="text-muted">—</span>';

      // Follow up: hiển thị "N lần" + ngày hẹn (nếu có)
      const followUpCount = r.followUp || 0;
      let followUpHtml = followUpCount + " lần";
      if (r.nextFollowUpDate && !r.finalStatus) {
        followUpHtml += '<br><span class="text-muted small">' + r.nextFollowUpDate + '</span>';
      }

      // Ghi chú: truncate nếu quá dài
      const noteText = r.note || "";
      const noteTruncated = noteText.length > 60 ? noteText.slice(0, 60) + "…" : noteText;
      const noteHtml = noteTruncated
        ? '<span title="' + noteText.replace(/"/g, '&quot;') + '">' + noteTruncated + '</span>'
        : '<span class="text-muted">—</span>';

      // Nút sửa project
      const editBtn = '<i class="ti ti-edit btn-edit-row btn-action-inline" title="Sửa đơn báo giá"></i>';

      // Nút sửa thông tin khách hàng — luôn hiển thị
      const editCustomerHtml = companyName
        ? `<i class="ti ti-user-edit btn-edit-customer-inline btn-action-inline" title="Sửa thông tin khách hàng" onclick="event.stopPropagation(); openUpdateCustomerModal('${companyName.replace(/'/g, "\\'")}')"></i>`
        : '';

      return `
      <tr class="${rowClass}" style="cursor:pointer" onclick="openUpdateModal('${r.quoteId}')">
        <td style="min-width:200px; max-width:280px; white-space:normal; word-break:break-word;">
          <span title="${companyName.replace(/"/g, '&quot;')}">${companyName || "—"}</span>
        </td>
        <td style="min-width:160px; max-width:240px; white-space:normal; word-break:break-word;">
          <span title="${contactName.replace(/"/g, '&quot;')}">${contactName || "—"}</span>
        </td>
        <td class="text-nowrap">${fileLinkHtml}</td>
        <td class="text-nowrap">${r.sales || ""}</td>
        <td class="text-nowrap">${formatVND(r.amount)}</td>
        <td><span class="status-badge ${statusClass(r.currentStatus)}">${r.currentStatus || ""}</span></td>
        <td class="text-nowrap">${followUpHtml}</td>
        <td style="max-width:200px; white-space:normal; font-size:0.85rem;">${noteHtml}</td>
        <td class="text-end text-nowrap">${editCustomerHtml} ${editBtn}</td>
      </tr>`;
    })
    .join("");
}

document
  .getElementById("search-box")
  .addEventListener("input", applyListFilters);
const searchProductBox = document.getElementById("search-product-box");
if (searchProductBox)
  searchProductBox.addEventListener("input", applyListFilters);

// Xử lý chuyển đổi bộ lọc thời gian dạng phân đoạn (Segmented Control)
const listFilterSegmented = document.getElementById(
  "list-period-filter-segmented",
);
if (listFilterSegmented) {
  listFilterSegmented.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    document
      .querySelectorAll("#list-period-filter-segmented .seg-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
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
  if (row._pendingSync) {
    toast("Báo giá đang đồng bộ lên máy chủ, vui lòng đợi vài giây rồi thử lại.", "warning");
    return;
  }
  if (row._syncError) {
    toast("Báo giá này bị lỗi khi đồng bộ. Vui lòng bấm vào biểu tượng đồng bộ trên thanh công cụ để thử lại trước khi sửa.", "warning");
    return;
  }
  const form = document.getElementById("form-update-project");
  form.projectId.value = row.quoteId;
  form.currentStatus.value = row.currentStatus || "";
  form.finalStatus.value = row.finalStatus || "";
  form.nextFollowUpDate.value = row.nextFollowUpDate || "";
  form.note.value = row.note || "";
  form.productFile.value = row.productFile || "";
  document.getElementById("update-followup-count").textContent =
    row.followUp || 0;
  document.getElementById("update-cadence-hint").textContent = "";
  applyReasonRequiredHint(
    row.finalStatus || row.currentStatus,
    document.getElementById("update-note-label"),
    document.getElementById("update-note"),
  );

  // Hiển thị tên khách hàng + tên công ty (nếu có) ngay đầu modal, và ghi
  // chú quan trọng của khách hàng (nếu có) — tra theo customerName trong
  // danh sách ALL_CUSTOMERS vì tên công ty chỉ lưu ở sheet "Customers".
  const customer = (
    typeof ALL_CUSTOMERS !== "undefined" ? ALL_CUSTOMERS : []
  ).find(
    (c) =>
      String(c.customerName).trim().toLowerCase() ===
      String(row.customerName || "")
        .trim()
        .toLowerCase(),
  );

  const nameEl = document.getElementById("update-modal-customer-name");
  if (nameEl) nameEl.textContent = row.customerName || "";

  const companyBox = document.getElementById("update-modal-company-name");
  const companyText = document.getElementById("update-modal-company-name-text");
  if (companyBox && companyText) {
    if (
      customer &&
      customer.companyName &&
      String(customer.companyName).trim()
    ) {
      companyText.textContent = customer.companyName;
      companyBox.style.display = "block";
    } else {
      companyBox.style.display = "none";
    }
  }

  // Nhóm khách hàng — dữ liệu lưu dạng 1 chuỗi nối bởi ", " (VD: "SI, OEM"),
  // tách ra thành mảng để set lại đúng các lựa chọn đã chọn trên TomSelect.
  const segmentValues = String(row.customerType2 || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (updateSegmentTomSelect) {
    updateSegmentTomSelect.clear(true);
    updateSegmentTomSelect.setValue(segmentValues, true);
  } else {
    const segmentSelect = document.getElementById("update-customer-segment");
    if (segmentSelect) {
      Array.from(segmentSelect.options).forEach((opt) => {
        opt.selected = segmentValues.indexOf(opt.value) !== -1;
      });
    }
  }

  const noteBox = document.getElementById("update-modal-customer-note-box");
  const noteText = document.getElementById("update-modal-customer-note-text");
  if (noteBox && noteText) {
    if (customer && customer.note && String(customer.note).trim()) {
      noteText.textContent = customer.note;
      noteBox.style.display = "block";
    } else {
      noteBox.style.display = "none";
    }
  }

  // Hiển thị danh sách sản phẩm đọc tự động từ file Drive (nếu có) — mỗi
  // trường productName/productStatus/productQty/productPrice là 1 chuỗi
  // nhiều sản phẩm nối bởi " | " theo đúng thứ tự (xem QuoteParser.gs), nên
  // cần tách ra để render thành từng dòng trong bảng, thay vì gộp 1 dòng text.
  const productBox = document.getElementById("update-modal-product-box");
  if (productBox) {
    if (row.productName || row.productParseStatus) {
      const rowsHtml = buildProductRowsHtml_(row);
      document.getElementById("update-modal-product-rows").innerHTML =
        rowsHtml ||
        '<tr><td colspan="4" class="text-muted">Chưa có dữ liệu sản phẩm — nhập tay hoặc bấm nút đọc lại file.</td></tr>';
      const totalNum = Number(row.productTotal) || 0;
      document.getElementById("update-modal-product-grand-total").textContent =
        totalNum ? formatVND(totalNum) : "—";
      document.getElementById("update-modal-product-status").textContent =
        row.productParseStatus || "";
      productBox.style.display = "block";
    } else {
      productBox.style.display = "none";
    }
  }

  updateModal().show();
}

// Tách 1 trường đã nối bởi " | " (xem QuoteParser.gs) thành mảng từng sản phẩm.
function splitJoinedField_(value) {
  return String(value || "")
    .split(" | ")
    .map(function (s) {
      return s.trim();
    });
}

// Ghép 4 trường productName/productStatus/productQty/productPrice (mỗi
// trường 1 chuỗi nối " | ") thành các dòng <tr> hiển thị trong modal chi
// tiết báo giá — 1 dòng cho mỗi sản phẩm, đúng thứ tự trong file gốc.
function buildProductRowsHtml_(row) {
  const names = splitJoinedField_(row.productName);
  const statuses = splitJoinedField_(row.productStatus);
  const qtys = splitJoinedField_(row.productQty);
  const prices = splitJoinedField_(row.productPrice);
  const count = names.filter(function (n) {
    return n;
  }).length;

  let html = "";
  for (let i = 0; i < count; i++) {
    const qtyNum = Number(qtys[i]) || 0;
    const priceNum = Number(prices[i]) || 0;
    html +=
      "<tr>" +
      "<td>" +
      escapeHtml_(names[i] || "") +
      "</td>" +
      "<td>" +
      escapeHtml_(statuses[i] || "") +
      "</td>" +
      '<td class="text-end">' +
      (qtyNum ? qtyNum.toLocaleString("vi-VN") : "") +
      "</td>" +
      '<td class="text-end">' +
      (priceNum ? formatVND(priceNum) : "") +
      "</td>" +
      "</tr>";
  }
  return html;
}

// Tránh lỗi hiển thị/HTML injection khi tên sản phẩm chứa ký tự đặc biệt.
function escapeHtml_(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

document
  .getElementById("btn-reparse-quote-file")
  .addEventListener("click", async () => {
    const projectId = document.querySelector(
      '#form-update-project [name="projectId"]',
    ).value;
    if (!projectId) return;
    showLoading(true);
    try {
      const res = await callApi("reparseProjectQuoteFile", { projectId });
      toast((res && res.message) || "Đã đọc lại file báo giá.");
      await reloadAll();
      openUpdateModal(projectId);
    } catch (err) {
      toast("Lỗi: " + err.message, "danger");
    } finally {
      showLoading(false);
    }
  });

// Gợi ý ngày follow up + đánh dấu ghi chú bắt buộc khi đổi trạng thái trong modal cập nhật.
const updateStatusSelect = document.getElementById("update-current-status");
const updateFinalStatusSelect = document.getElementById("update-final-status");
if (updateStatusSelect) {
  updateStatusSelect.addEventListener("change", () => {
    suggestFollowUpDate(
      updateStatusSelect.value,
      document.getElementById("update-next-followup"),
      document.getElementById("update-cadence-hint"),
    );
    const effectiveStatus =
      updateFinalStatusSelect.value || updateStatusSelect.value;
    applyReasonRequiredHint(
      effectiveStatus,
      document.getElementById("update-note-label"),
      document.getElementById("update-note"),
    );
  });
}
if (updateFinalStatusSelect) {
  updateFinalStatusSelect.addEventListener("change", () => {
    const effectiveStatus =
      updateFinalStatusSelect.value || updateStatusSelect.value;
    applyReasonRequiredHint(
      effectiveStatus,
      document.getElementById("update-note-label"),
      document.getElementById("update-note"),
    );
  });
}

document
  .getElementById("btn-mark-followup")
  .addEventListener("click", async () => {
    const projectId = document.querySelector(
      '#form-update-project [name="projectId"]',
    ).value;
    if (!projectId) return;

    const currentDateVal = document.getElementById(
      "update-next-followup",
    ).value;
    if (!confirmEarlyFollowUp(currentDateVal)) return;

    // Tự động dời "Ngày follow up tiếp theo" theo nhịp cố định của trạng thái đang chọn
    // (Đang báo giá +3 ngày, Đang đàm phán +5 ngày, Đã đặt cọc +3 ngày, mặc định +3 ngày).
    const statusVal = document.getElementById("update-current-status").value;
    const cadenceDays =
      ((FORM_OPTIONS && FORM_OPTIONS.followUpCadence) || {})[statusVal] || 3;
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + cadenceDays);
    const nextDateStr = nextDate.toISOString().slice(0, 10);

    showLoading(true);
    try {
      await callApi("markFollowUp", {
        projectId: projectId,
        nextFollowUpDate: nextDateStr,
        note: document.querySelector('#form-update-project [name="note"]')
          .value,
      });
      toast(
        "Đã ghi nhận follow up — tự động dời hẹn tiếp theo sang " +
        nextDateStr.split("-").reverse().join("/") +
        ".",
      );
      document.getElementById("update-next-followup").value = nextDateStr;
      document.getElementById("update-cadence-hint").textContent = "";
      await reloadAll();
      const count = document.getElementById("update-followup-count");
      count.textContent = Number(count.textContent) + 1;
    } catch (err) {
      toast("Lỗi: " + err.message, "danger");
    } finally {
      showLoading(false);
    }
  });

// Follow up nhanh 1-chạm ngay trong danh sách nhắc nhở, không cần mở modal.
async function quickFollowUp(projectId) {
  const row = ALL_PROJECTS.find((r) => r.quoteId === projectId);
  if (row && !confirmEarlyFollowUp(row.nextFollowUpDate)) return;

  const cadenceDays = row
    ? ((FORM_OPTIONS && FORM_OPTIONS.followUpCadence) || {})[
    row.currentStatus
    ] || 3
    : 3;
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + cadenceDays);
  const nextDateStr = nextDate.toISOString().slice(0, 10);

  showLoading(true);
  try {
    await callApi("markFollowUp", {
      projectId: projectId,
      nextFollowUpDate: nextDateStr,
    });
    toast(
      "Đã ghi nhận follow up — hẹn tiếp theo ngày " +
      nextDateStr.split("-").reverse().join("/") +
      ".",
    );
    await reloadAll();
  } catch (err) {
    toast("Lỗi: " + err.message, "danger");
  } finally {
    showLoading(false);
  }
}

document
  .getElementById("form-update-project")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const form = Object.fromEntries(formData.entries());

    // Nhóm khách hàng là multi-select — Object.fromEntries chỉ giữ giá trị
    // cuối cùng nên phải gom lại bằng getAll() giống form Thêm báo giá.
    const selectedSegments = formData.getAll("customerType2");
    form.customerType2 = selectedSegments.join(", ");

    const projectId = form.projectId;
    delete form.projectId;
    showLoading(true);
    try {
      await callApi("updateProject", { projectId: projectId, form: form });
      toast("Đã lưu thay đổi.");
      updateModal().hide();
      await reloadAll();
    } catch (err) {
      toast("Lỗi: " + err.message, "danger");
    } finally {
      showLoading(false);
    }
  });

document
  .getElementById("btn-delete-project")
  .addEventListener("click", async () => {
    const projectId = document.querySelector(
      '#form-update-project [name="projectId"]',
    ).value;
    if (!projectId) return;
    if (!confirm("Xoá báo giá này? Không thể hoàn tác.")) return;
    showLoading(true);
    try {
      await callApi("deleteProject", { projectId: projectId });
      toast("Đã xoá báo giá.");
      updateModal().hide();
      await reloadAll();
    } catch (err) {
      toast("Lỗi: " + err.message, "danger");
    } finally {
      showLoading(false);
    }
  });

// ============================================================
// TOM SELECT: SELECT SEARCH KHÁCH HÀNG CŨ
// ============================================================
let tomSelectInstance = null;

function initTomSelect() {
  const selectOld = document.getElementById("select-old-customer");
  if (!selectOld) return;

  if (tomSelectInstance) {
    tomSelectInstance.destroy();
  }

  // Nạp options vào select — HIỂN THỊ theo TÊN CÔNG TY trước (để gõ tìm
  // theo công ty), kèm tên khách hàng để phân biệt khi nhiều khách hàng
  // chung 1 công ty; khách không có tên công ty thì hiển thị luôn tên
  // khách hàng (fallback). GIÁ TRỊ (value) của option vẫn luôn là
  // customerName — đây là khoá duy nhất dùng để khớp với sheet "Customers",
  // không đổi để không phá logic tìm kiếm/validate ở nơi khác.
  selectOld.innerHTML =
    '<option value="">Chọn công ty / khách hàng...</option>';
  (ALL_CUSTOMERS || []).forEach((c) => {
    if (!c.customerName) return;
    const company = String(c.companyName || "").trim();
    const label = company ? company + " — " + c.customerName : c.customerName;
    const opt = document.createElement("option");
    opt.value = c.customerName;
    opt.textContent = label;
    selectOld.appendChild(opt);
  });

  const nameDisplayEl = document.getElementById("display-old-customer-name");
  if (nameDisplayEl && !nameDisplayEl.dataset.manualEditBound) {
    nameDisplayEl.dataset.manualEditBound = "1";
    nameDisplayEl.addEventListener("input", () => {
      delete nameDisplayEl.dataset.autoFilled;
    });
  }

  if (typeof TomSelect !== "undefined") {
    tomSelectInstance = new TomSelect("#select-old-customer", {
      create: true,          // Cho phép tự nhập tên mới nếu không có trong danh sách
      createOnBlur: true,    // Tự tạo option khi click ra ngoài
      createFilter: function (input) {
        // Chỉ cho tạo option mới khi nhập ít nhất 2 ký tự
        return input.length >= 2;
      },
      render: {
        // Tuỳ chỉnh giao diện gợi ý "Thêm mới" cho rõ ràng hơn
        option_create: function (data, escape) {
          return '<div class="create"><i class="ti ti-plus" style="margin-right:4px"></i> Thêm mới: <strong>' + escape(data.input) + '</strong></div>';
        },
        no_results: function () {
          return '<div class="no-results">Không tìm thấy — hãy gõ và chọn "Thêm mới"</div>';
        }
      },
      sortField: { field: "text", direction: "asc" },
      placeholder: "Gõ tìm công ty hoặc tên khách hàng (hoặc nhập mới)...",
    });

    // Tự động điền tên khách hàng (hiển thị) + SĐT/Email + Ghi chú quan
    // trọng của khách hàng (nếu có) khi chọn 1 công ty/khách hàng cũ.
    tomSelectInstance.on("change", (val) => {
      const found = ALL_CUSTOMERS.find(
        (c) =>
          String(c.customerName).trim().toLowerCase() ===
          String(val).trim().toLowerCase(),
      );
      const noteBox = document.getElementById("customer-note-box");
      const noteText = document.getElementById("customer-note-text");
      const nameHint = document.getElementById("old-customer-name-hint");
      const nameDisplay = document.getElementById("display-old-customer-name");
      if (found) {
        // ——— KHÁCH CŨ CÓ SẴN: tự fill tất cả ———
        const phoneInput = document.querySelector(
          '#form-add-project [name="customerPhone"]',
        );
        const emailInput = document.querySelector(
          '#form-add-project [name="customerEmail"]',
        );
        const companyInput = document.querySelector(
          '#form-add-project [name="companyName"]',
        );
        if (phoneInput) phoneInput.value = found.phone || "";
        if (emailInput) emailInput.value = found.email || "";
        if (companyInput) companyInput.value = found.companyName || "";
        if (nameDisplay) {
          nameDisplay.value = found.customerName;
          nameDisplay.setAttribute("readonly", "true");
        }
        if (nameEditHint) nameEditHint.style.display = "none";
        if (wrapperCompany) wrapperCompany.style.display = "none";
        // MST: hiển thị readonly, tự điền từ customerId
        if (wrapperTaxCode) wrapperTaxCode.style.display = "block";
        if (inputTaxCode) {
          inputTaxCode.value = found.customerId || "";
          inputTaxCode.setAttribute("readonly", "true");
          inputTaxCode.removeAttribute("required");
        }
        // Ẩn ô nhập ghi chú — hiển thị box ghi chú chỉ đọc (nếu có)
        if (wrapperCustomerNote) wrapperCustomerNote.style.display = "none";
        if (nameHint) {
          nameHint.textContent =
            "Tên khách hàng: " +
            found.customerName +
            (found.companyName
              ? ""
              : " (khách này chưa có tên công ty trong hệ thống)");
        }

        if (noteBox && noteText) {
          if (found.note && found.note.trim()) {
            noteText.textContent = found.note;
            noteBox.style.display = "block";
          } else {
            noteBox.style.display = "none";
          }
        }
      } else {
        // ——— KHÁCH CŨ MỚI (chưa có trong hệ thống): hiện toàn bộ ô nhập ———
        if (noteBox) noteBox.style.display = "none";
        const typedVal = String(val || "").trim();
        if (typedVal) {
          if (nameHint)
            nameHint.textContent =
              "Khách hàng mới (chưa có trong hệ thống): " + typedVal;
          // Tên khách hàng: bỏ readonly, cho sửa trực tiếp
          if (nameDisplay) {
            nameDisplay.removeAttribute("readonly");
            nameDisplay.value = typedVal;
          }
          if (nameEditHint) nameEditHint.style.display = "block";
          // Tên công ty: hiện để nhập
          if (wrapperCompany) wrapperCompany.style.display = "block";
          // SĐT / Email: hiện + xoá sạch dữ liệu cũ
          const phoneInputNew = document.querySelector('#form-add-project [name="customerPhone"]');
          const emailInputNew = document.querySelector('#form-add-project [name="customerEmail"]');
          if (phoneInputNew) phoneInputNew.value = "";
          if (emailInputNew) emailInputNew.value = "";
          // MST: hiện + bắt buộc nhập + bỏ readonly (nếu đang bị khóa từ khách cũ trước)
          if (wrapperTaxCode) wrapperTaxCode.style.display = "block";
          if (inputTaxCode) {
            inputTaxCode.removeAttribute("readonly");
            inputTaxCode.setAttribute("required", "true");
            inputTaxCode.value = "";
          }
          // Ghi chú: hiện ô nhập
          if (wrapperCustomerNote) wrapperCustomerNote.style.display = "block";
        } else {
          // Xoá trắng — TomSelect bị clear
          if (nameHint) nameHint.textContent = "";
          if (nameDisplay) {
            nameDisplay.removeAttribute("readonly");
            nameDisplay.value = "";
          }
          if (wrapperCompany) wrapperCompany.style.display = "none";
          if (nameEditHint) nameEditHint.style.display = "none";
          if (wrapperTaxCode) wrapperTaxCode.style.display = "none";
          if (inputTaxCode) {
            inputTaxCode.removeAttribute("readonly");
            inputTaxCode.removeAttribute("required");
            inputTaxCode.value = "";
          }
          if (wrapperCustomerNote) wrapperCustomerNote.style.display = "none";
        }
      }
    });
  }
}

// ============================================================
// TOM SELECT: MULTI-SELECT "NHÓM KHÁCH HÀNG" (Ở FORM THÊM BÁO GIÁ)
// ============================================================
let segmentTomSelect = null;

function initSegmentTomSelect() {
  const el = document.getElementById("select-customer-segment");
  if (!el || typeof TomSelect === "undefined") return;

  if (segmentTomSelect) {
    segmentTomSelect.destroy();
    segmentTomSelect = null;
  }

  segmentTomSelect = new TomSelect(el, {
    plugins: ["remove_button"],
    placeholder: "Chọn 1 hoặc nhiều nhóm khách hàng...",
    maxItems: null,
    sortField: { field: "text", direction: "asc" },
  });
}

// ============================================================
// TOM SELECT: MULTI-SELECT "NHÓM KHÁCH HÀNG" (Ở MODAL CẬP NHẬT BÁO GIÁ)
// ============================================================
let updateSegmentTomSelect = null;

function initUpdateSegmentTomSelect() {
  const el = document.getElementById("update-customer-segment");
  if (!el || typeof TomSelect === "undefined") return;

  if (updateSegmentTomSelect) {
    updateSegmentTomSelect.destroy();
    updateSegmentTomSelect = null;
  }

  updateSegmentTomSelect = new TomSelect(el, {
    plugins: ["remove_button"],
    placeholder: "Chọn 1 hoặc nhiều nhóm khách hàng...",
    maxItems: null,
    sortField: { field: "text", direction: "asc" },
  });
}

// Xử lý giao diện chọn Khách cũ / Khách mới
const customerTypeSelect = document.getElementById("select-customer-type");
const wrapperOld = document.getElementById("wrapper-customer-old");
const wrapperNew = document.getElementById("wrapper-customer-new");
const inputNew = document.getElementById("input-customer-new");
const wrapperTaxCode = document.getElementById("wrapper-customer-taxcode");
const inputTaxCode = document.getElementById("input-customer-taxcode");
const wrapperCustomerNote = document.getElementById("wrapper-customer-note");
const customerNoteBox = document.getElementById("customer-note-box");
const wrapperCompany = document.getElementById("wrapper-customer-company");
const wrapperOldName = document.getElementById("wrapper-customer-old-name");
const displayOldCustomerName = document.getElementById(
  "display-old-customer-name",
);
const nameEditHint = document.getElementById("old-customer-name-editable-hint");
if (customerTypeSelect && wrapperOld && wrapperNew) {
  customerTypeSelect.addEventListener("change", () => {
    if (customerTypeSelect.value === "Khách cũ") {
      wrapperOld.style.display = "block";
      wrapperNew.style.display = "none";
      inputNew.removeAttribute("required");
      if (wrapperTaxCode) wrapperTaxCode.style.display = "none";
      if (inputTaxCode) {
        inputTaxCode.removeAttribute("readonly");
        inputTaxCode.removeAttribute("required");
        inputTaxCode.value = "";
      }
      if (wrapperCustomerNote) wrapperCustomerNote.style.display = "none";
      if (wrapperCompany) wrapperCompany.style.display = "none";
      if (wrapperOldName) wrapperOldName.style.display = "block";
      if (!tomSelectInstance) initTomSelect();

      // Xoá sđt/email/công ty/tên đang hiện (nếu còn sót từ lần chọn "Khách
      // mới" trước đó) — chờ chọn công ty/khách hàng cũ từ danh sách rồi
      // TomSelect sẽ tự điền lại đúng dữ liệu.
      document.querySelector('#form-add-project [name="customerPhone"]').value =
        "";
      document.querySelector('#form-add-project [name="customerEmail"]').value =
        "";
      const companyInputReset2 = document.querySelector(
        '#form-add-project [name="companyName"]',
      );
      if (companyInputReset2) companyInputReset2.value = "";
      if (displayOldCustomerName) {
        displayOldCustomerName.value = "";
        displayOldCustomerName.setAttribute("readonly", "true");
      }
      if (nameEditHint) nameEditHint.style.display = "none";
      const nameHintReset = document.getElementById("old-customer-name-hint");
      if (nameHintReset) nameHintReset.textContent = "";
      if (tomSelectInstance) tomSelectInstance.clear(true);
    } else {
      wrapperOld.style.display = "none";
      wrapperNew.style.display = "block";
      inputNew.setAttribute("required", "true");
      if (wrapperTaxCode) wrapperTaxCode.style.display = "block";
      if (inputTaxCode) {
        inputTaxCode.removeAttribute("readonly");
        inputTaxCode.setAttribute("required", "true");
      }
      if (wrapperCustomerNote) wrapperCustomerNote.style.display = "block";
      if (customerNoteBox) customerNoteBox.style.display = "none";
      if (wrapperCompany) wrapperCompany.style.display = "block";
      if (wrapperOldName) wrapperOldName.style.display = "none";
      if (displayOldCustomerName) displayOldCustomerName.value = "";
      // Xoá sđt/email/công ty cũ nếu chuyển sang khách mới
      document.querySelector('#form-add-project [name="customerPhone"]').value =
        "";
      document.querySelector('#form-add-project [name="customerEmail"]').value =
        "";
      const companyInputReset = document.querySelector(
        '#form-add-project [name="companyName"]',
      );
      if (companyInputReset) companyInputReset.value = "";
    }
  });
}
