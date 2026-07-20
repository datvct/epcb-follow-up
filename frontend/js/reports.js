// REPORTS.JS
let reportChart = null;
let CURRENT_REPORT = 'sales'; // 'sales' | 'customer' | 'day' | 'week' | 'month'

const REPORT_TITLES = {
  sales: '<i class="ti ti-users"></i> Theo sales phụ trách',
  customer: '<i class="ti ti-building"></i> Theo Khách hàng / Công ty',
  day: '<i class="ti ti-calendar-event"></i> Theo ngày báo giá',
  week: '<i class="ti ti-calendar-week"></i> Theo tuần',
  month: '<i class="ti ti-calendar"></i> Theo tháng'
};

function loadReports() {
  renderCurrentReport();
}

function getReportGroups() {
  if (CURRENT_REPORT === 'sales') return groupBySales(ALL_PROJECTS);
  if (CURRENT_REPORT === 'customer') {
    // Sắp xếp các khách hàng có doanh thu đã chốt lớn nhất lên đầu
    return groupByCustomer(ALL_PROJECTS).sort((a, b) => b.closedRevenue - a.closedRevenue);
  }
  if (CURRENT_REPORT === 'day') return lastBuckets(groupByDay(ALL_PROJECTS), 30);
  if (CURRENT_REPORT === 'week') return lastBuckets(groupByWeek(ALL_PROJECTS), 12);
  return lastBuckets(groupByMonth(ALL_PROJECTS), 12);
}

function renderCurrentReport() {
  document.getElementById('report-list-title').innerHTML = REPORT_TITLES[CURRENT_REPORT];
  const groups = getReportGroups();
  renderReportList(groups);
  renderReportChart(groups);
}

function renderReportList(rows) {
  const box = document.getElementById('report-list-box');
  if (!rows.length) { box.innerHTML = '<div class="text-muted small">Chưa có dữ liệu.</div>'; return; }
  
  if (CURRENT_REPORT === 'customer') {
    // Tạo bản đồ tra cứu thông tin liên hệ của khách hàng từ danh sách ALL_CUSTOMERS
    const contactMap = {};
    if (window.ALL_CUSTOMERS) {
      ALL_CUSTOMERS.forEach((c) => {
        contactMap[String(c.customerName).trim().toLowerCase()] = { phone: c.phone, email: c.email };
      });
    }

    box.innerHTML = rows.map((r) => {
      const cleanName = String(r.label).trim().toLowerCase();
      const contact = contactMap[cleanName] || { phone: '', email: '' };
      const contactStr = [contact.phone, contact.email].filter(Boolean).join(' · ');

      return `
        <div class="report-row">
          <div>
            <div class="label">${r.label}</div>
            <div class="sub text-muted small" style="font-size: 0.76rem; margin-top: 2px;">${contactStr || 'Chưa cập nhật thông tin liên hệ'}</div>
            <div class="sub" style="font-size: 0.76rem; color: var(--muted); margin-top: 4px;">Tổng cộng: ${r.totalQuotes} cơ hội</div>
          </div>
          <div class="text-end">
            <div class="fw-semibold text-success">Đã chốt: ${formatVND(r.closedRevenue)}</div>
            <div class="sub" style="font-size: 0.76rem; color: var(--muted); margin-top: 4px;">Kỳ vọng: ${formatVND(r.expectedRevenue)}</div>
          </div>
        </div>`;
    }).join('');
    return;
  }

  const display = CURRENT_REPORT === 'sales' ? rows : rows.slice().reverse();
  box.innerHTML = display.map((r) => `
    <div class="report-row">
      <div>
        <div class="label">${r.label}</div>
        <div class="sub">${r.totalQuotes} báo giá</div>
      </div>
      <div class="text-end">
        <div>${formatVND(r.expectedRevenue)}</div>
        <div class="sub">Đã chốt: ${formatVND(r.closedRevenue)}</div>
      </div>
    </div>`).join('');
}

function renderReportChart(rows) {
  if (reportChart) reportChart.destroy();
  
  // Tránh vẽ quá nhiều cột gây vỡ biểu đồ, nếu là khách hàng chỉ hiển thị Top 8
  let chartData = rows;
  if (CURRENT_REPORT === 'customer') {
    chartData = rows.slice(0, 8);
  }

  reportChart = new Chart(document.getElementById('chart-report'), {
    type: 'bar',
    data: {
      labels: chartData.map((r) => r.label),
      datasets: [
        { label: 'Doanh thu kỳ vọng', data: chartData.map((r) => r.expectedRevenue), backgroundColor: '#008080', borderRadius: 6 },
        { label: 'Doanh thu đã chốt', data: chartData.map((r) => r.closedRevenue), backgroundColor: '#f28500', borderRadius: 6 }
      ]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { ticks: { callback: (v) => formatVND(v) } },
        x: { ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 }, grid: { display: false } }
      }
    }
  });
}

document.getElementById('report-switch').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  document.querySelectorAll('#report-switch .seg-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  CURRENT_REPORT = btn.dataset.report;
  renderCurrentReport();
});

