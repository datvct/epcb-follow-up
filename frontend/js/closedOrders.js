// CLOSED-ORDERS.JS
// Tab Đơn hàng đã chốt — hiển thị và lọc các báo giá có finalStatus là
// "Đã mua hàng" hoặc "Đã đặt cọc", với thống kê tổng hợp và bảng chi tiết.

// So sánh mềm: trim + lowercase để không bị ảnh hưởng khoảng trắng thừa từ Sheet
function isClosedStatus(finalStatus) {
  const s = String(finalStatus || '').trim().toLowerCase();
  return s === 'đã mua hàng' || s === 'đã đặt cọc';
}
function isPurchased(finalStatus) {
  return String(finalStatus || '').trim().toLowerCase() === 'đã mua hàng';
}
function isDeposited(finalStatus) {
  return String(finalStatus || '').trim().toLowerCase() === 'đã đặt cọc';
}

let _closedPeriod = 'all';
let _closedSalesFilter = '';

// ============================================================
// KHỞI TẠO BỘ LỌC
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Segmented control lọc thời gian
  const periodSwitch = document.getElementById('closed-period-switch');
  if (periodSwitch) {
    periodSwitch.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      periodSwitch.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      _closedPeriod = btn.dataset.period;
      renderClosedOrders();
    });
  }

  // Dropdown lọc theo Sales
  const salesSelect = document.getElementById('closed-filter-sales');
  if (salesSelect) {
    salesSelect.addEventListener('change', () => {
      _closedSalesFilter = salesSelect.value;
      renderClosedOrders();
    });
  }
});

// Điền danh sách sales vào dropdown lọc (gọi sau khi FORM_OPTIONS có sẵn)
function populateClosedSalesFilter() {
  const select = document.getElementById('closed-filter-sales');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">Tất cả Sales</option>';
  const sales = (typeof FORM_OPTIONS !== 'undefined' && FORM_OPTIONS && FORM_OPTIONS.sales) ? FORM_OPTIONS.sales : [];
  sales.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
  // Khôi phục lựa chọn cũ nếu vẫn còn trong list
  if (currentVal) select.value = currentVal;
}

// ============================================================
// LỌC DỮ LIỆU
// ============================================================
function getClosedOrdersFiltered() {
  const allProjects = (typeof ALL_PROJECTS !== 'undefined' ? ALL_PROJECTS : []) || [];

  let list = allProjects.filter((r) => isClosedStatus(r.finalStatus));

  // Lọc theo sales
  if (_closedSalesFilter) {
    list = list.filter((r) => String(r.sales || '').trim() === _closedSalesFilter);
  }

  // Lọc theo thời gian (dựa vào updatedAt nếu có, fallback về quoteDate)
  if (_closedPeriod !== 'all') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (_closedPeriod === 'week') {
      const dow = today.getDay(); // 0=CN, 1=T2...
      const diff = (dow === 0) ? -6 : 1 - dow;
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() + diff);
      list = list.filter((r) => {
        const d = new Date(r.quoteDate || r.updatedAt || r.createdAt);
        return !isNaN(d) && d >= startOfWeek && d <= now;
      });
    } else if (_closedPeriod === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      list = list.filter((r) => {
        const d = new Date(r.quoteDate || r.updatedAt || r.createdAt);
        return !isNaN(d) && d >= startOfMonth && d <= now;
      });
    }
  }

  // Sắp xếp: mới nhất lên đầu
  return list.sort((a, b) => {
    const da = new Date(a.quoteDate || a.updatedAt || 0);
    const db = new Date(b.quoteDate || b.updatedAt || 0);
    return db - da;
  });
}

