// DASHBOARD.JS
let statusChart = null;
let trendChart = null;

let CURRENT_PERIOD = 'week';     // 'today' | 'week' | 'month' | 'all'
let REMINDER_FILTER = 'urgent';  // 'urgent' | 'all'
let _lastNotifiedOverdueCount = null;

const FOLLOWUP_WARNING_DAYS = 2; // phải khớp FOLLOWUP_WARNING_DAYS trong backend/Config.gs

// ============================================================
// TÍNH TOÁN NHẮC NHỞ FOLLOW UP (client-side, không tốn API riêng)
// ============================================================
function computeReminders(rows) {
  const today = startOfDay_(new Date());
  return rows
    .filter(function (r) { return !r.finalStatus; })
    .map(function (r) {
      const dueDate = r.nextFollowUpDate ? new Date(r.nextFollowUpDate) : null;
      let urgency = 'normal';
      let daysLeft = null;
      if (dueDate) {
        daysLeft = Math.round((startOfDay_(dueDate) - today) / 86400000);
        if (daysLeft < 0) urgency = 'overdue';
        else if (daysLeft <= FOLLOWUP_WARNING_DAYS) urgency = 'soon';
      }
      return Object.assign({}, r, { daysLeft: daysLeft, urgency: urgency });
    })
    .sort(function (a, b) {
      const da = a.daysLeft === null ? 9999 : a.daysLeft;
      const db = b.daysLeft === null ? 9999 : b.daysLeft;
      return da - db;
    });
}

// ============================================================
// VẼ LẠI TOÀN BỘ DASHBOARD DỰA TRÊN ALL_PROJECTS (js/projects.js)
// ============================================================
function refreshDashboard() {
  const filtered = filterByPeriod(ALL_PROJECTS, CURRENT_PERIOD);
  const kpis = computeKPIs(filtered);

  document.getElementById('kpi-total').textContent = formatVND(kpis.totalOpportunity);
  document.getElementById('kpi-expected').textContent = formatVND(kpis.expectedRevenue);
  document.getElementById('kpi-closed').textContent = formatVND(kpis.closedRevenue);
  document.getElementById('kpi-rate').textContent = formatPercent(kpis.closingRate);
  document.getElementById('period-range-label').textContent = describePeriod(CURRENT_PERIOD);

  renderStatusChart(kpis.statusCount);
  renderTrendChart();
  renderReminders();
  renderHotList();
  renderDataQuality();
}

// ============================================================
// KHÁCH HÀNG HOT — Chờ đặt cọc / Chờ thanh toán, ưu tiên chăm sóc trước (mục 3.2 docx)
// ============================================================
const HOT_STATUSES_CLIENT = ['Chờ thanh toán', 'Chờ đặt cọc'];

function renderHotList() {
  const box = document.getElementById('hot-list');
  if (!box) return;
  const hotStatuses = (FORM_OPTIONS && FORM_OPTIONS.hotStatuses) || HOT_STATUSES_CLIENT;
  const rows = ALL_PROJECTS
    .filter(function (r) { return !r.finalStatus && hotStatuses.indexOf(r.currentStatus) !== -1; })
    .sort(function (a, b) { return (Number(b.amount) || 0) - (Number(a.amount) || 0); });

  document.getElementById('hot-count-badge').textContent = rows.length;
  if (!rows.length) {
    box.innerHTML = '<div class="reminder-empty"><i class="ti ti-flame"></i><br>Chưa có khách hàng Hot nào đang theo dõi.</div>';
    return;
  }
  box.innerHTML = rows.map(function (r) {
    return `
      <div class="reminder-item soon" onclick="openUpdateModal('${r.quoteId}')">
        <div>
          <div class="name">${r.customerName}</div>
          <div class="meta">${r.sales || ''} · ${r.currentStatus || ''} · ${formatVND(r.amount)}</div>
          <div class="meta"><i class="ti ti-phone-outgoing"></i> ${r.followUp || 0} lần</div>
        </div>
        <div class="reminder-actions">
          <span class="reminder-badge normal">${formatPercent(r.probability)}</span>
        </div>
      </div>`;
  }).join('');
}

