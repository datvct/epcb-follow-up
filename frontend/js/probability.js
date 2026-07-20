// PROBABILITY.JS
// Quản lý việc đọc/ghi bảng cấu hình tỉ lệ xác suất chốt

let PROBABILITY_MAP_CACHE = [];

async function loadProbabilityTab() {
  showLoading(true);
  try {
    const data = await callApi('getProbabilityMapping');
    PROBABILITY_MAP_CACHE = data;
    renderProbabilityTable(data);
  } catch (err) {
    toast('Lỗi tải cấu hình xác suất: ' + err.message, 'danger');
  } finally {
    showLoading(false);
  }
}

function renderProbabilityTable(mapping) {
  const tbody = document.getElementById('probability-tbody');
  if (!mapping || !mapping.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-4">Không tìm thấy cấu hình xác suất.</td></tr>';
    return;
  }

  tbody.innerHTML = mapping.map((m, index) => {
    // Chuyển đổi số thập phân sang phần trăm (VD: 0.3 -> 30)
    const pctValue = Math.round(Number(m.probability || 0) * 100);
    
    return `
      <tr>
        <td>
          <input type="hidden" name="status_${index}" value="${m.status}">
          <span class="status-badge ${statusClass(m.status)}">${m.status}</span>
        </td>
        <td>
          <div class="input-group input-group-sm">
            <input type="number" class="form-control" name="probability_${index}" value="${pctValue}" min="0" max="100" required>
            <span class="input-group-text">%</span>
          </div>
        </td>
        <td>
          <input type="text" class="form-control form-control-sm" name="note_${index}" value="${m.note || ''}" placeholder="Nhập ghi chú giải thích...">
        </td>
      </tr>
    `;
  }).join('');
}

// Xử lý sự kiện lưu cấu hình xác suất
document.getElementById('form-probability-mapping').addEventListener('submit', async (e) => {
  e.preventDefault();
  showLoading(true);
  
  const payload = [];
  PROBABILITY_MAP_CACHE.forEach((m, index) => {
    const probInput = document.querySelector(`[name="probability_${index}"]`);
    const noteInput = document.querySelector(`[name="note_${index}"]`);
    if (probInput) {
      // Chuyển lại từ phần trăm về số thập phân (VD: 30 -> 0.30)
      const val = Number(probInput.value) / 100;
      payload.push({
        status: m.status,
        probability: val,
        note: noteInput ? noteInput.value : ''
      });
    }
  });

  try {
    const res = await callApi('updateProbabilityMapping', payload);
    toast(res.message || 'Đã lưu cấu hình xác suất mới.');
    // Tải lại toàn bộ dữ liệu dự án vì doanh thu kỳ vọng của các dự án đã thay đổi!
    await reloadAll();
  } catch (err) {
    toast('Lỗi lưu cấu hình: ' + err.message, 'danger');
  } finally {
    showLoading(false);
  }
});