// ============================================================
// RENDER CHÍNH
// ============================================================
function renderClosedOrders() {
  // Điền dropdown sales
  populateClosedSalesFilter();

  const allProjects = (typeof ALL_PROJECTS !== 'undefined' ? ALL_PROJECTS : []) || [];
  const list = getClosedOrdersFiltered();

  // --- Thẻ thống kê ---
  const purchasedList = list.filter((r) => isPurchased(r.finalStatus));
  const depositedList = list.filter((r) => isDeposited(r.finalStatus));
  const revenue      = purchasedList.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const depositRev   = depositedList.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalRevenue = revenue + depositRev;

  // Tỷ lệ chốt = đơn chốt / tổng báo giá (áp bộ lọc Sales nếu có)
  let projectsForRate = allProjects;
  if (_closedSalesFilter) {
    projectsForRate = projectsForRate.filter((r) => String(r.sales || '').trim() === _closedSalesFilter);
  }
  const closedForRate = projectsForRate.filter((r) => isClosedStatus(r.finalStatus)).length;
  const closingRate   = projectsForRate.length > 0 ? Math.round((closedForRate / projectsForRate.length) * 100) : 0;

  const elCount   = document.getElementById('closed-stat-count');
  const elRevenue = document.getElementById('closed-stat-revenue');
  const elDeposit = document.getElementById('closed-stat-deposit');
  const elRate    = document.getElementById('closed-stat-rate');
  const elTotal   = document.getElementById('closed-stat-total');

  if (elCount)   elCount.textContent   = list.length + ' đơn';
  if (elRevenue) elRevenue.textContent = formatVND(revenue);
  if (elDeposit) elDeposit.textContent = formatVND(depositRev);
  if (elTotal)   elTotal.textContent   = formatVND(totalRevenue);
  if (elRate) {
    elRate.textContent = closingRate + '%';
    elRate.style.color = closingRate >= 30 ? '#0f6e56' : '#f59e0b';
  }

  // Nhãn đếm trên bảng
  const countLabel = document.getElementById('closed-count-label');
  if (countLabel) countLabel.textContent = list.length + ' đơn';

  // Biểu đồ
  renderClosedBreakdownChart(list);
  renderClosedTrendChart();

  // Bảng chi tiết theo sales
  renderClosedBySalesPanel(allProjects);

  // Bảng chi tiết từng đơn
  renderClosedTable(list);
}

// ============================================================
// BẢNG TỔNG HỢP THEO SALES
// ============================================================
function renderClosedBySalesPanel(allProjects) {
  const box = document.getElementById('closed-by-sales-box');
  if (!box) return;

  // Nhóm toàn bộ đơn chốt theo sales (không áp bộ lọc)
  const allClosed = allProjects.filter((r) => isClosedStatus(r.finalStatus));
  const map = {};
  allClosed.forEach((r) => {
    const s = String(r.sales || 'Chưa phân công').trim();
    if (!map[s]) map[s] = { count: 0, revenue: 0, deposit: 0, total: 0 };
    map[s].count++;
    const amt = Number(r.amount) || 0;
    if (isPurchased(r.finalStatus)) map[s].revenue += amt;
    else map[s].deposit += amt;
    map[s].total += amt;
  });

  const rows = Object.entries(map).sort((a, b) => b[1].total - a[1].total);

  if (!rows.length) {
    box.innerHTML = '<div class="text-muted small text-center py-3">Chưa có dữ liệu.</div>';
    return;
  }

  const allTotal = rows.reduce((s, [, v]) => s + v.total, 0);
  const allCount = rows.reduce((s, [, v]) => s + v.count, 0);

  box.innerHTML = rows.map(([name, v]) => {
    const pct = allTotal > 0 ? Math.round((v.total / allTotal) * 100) : 0;
    return `
      <div class="report-row" style="flex-direction:column; align-items:stretch; gap:6px;">
        <div class="d-flex justify-content-between align-items-center">
          <div class="fw-semibold">${name}</div>
          <div class="text-end">
            <div class="fw-semibold text-success">${formatVND(v.total)}</div>
            <div class="text-muted small">${v.count} đơn</div>
          </div>
        </div>
        <div style="height:6px; border-radius:99px; background:#e5e7eb; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background: linear-gradient(90deg,#0f6e56,#2bba9a); border-radius:99px; transition:width .4s;"></div>
        </div>
        <div class="d-flex gap-3 text-muted small">
          <span>Mua hàng: <strong>${formatVND(v.revenue)}</strong></span>
          <span>Đặt cọc: <strong>${formatVND(v.deposit)}</strong></span>
        </div>
      </div>`;
  }).join('') + `
    <div class="report-row mt-2" style="border-top: 2px solid var(--border, #e5e7eb); padding-top:12px;">
      <div class="fw-bold">Tổng cộng</div>
      <div class="text-end">
        <div class="fw-bold text-success">${formatVND(allTotal)}</div>
        <div class="text-muted small">${allCount} đơn</div>
      </div>
    </div>`;
}