// ============================================================
// THIẾU DỮ LIỆU BẮT BUỘC — Sales / Ngày follow up / Nhóm khách hàng (mục 3.4 docx)
// ============================================================
function renderDataQuality() {
  const box = document.getElementById('dq-list');
  if (!box) return;
  const rows = ALL_PROJECTS.filter(function (r) {
    if (r.finalStatus) return false; // đã kết thúc thì không tính thiếu follow up
    const missingSales = !String(r.sales || '').trim();
    const missingFollowUp = !String(r.nextFollowUpDate || '').trim();
    const missingSegment = !String(r.customerType2 || '').trim();
    return missingSales || missingFollowUp || missingSegment;
  });

  document.getElementById('dq-count-badge').textContent = rows.length;
  if (!rows.length) {
    box.innerHTML = '<div class="reminder-empty"><i class="ti ti-checks"></i><br>Không có báo giá nào thiếu trường bắt buộc 🎉</div>';
    return;
  }
  box.innerHTML = rows.map(function (r) {
    const missing = [];
    if (!String(r.sales || '').trim()) missing.push('Sales');
    if (!String(r.nextFollowUpDate || '').trim()) missing.push('Ngày follow up');
    if (!String(r.customerType2 || '').trim()) missing.push('Nhóm khách hàng');
    return `
      <div class="reminder-item overdue" onclick="openUpdateModal('${r.quoteId}')">
        <div>
          <div class="name">${r.customerName}</div>
          <div class="meta">Thiếu: ${missing.join(', ')}</div>
        </div>
      </div>`;
  }).join('');
}

function renderReminders() {
  const all = computeReminders(ALL_PROJECTS);
  const urgentOnly = all.filter(function (r) { return r.urgency === 'overdue' || r.urgency === 'soon'; });

  document.getElementById('reminder-count-badge').textContent = urgentOnly.length;
  updateNotifBadge(urgentOnly.length);
  maybeNotify(urgentOnly);

  const rows = REMINDER_FILTER === 'urgent' ? urgentOnly : all;
  const box = document.getElementById('reminder-list');
  if (!rows.length) {
    box.innerHTML = '<div class="reminder-empty"><i class="ti ti-confetti"></i><br>' +
      (REMINDER_FILTER === 'urgent' ? 'Không có báo giá nào sắp tới hạn follow up 🎉' : 'Chưa có báo giá nào đang theo dõi.') +
      '</div>';
    return;
  }
  box.innerHTML = rows.map(function (r) {
    const label = r.urgency === 'overdue'
      ? 'Quá hạn ' + Math.abs(r.daysLeft) + ' ngày'
      : (r.urgency === 'soon' ? (r.daysLeft === 0 ? 'Hôm nay' : 'Còn ' + r.daysLeft + ' ngày') : (r.nextFollowUpDate ? r.nextFollowUpDate : 'Chưa hẹn'));
    
    const isLink = r.productFile && (r.productFile.startsWith('http://') || r.productFile.startsWith('https://'));
    const fileLinkHtml = isLink 
      ? `<a href="${r.productFile}" target="_blank" onclick="event.stopPropagation()" class="btn-view-file ms-2 d-inline-flex align-items-center" title="Xem file báo giá (Link Drive)"><i class="ti ti-brand-google-drive text-accent" style="font-size: 1.1rem;"></i></a>` 
      : '';

    return `
      <div class="reminder-item ${r.urgency}" onclick="openUpdateModal('${r.quoteId}')">
        <div>
          <div class="name d-flex align-items-center flex-wrap">
            <i class="ti ti-building text-muted me-1"></i>${r.customerName || '—'}
            ${fileLinkHtml}
          </div>
          <div class="meta d-flex align-items-center flex-wrap gap-1">
            <span class="d-inline-flex align-items-center gap-1"><i class="ti ti-user"></i><b>${r.customerContactName || '—'}</b></span>
          </div>
          <div class="meta">${r.sales || ''} · ${r.currentStatus || ''} · ${formatVND(r.amount)}</div>
          <div class="meta"><i class="ti ti-phone-outgoing"></i> ${r.followUp || 0} lần</div>
        </div>
        <div class="reminder-actions">
          <span class="reminder-badge ${r.urgency}">${label}</span>
          <button type="button" class="btn-quick-followup" title="Đã follow up (+1)" onclick="event.stopPropagation(); quickFollowUp('${r.quoteId}')">
            <i class="ti ti-phone-outgoing"></i>
          </button>
        </div>
      </div>`;
  }).join('');
}