// ============================================================
// BIỂU ĐỒ: HOẠT ĐỘNG BÁO GIÁ THEO SALES & THỜI GIAN
// ============================================================
let salesTimelineChart = null;
let CURRENT_TIMELINE_GRANULARITY = 'week'; // 'day' | 'week' | 'month'

// Palette màu phân biệt cho từng sales (tối đa 12 người)
const SALES_PALETTE = [
  '#0f6e56', '#f28500', '#3b82f6', '#a855f7',
  '#ef4444', '#06b6d4', '#84cc16', '#f59e0b',
  '#ec4899', '#6366f1', '#14b8a6', '#f97316'
];

// Tạo key thời gian cho từng báo giá theo granularity đang chọn
function getTimeKey_(r, granularity) {
  const raw = r.quoteDate || r.updatedAt || r.createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d)) return null;
  if (granularity === 'day') {
    return d.toISOString().slice(0, 10); // yyyy-MM-dd
  }
  if (granularity === 'month') {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); // yyyy-MM
  }
  // week: dùng trường r.week đã tính sẵn bởi backend ("yyyy-MM - Tuần n")
  return r.week || d.toISOString().slice(0, 10);
}

// Giới hạn số bucket hiển thị để tránh vỡ biểu đồ
function getMaxBuckets_(granularity) {
  if (granularity === 'day')   return 30;
  if (granularity === 'week')  return 16;
  return 12;
}

function buildSalesTimelineData(granularity) {
  const projects = (typeof ALL_PROJECTS !== 'undefined' ? ALL_PROJECTS : []) || [];
  const options  = (typeof FORM_OPTIONS !== 'undefined' && FORM_OPTIONS && FORM_OPTIONS.sales) ? FORM_OPTIONS.sales : [];

  // Lấy tất cả sales xuất hiện trong dữ liệu (bổ sung thêm từ FORM_OPTIONS)
  const salesSet = new Set(options);
  projects.forEach((r) => { if (r.sales) salesSet.add(String(r.sales).trim()); });
  const salesList = [...salesSet].filter(Boolean).sort();

  // Gom dữ liệu: { timeKey -> { salesName -> { count, expectedRevenue } } }
  const buckets = {};
  projects.forEach((r) => {
    const key   = getTimeKey_(r, granularity);
    const sales = String(r.sales || '').trim() || 'Chưa phân công';
    if (!key) return;
    if (!buckets[key]) buckets[key] = {};
    if (!buckets[key][sales]) buckets[key][sales] = { count: 0, expectedRevenue: 0 };
    buckets[key][sales].count++;
    buckets[key][sales].expectedRevenue += Number(r.expectedRevenue || 0);
  });

  // Lấy N bucket gần nhất
  const maxN    = getMaxBuckets_(granularity);
  const allKeys = Object.keys(buckets).sort().slice(-maxN);

  return { salesList, buckets, allKeys };
}

