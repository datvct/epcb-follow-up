// PERIODS.JS
// Cơ chế lọc & gom nhóm báo giá theo Ngày / Tuần / Tháng — dùng chung cho
// Dashboard (KPI + biểu đồ) và Báo cáo. Toàn bộ tính toán chạy ở phía
// trình duyệt dựa trên dữ liệu đã lấy về từ getProjects(), nên không cần
// sửa/deploy lại Apps Script khi thêm cơ chế lọc này.

// Các trạng thái được tính là "đã chốt" — phải khớp CLOSED_STATUSES trong backend/Config.gs
const CLOSED_STATUSES = ['Đã mua hàng', 'Đã đặt cọc'];

function startOfDay_(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Tuần bắt đầu từ Thứ 2.
function getWeekBounds_(ref) {
  const now = startOfDay_(ref || new Date());
  const day = now.getDay();
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const start = new Date(now);
  start.setDate(now.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: start, end: end };
}

function getMonthBounds_(ref) {
  const now = ref || new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: startOfDay_(start), end: startOfDay_(end) };
}

// Trả về {start, end} hoặc null (nghĩa là "tất cả", không giới hạn).
function getPeriodBounds(periodKey) {
  const today = startOfDay_(new Date());
  if (periodKey === 'today') return { start: today, end: today };
  if (periodKey === 'week') return getWeekBounds_(today);
  if (periodKey === 'month') return getMonthBounds_(today);
  return null;
}

function formatDateVN_(d) {
  return new Intl.DateTimeFormat('vi-VN').format(d);
}

// Chuỗi mô tả khoảng thời gian đang xem, hiển thị cạnh bộ lọc.
function describePeriod(periodKey) {
  const bounds = getPeriodBounds(periodKey);
  if (!bounds) return 'Toàn bộ dữ liệu';
  if (periodKey === 'today') return 'Hôm nay, ' + formatDateVN_(bounds.start);
  return formatDateVN_(bounds.start) + ' – ' + formatDateVN_(bounds.end);
}

// Lọc danh sách báo giá theo "Ngày báo giá" (quoteDate) nằm trong khoảng thời gian.
function filterByPeriod(rows, periodKey) {
  const bounds = getPeriodBounds(periodKey);
  if (!bounds) return rows;
  return rows.filter(function (r) {
    if (!r.quoteDate) return false;
    const d = startOfDay_(new Date(r.quoteDate));
    return d >= bounds.start && d <= bounds.end;
  });
}

// Tính KPI tổng hợp cho 1 tập báo giá — logic khớp getDashboardData() ở backend/Dashboard.gs
function computeKPIs(rows) {
  const totalOpportunity = rows.reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  const expectedRevenue = rows.reduce(function (s, r) { return s + Number(r.expectedRevenue || 0); }, 0);
  const closedRevenue = rows
    .filter(function (r) { return CLOSED_STATUSES.indexOf(r.finalStatus) > -1; })
    .reduce(function (s, r) { return s + Number(r.amount || 0); }, 0);
  const closingRate = totalOpportunity > 0 ? closedRevenue / totalOpportunity : 0;

  const statusCount = {};
  rows.forEach(function (r) {
    const key = r.currentStatus || 'Không xác định';
    statusCount[key] = (statusCount[key] || 0) + 1;
  });

  return {
    totalOpportunity: totalOpportunity,
    expectedRevenue: expectedRevenue,
    closedRevenue: closedRevenue,
    closingRate: closingRate,
    totalQuotes: rows.length,
    statusCount: statusCount
  };
}

// Gom nhóm chung — trả về mảng {label, totalQuotes, expectedRevenue, closedRevenue} sắp theo label.
function groupRowsBy_(rows, keyFn) {
  const grouped = {};
  rows.forEach(function (r) {
    const key = keyFn(r) || 'Không xác định';
    if (!grouped[key]) grouped[key] = { label: key, totalQuotes: 0, expectedRevenue: 0, closedRevenue: 0 };
    grouped[key].totalQuotes += 1;
    grouped[key].expectedRevenue += Number(r.expectedRevenue || 0);
    if (CLOSED_STATUSES.indexOf(r.finalStatus) > -1) {
      grouped[key].closedRevenue += Number(r.amount || 0);
    }
  });
  return Object.values(grouped).sort(function (a, b) { return String(a.label).localeCompare(String(b.label)); });
}

function groupByDay(rows) {
  return groupRowsBy_(rows, function (r) { return r.quoteDate || ''; });
}

function groupByWeek(rows) {
  // "week" đã được backend tự tính sẵn theo định dạng yyyy-MM - Tuần n.
  return groupRowsBy_(rows, function (r) { return r.week || ''; });
}

function groupByMonth(rows) {
  return groupRowsBy_(rows, function (r) { return r.quoteDate ? String(r.quoteDate).slice(0, 7) : ''; });
}

function groupBySales(rows) {
  return groupRowsBy_(rows, function (r) { return r.sales || ''; });
}

// Lấy N nhóm gần nhất theo thời gian (đã sắp xếp tăng dần theo label) để vẽ biểu đồ xu hướng.
function lastBuckets(groups, n) {
  return groups.slice(-n);
}

function groupByCustomer(rows) {
  return groupRowsBy_(rows, function (r) { return r.customerName || ''; });
}