function updateNotifBadge(count) {
  const badge = document.getElementById('notif-badge');
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove('d-none');
  } else {
    badge.classList.add('d-none');
  }
}

// Gửi thông báo trình duyệt (Notification API) khi số lượng "quá hạn/sắp tới hạn"
// tăng so với lần kiểm tra gần nhất trong phiên làm việc này.
function maybeNotify(urgentRows) {
  const overdue = urgentRows.filter(function (r) { return r.urgency === 'overdue'; });
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (overdue.length === 0) { _lastNotifiedOverdueCount = 0; return; }
  if (_lastNotifiedOverdueCount !== null && overdue.length <= _lastNotifiedOverdueCount) return;

  _lastNotifiedOverdueCount = overdue.length;
  try {
    const n = new Notification('Nhắc follow up báo giá', {
      body: overdue.length + ' báo giá đã quá hạn follow up. Bấm để xem chi tiết.',
      tag: 'quote-followup-reminder'
    });
    n.onclick = function () {
      window.focus();
      switchToTab('dashboard');
      n.close();
    };
  } catch (e) { /* trình duyệt chặn — bỏ qua, badge trong app vẫn hiển thị */ }
}

function requestNotificationPermissionOnce() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function renderStatusChart(statusCount) {
  const labels = Object.keys(statusCount);
  const values = Object.values(statusCount);
  if (statusChart) statusChart.destroy();
  statusChart = new Chart(document.getElementById('chart-status'), {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: ['#3457a6', '#4c6b2c', '#c98a1f', '#1e6b82', '#0f6e56', '#c0392b', '#8a8f87'],
        borderWidth: 0
      }]
    },
    options: {
      cutout: '62%',
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, padding: 14 } } }
    }
  });
}

function renderTrendChart() {
  let groups, unitLabel, bucketCount;
  if (CURRENT_PERIOD === 'today') {
    groups = groupByDay(ALL_PROJECTS);
    unitLabel = 'Ngày (14 ngày gần nhất)';
    bucketCount = 14;
  } else if (CURRENT_PERIOD === 'week') {
    groups = groupByWeek(ALL_PROJECTS);
    unitLabel = 'Tuần (12 tuần gần nhất)';
    bucketCount = 12;
  } else {
    groups = groupByMonth(ALL_PROJECTS);
    unitLabel = 'Tháng (12 tháng gần nhất)';
    bucketCount = 12;
  }
  const buckets = lastBuckets(groups, bucketCount);
  document.getElementById('trend-unit-label').textContent = unitLabel;

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(document.getElementById('chart-trend'), {
    type: 'bar',
    data: {
      labels: buckets.map(function (b) { return b.label; }),
      datasets: [
        { label: 'Doanh thu kỳ vọng', data: buckets.map(function (b) { return b.expectedRevenue; }), backgroundColor: '#0f6e56', borderRadius: 6 },
        { label: 'Doanh thu đã chốt', data: buckets.map(function (b) { return b.closedRevenue; }), backgroundColor: '#c98a1f', borderRadius: 6 }
      ]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { ticks: { callback: function (v) { return formatVND(v); } } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ============================================================
// BỘ CHUYỂN "Xem theo Ngày / Tuần / Tháng / Tất cả"
// ============================================================
document.getElementById('period-switch').addEventListener('click', function (e) {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  document.querySelectorAll('#period-switch .seg-btn').forEach(function (b) { b.classList.remove('active'); });
  btn.classList.add('active');
  CURRENT_PERIOD = btn.dataset.period;
  refreshDashboard();
});

document.getElementById('reminder-tabs').addEventListener('click', function (e) {
  const btn = e.target.closest('.rtab');
  if (!btn) return;
  document.querySelectorAll('#reminder-tabs .rtab').forEach(function (b) { b.classList.remove('active'); });
  btn.classList.add('active');
  REMINDER_FILTER = btn.dataset.filter;
  renderReminders();
});