function renderSalesTimelineChart() {
  const canvas = document.getElementById('chart-sales-timeline');
  if (!canvas || typeof Chart === 'undefined') return;

  const { salesList, buckets, allKeys } = buildSalesTimelineData(CURRENT_TIMELINE_GRANULARITY);

  if (salesTimelineChart) { salesTimelineChart.destroy(); salesTimelineChart = null; }

  if (!allKeys.length) {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    renderSalesTimelineLeaderboard(salesList, buckets, allKeys);
    return;
  }

  // Mỗi sales là 1 dataset (line)
  const datasets = salesList.map((name, i) => ({
    label: name,
    data: allKeys.map((k) => (buckets[k] && buckets[k][name] ? buckets[k][name].count : 0)),
    borderColor: SALES_PALETTE[i % SALES_PALETTE.length],
    backgroundColor: SALES_PALETTE[i % SALES_PALETTE.length] + '22',
    fill: false,
    tension: 0.35,
    pointRadius: 4,
    pointHoverRadius: 7,
    borderWidth: 2.5
  }));

  salesTimelineChart = new Chart(canvas, {
    type: 'line',
    data: { labels: allKeys, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y} báo giá`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { autoSkip: true, maxRotation: 40, minRotation: 0, font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.05)' }
        }
      }
    }
  });

  // Vẽ leaderboard + bảng chi tiết bên cạnh
  renderSalesTimelineLeaderboard(salesList, buckets, allKeys);
  renderSalesActivityTable(salesList, buckets, allKeys);
}

function renderSalesTimelineLeaderboard(salesList, buckets, allKeys) {
  const box = document.getElementById('sales-timeline-leaderboard');
  if (!box) return;

  // Tính tổng count + expectedRevenue trong kỳ đang hiển thị cho mỗi sales
  const summary = salesList.map((name, i) => {
    let count = 0, revenue = 0;
    allKeys.forEach((k) => {
      if (buckets[k] && buckets[k][name]) {
        count   += buckets[k][name].count;
        revenue += buckets[k][name].expectedRevenue;
      }
    });
    return { name, count, revenue, color: SALES_PALETTE[i % SALES_PALETTE.length] };
  }).filter((s) => s.count > 0).sort((a, b) => b.revenue - a.revenue);

  if (!summary.length) {
    box.innerHTML = '<div class="text-muted small text-center py-3">Chưa có dữ liệu.</div>';
    return;
  }

  const maxRevenue = summary[0].revenue || 1;

  box.innerHTML = summary.map((s) => {
    const pct = Math.round((s.revenue / maxRevenue) * 100);
    return `
      <div style="margin-bottom:14px;">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div class="fw-semibold small d-flex align-items-center gap-2">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0;"></span>
            ${s.name}
          </div>
          <div class="text-muted small">${s.count} báo giá</div>
        </div>
        <div class="small text-success fw-semibold mb-1">${formatVND(s.revenue)}</div>
        <div style="height:5px;border-radius:99px;background:#e5e7eb;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${s.color};border-radius:99px;transition:width .4s;"></div>
        </div>
      </div>`;
  }).join('');
}

// Segmented control Ngày / Tuần / Tháng cho biểu đồ Sales Timeline
document.addEventListener('DOMContentLoaded', () => {
  const sw = document.getElementById('sales-timeline-switch');
  if (sw) {
    sw.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      sw.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      CURRENT_TIMELINE_GRANULARITY = btn.dataset.granularity;
      renderSalesTimelineChart();
    });
  }
});

// ============================================================
// BẢNG THỐNG KÊ CHI TIẾT THEO SALES (trong tab Hoạt động Sales)
// ============================================================
function renderSalesActivityTable(salesList, buckets, allKeys) {
  const tbody = document.getElementById('sales-activity-tbody');
  if (!tbody) return;

  const allProjects = (typeof ALL_PROJECTS !== 'undefined' ? ALL_PROJECTS : []) || [];

  // Tính tổng trong kỳ (allKeys) cho mỗi sales
  const summary = salesList.map((name, i) => {
    let count = 0, expectedRevenue = 0;
    allKeys.forEach((k) => {
      if (buckets[k] && buckets[k][name]) {
        count          += buckets[k][name].count;
        expectedRevenue += buckets[k][name].expectedRevenue;
      }
    });

    // Doanh thu đã chốt: tính từ ALL_PROJECTS (không giới hạn thời gian theo key vì cần match chính xác)
    // Lấy toàn bộ dự án của sales này rồi filter theo time key đang hiển thị
    const closedRevenue = allProjects
      .filter((r) => {
        const key = getTimeKey_(r, CURRENT_TIMELINE_GRANULARITY);
        return String(r.sales || '').trim() === name &&
               allKeys.includes(key) &&
               (String(r.finalStatus || '').trim().toLowerCase() === 'đã mua hàng' ||
                String(r.finalStatus || '').trim().toLowerCase() === 'đã đặt cọc');
      })
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);

    const closingRate = count > 0
      ? Math.round((allProjects.filter((r) => {
          const key = getTimeKey_(r, CURRENT_TIMELINE_GRANULARITY);
          return String(r.sales || '').trim() === name && allKeys.includes(key) &&
                 (String(r.finalStatus || '').trim().toLowerCase() === 'đã mua hàng' ||
                  String(r.finalStatus || '').trim().toLowerCase() === 'đã đặt cọc');
        }).length / count) * 100)
      : 0;

    return { name, count, expectedRevenue, closedRevenue, closingRate, color: SALES_PALETTE[i % SALES_PALETTE.length] };
  }).filter((s) => s.count > 0).sort((a, b) => b.expectedRevenue - a.expectedRevenue);

  if (!summary.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Không có dữ liệu trong kỳ này.</td></tr>';
    return;
  }

  const totals = summary.reduce((acc, s) => {
    acc.count           += s.count;
    acc.expectedRevenue += s.expectedRevenue;
    acc.closedRevenue   += s.closedRevenue;
    return acc;
  }, { count: 0, expectedRevenue: 0, closedRevenue: 0 });
  const totalClosingRate = totals.count > 0
    ? Math.round((summary.reduce((s, r) => s + (r.closingRate * r.count), 0) / totals.count))
    : 0;

  tbody.innerHTML = summary.map((s) => `
    <tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color};flex-shrink:0;"></span>
          <span class="fw-semibold">${s.name}</span>
        </div>
      </td>
      <td class="text-center">${s.count}</td>
      <td class="text-end">${formatVND(s.expectedRevenue)}</td>
      <td class="text-end text-success fw-semibold">${formatVND(s.closedRevenue)}</td>
      <td class="text-center">
        <span class="badge" style="background:${s.closingRate >= 30 ? '#dcfce7' : '#fef3c7'};color:${s.closingRate >= 30 ? '#15803d' : '#92400e'};font-weight:600;border-radius:99px;padding:4px 10px;">
          ${s.closingRate}%
        </span>
      </td>
    </tr>`).join('') + `
    <tr class="fw-bold" style="border-top:2px solid var(--border,#e5e7eb); background:var(--bg-secondary,#f8fafc);">
      <td>Tổng cộng</td>
      <td class="text-center">${totals.count}</td>
      <td class="text-end">${formatVND(totals.expectedRevenue)}</td>
      <td class="text-end text-success">${formatVND(totals.closedRevenue)}</td>
      <td class="text-center">${totalClosingRate}%</td>
    </tr>`;
}
