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
      const btn =
        document.querySelector(
          'button[type="submit"][form="form-update-customer"]',
        ) || formUpdateCustomer.querySelector('button[type="submit"]');
      const originalText = btn.innerHTML;

      try {
        btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Đang lưu...';
        btn.disabled = true;

        await callApi("updateCustomer", form);
        toast("Cập nhật thông tin khách hàng thành công!");
        modalUpdateCustomer.hide();
        await reloadAll();
      } catch (err) {
        toast("Lỗi: " + err.message, "danger");
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
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