// ============================================================
// BẢNG CHI TIẾT TỪNG ĐƠN
// ============================================================
function renderClosedTable(list) {
  const tbody = document.getElementById('closed-orders-tbody');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Không có đơn nào khớp bộ lọc.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((r, idx) => {
    const badgeClass = isPurchased(r.finalStatus) ? 'badge-purchased' : 'badge-deposited';
    const noteDisplay = r.note
      ? String(r.note).slice(0, 80) + (String(r.note).length > 80 ? '…' : '')
      : '<span class="text-muted">—</span>';
    const dateDisplay = r.quoteDate
      ? (() => { const d = new Date(r.quoteDate); return isNaN(d) ? r.quoteDate : d.toLocaleDateString('vi-VN'); })()
      : '—';

    return `
      <tr style="cursor:pointer" onclick="openUpdateModal('${r.quoteId}')" title="Nhấn để xem / sửa đơn này">
        <td class="text-muted small text-center">${idx + 1}</td>
        <td>
          <div class="fw-semibold">${r.customerName || '—'}</div>
          <div class="text-muted small">${r.customerType || ''}</div>
        </td>
        <td>${r.sales || '—'}</td>
        <td class="text-end fw-semibold text-success">${formatVND(r.amount)}</td>
        <td><span class="status-badge ${badgeClass}">${r.finalStatus}</span></td>
        <td class="text-muted small">${dateDisplay}</td>
        <td class="small">${noteDisplay}</td>
      </tr>`;
  }).join('');
}

// ============================================================
// BIỂU ĐỒ 1: TỶ TRỌNG ĐƠN CHỐT (theo bộ lọc đang chọn)
// ============================================================
let closedBreakdownChart = null;

function renderClosedBreakdownChart(list) {
  const canvas = document.getElementById('chart-closed-breakdown');
  if (!canvas || typeof Chart === 'undefined') return;

  const purchasedCount = list.filter((r) => isPurchased(r.finalStatus)).length;
  const depositedCount = list.filter((r) => isDeposited(r.finalStatus)).length;

  if (closedBreakdownChart) { closedBreakdownChart.destroy(); closedBreakdownChart = null; }

  if (purchasedCount === 0 && depositedCount === 0) return;

  closedBreakdownChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Đã mua hàng', 'Đã đặt cọc'],
      datasets: [{
        data: [purchasedCount, depositedCount],
        backgroundColor: ['#0f6e56', '#f28500'],
        borderWidth: 0
      }]
    },
    options: {
      cutout: '62%',
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, padding: 14 } } }
    }
  });
}

// ============================================================
// BIỂU ĐỒ 2: XU HƯỚNG ĐƠN CHỐT THEO THÁNG (8 tháng gần nhất)
// ============================================================
let closedTrendChart = null;

function renderClosedTrendChart() {
  const canvas = document.getElementById('chart-closed-trend');
  if (!canvas || typeof Chart === 'undefined') return;

  const allProjects = (typeof ALL_PROJECTS !== 'undefined' ? ALL_PROJECTS : []) || [];
  let closed = allProjects.filter((r) => isClosedStatus(r.finalStatus));
  if (_closedSalesFilter) closed = closed.filter((r) => String(r.sales || '').trim() === _closedSalesFilter);

  const buckets = {};
  closed.forEach((r) => {
    const dateStr = r.quoteDate || r.updatedAt || r.createdAt;
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (isNaN(d)) return;
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!buckets[key]) buckets[key] = { purchased: 0, deposited: 0, revenue: 0 };
    if (isPurchased(r.finalStatus))  { buckets[key].purchased++; }
    else if (isDeposited(r.finalStatus)) { buckets[key].deposited++; }
    buckets[key].revenue += Number(r.amount) || 0;
  });

  const months = Object.keys(buckets).sort().slice(-8);

  if (closedTrendChart) { closedTrendChart.destroy(); closedTrendChart = null; }
  if (!months.length) return;

  closedTrendChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Đã mua hàng',
          data: months.map((m) => buckets[m].purchased),
          backgroundColor: '#0f6e56',
          borderRadius: 4,
          stack: 'closed'
        },
        {
          label: 'Đã đặt cọc',
          data: months.map((m) => buckets[m].deposited),
          backgroundColor: '#f28500',
          borderRadius: 4,
          stack: 'closed'
        }
      ]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
}
