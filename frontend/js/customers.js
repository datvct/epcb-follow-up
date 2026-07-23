// CUSTOMERS.JS
// Quản lý hiển thị danh sách Khách hàng và Cập nhật Khách hàng

const customerTbody = document.getElementById('customer-list-tbody');
const filterCustomerName = document.getElementById('filter-customer-name');
let modalUpdateCustomer;

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('modal-update-customer')) {
    modalUpdateCustomer = new bootstrap.Modal(document.getElementById('modal-update-customer'));
  }

  if (filterCustomerName) {
    filterCustomerName.addEventListener('input', renderCustomerTable);
  }

  const formUpdateCustomer = document.getElementById('form-update-customer');
  if (formUpdateCustomer) {
    formUpdateCustomer.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = Object.fromEntries(new FormData(e.target).entries());
      const btn = document.querySelector('button[type="submit"][form="form-update-customer"]') || formUpdateCustomer.querySelector('button[type="submit"]');
      const originalText = btn.innerHTML;
      
      try {
        btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Đang lưu...';
        btn.disabled = true;
        
        await callApi('updateCustomer', form);
        toast('Cập nhật thông tin khách hàng thành công!');
        modalUpdateCustomer.hide();
        await reloadAll(); // Tải lại toàn bộ dữ liệu mới nhất
      } catch (err) {
        toast('Lỗi: ' + err.message, 'danger');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });
  }
});

function renderCustomerTable() {
  if (!customerTbody) return;
  
  let list = ALL_CUSTOMERS || [];
  const query = filterCustomerName.value.trim().toLowerCase();
  
  if (query) {
    list = list.filter(c => 
      String(c.customerName).toLowerCase().includes(query) ||
      String(c.companyName || '').toLowerCase().includes(query) ||
      String(c.phone).toLowerCase().includes(query) ||
      String(c.email).toLowerCase().includes(query) ||
      String(c.customerId).toLowerCase().includes(query)
    );
  }

  customerTbody.innerHTML = '';
  if (list.length === 0) {
    customerTbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Không tìm thấy khách hàng nào.</td></tr>';
    return;
  }

  list.forEach(c => {
    const tr = document.createElement('tr');
    const noteDisplay = c.note ? String(c.note) : '';
    tr.innerHTML = `
      <td><span class="badge bg-secondary">${c.customerId}</span></td>
      <td class="fw-bold">${c.customerName || ''}</td>
      <td>${c.companyName || '-'}</td>
      <td>${c.phone || '-'}</td>
      <td>${c.email || '-'}</td>
      <td class="small" style="max-width: 220px; white-space: normal;">${noteDisplay || '<span class="text-muted">-</span>'}</td>
      <td class="small text-muted">${formatDateVN(c.updatedAt)}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary btn-edit-customer" data-id="${c.customerId}">
          <i class="ti ti-edit"></i> Sửa
        </button>
      </td>
    `;
    customerTbody.appendChild(tr);
  });

  document.querySelectorAll('.btn-edit-customer').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      openUpdateCustomerModal(id);
    });
  });
}

function openUpdateCustomerModal(id) {
  const c = ALL_CUSTOMERS.find(x => String(x.customerId) === String(id));
  if (!c) return;
  const form = document.getElementById('form-update-customer');
  if (!form) return;
  form.customerId.value = c.customerId || '';
  form.customerName.value = c.customerName || '';
  form.companyName.value = c.companyName || '';
  form.phone.value = c.phone || '';
  form.email.value = c.email || '';
  form.note.value = c.note || '';
  const taxCodeDisplay = document.getElementById('display-customer-taxcode');
  if (taxCodeDisplay) taxCodeDisplay.value = c.customerId || '';
  modalUpdateCustomer.show();
}

function formatDateVN(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('vi-VN');
}
