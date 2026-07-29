// CUSTOMERS.JS
// Modal cập nhật thông tin khách hàng (gọi từ bất kỳ đâu — không cần tab riêng).

let modalUpdateCustomer;

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("modal-update-customer")) {
    modalUpdateCustomer = new bootstrap.Modal(
      document.getElementById("modal-update-customer"),
    );
  }

  const formUpdateCustomer = document.getElementById("form-update-customer");
  if (formUpdateCustomer) {
    formUpdateCustomer.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = Object.fromEntries(new FormData(e.target).entries());

      // Lưu dữ liệu gốc để phục hồi nếu sync lỗi
      const originalCustomer = ALL_CUSTOMERS.find(function (c) {
        return String(c.customerId).trim().toLowerCase() === String(form.customerId).trim().toLowerCase();
      });
      const originalData = originalCustomer ? Object.assign({}, originalCustomer) : null;

      // Cập nhật optimistically trong bộ nhớ
      if (originalCustomer) {
        originalCustomer.customerName = form.customerName;
        originalCustomer.companyName = form.companyName || '';
        originalCustomer.phone = form.phone || '';
        originalCustomer.email = form.email || '';
        originalCustomer.note = form.note || '';
        if (typeof initTomSelect === 'function') initTomSelect();
      }

      modalUpdateCustomer.hide();
      toast("Đã cập nhật thông tin khách hàng — đang đồng bộ lên máy chủ...");

      SyncQueue.enqueue({
        tempId: form.customerId,
        action: 'updateCustomer',
        payload: form,
        onSuccess: function (_res) {
          toast('Đã đồng bộ thông tin khách hàng lên máy chủ.');
        },
        onError: function (err) {
          // Phục hồi dữ liệu gốc
          if (originalData) {
            const c = ALL_CUSTOMERS.find(function (x) {
              return String(x.customerId).trim().toLowerCase() === String(form.customerId).trim().toLowerCase();
            });
            if (c) {
              Object.assign(c, originalData);
            }
            if (typeof initTomSelect === 'function') initTomSelect();
          }
          toast('Lỗi đồng bộ: ' + err.message + ' — dữ liệu đã được khôi phục.', 'warning');
        }
      });
    });
  }
});

function openUpdateCustomerModal(idOrName) {
  const q = String(idOrName).trim().toLowerCase();
  const c = ALL_CUSTOMERS.find((x) => String(x.customerId).trim().toLowerCase() === q)
    || ALL_CUSTOMERS.find((x) => String(x.customerName).trim().toLowerCase() === q)
    || ALL_CUSTOMERS.find((x) => String(x.companyName || "").trim().toLowerCase() === q);
  if (!c) {
    toast("Không tìm thấy khách hàng này.", "warning");
    return;
  }
  const form = document.getElementById("form-update-customer");
  if (!form) return;
  form.customerId.value = c.customerId || "";
  form.customerName.value = c.customerName || "";
  form.companyName.value = c.companyName || "";
  form.phone.value = c.phone || "";
  form.email.value = c.email || "";
  form.note.value = c.note || "";
  const taxCodeDisplay = document.getElementById("display-customer-taxcode");
  if (taxCodeDisplay) taxCodeDisplay.value = c.customerId || "";
  modalUpdateCustomer.show();
}

function formatDateVN(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("vi-VN");
}
